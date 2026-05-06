import { db, brokersTable, tradesTable, positionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import type { OptionsContract } from "./marketData";

const OPTIONS_MULTIPLIER = 100;

const ALPACA_PAPER_BASE = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_BASE = "https://api.alpaca.markets";
const ALPACA_DATA_BASE = "https://data.alpaca.markets";

export interface AlpacaAccount {
  id: string;
  accountNumber: string;
  equity: number;
  buyingPower: number;
  cash: number;
  status: string;
  isPaper: boolean;
}

function brokerBase(isPaper: boolean) {
  return isPaper ? ALPACA_PAPER_BASE : ALPACA_LIVE_BASE;
}

function alpacaHeaders(apiKey: string, apiSecret: string) {
  return {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": apiSecret,
    "Content-Type": "application/json",
  };
}

// ─── Account ─────────────────────────────────────────────────────────────────

export async function getAlpacaAccount(
  apiKey: string,
  apiSecret: string,
  isPaper: boolean,
): Promise<AlpacaAccount | null> {
  try {
    const resp = await fetch(`${brokerBase(isPaper)}/v2/account`, {
      headers: alpacaHeaders(apiKey, apiSecret),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status, isPaper }, "Alpaca account fetch failed");
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await resp.json() as any;
    return {
      id: data.id,
      accountNumber: data.account_number,
      equity: parseFloat(data.equity ?? "0"),
      buyingPower: parseFloat(data.buying_power ?? "0"),
      cash: parseFloat(data.cash ?? "0"),
      status: data.status,
      isPaper,
    };
  } catch (err) {
    logger.error({ err }, "Alpaca account fetch threw");
    return null;
  }
}

// ─── Option Quotes (live bid/ask) ─────────────────────────────────────────────
//
// Uses Alpaca's market data API which provides real-time option quotes.
//

export interface AlpacaOptionQuote {
  bid: number | null;
  ask: number | null;
  mark: number;
  bidSize: number;
  askSize: number;
  timestamp: string;
}

export async function getAlpacaOptionQuotes(
  symbols: string[],
  apiKey: string,
  apiSecret: string,
): Promise<Record<string, AlpacaOptionQuote>> {
  if (symbols.length === 0) return {};

  try {
    const params = new URLSearchParams({
      symbols: symbols.join(","),
      feed: "indicative",
    });
    const resp = await fetch(`${ALPACA_DATA_BASE}/v1beta1/options/quotes/latest?${params}`, {
      headers: alpacaHeaders(apiKey, apiSecret),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Alpaca option quotes failed");
      return {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await resp.json() as { quotes: Record<string, any> };
    const result: Record<string, AlpacaOptionQuote> = {};

    for (const symbol of symbols) {
      const q = data.quotes?.[symbol];
      if (!q) continue;
      const bid = q.bp > 0 ? (q.bp as number) : null;
      const ask = q.ap > 0 ? (q.ap as number) : null;
      result[symbol] = {
        bid,
        ask,
        mark: bid && ask ? (bid + ask) / 2 : (q.bp ?? q.ap ?? 0),
        bidSize: q.bs ?? 0,
        askSize: q.as ?? 0,
        timestamp: q.t ?? "",
      };
    }

    logger.info({ count: Object.keys(result).length }, "Alpaca option quotes fetched");
    return result;
  } catch (err) {
    logger.error({ err }, "Alpaca option quotes threw");
    return {};
  }
}

// ─── Place Order ─────────────────────────────────────────────────────────────

export async function placeAlpacaOrder(opts: {
  apiKey: string;
  apiSecret: string;
  isPaper: boolean;
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  orderType?: "market" | "limit";
  limitPrice?: number;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const body = {
    symbol: opts.symbol,
    qty: opts.qty,
    side: opts.side,
    type: opts.orderType ?? "market",
    time_in_force: "day",
    ...(opts.limitPrice ? { limit_price: opts.limitPrice.toFixed(2) } : {}),
  };

  const resp = await fetch(`${brokerBase(opts.isPaper)}/v2/orders`, {
    method: "POST",
    headers: alpacaHeaders(opts.apiKey, opts.apiSecret),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    logger.error({ status: resp.status, body: text, symbol: opts.symbol }, "Alpaca order failed");
    return { success: false, error: text };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = await resp.json() as any;
  logger.info({ orderId: order.id, symbol: opts.symbol, side: opts.side }, "Alpaca order placed");
  return { success: true, orderId: order.id };
}

// ─── Alpaca Position Marks ────────────────────────────────────────────────────

/**
 * Returns Alpaca's official current_price for every open position.
 * This matches exactly what Alpaca shows in their UI — more accurate than (bid+ask)/2.
 */
export async function getAlpacaPositionMarks(
  apiKey: string,
  apiSecret: string,
  isPaper: boolean,
): Promise<Record<string, number>> {
  try {
    const resp = await fetch(`${brokerBase(isPaper)}/v2/positions`, {
      headers: alpacaHeaders(apiKey, apiSecret),
    });
    if (!resp.ok) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = await resp.json() as any[];
    const result: Record<string, number> = {};
    for (const pos of positions) {
      if (pos.symbol && pos.current_price) {
        result[pos.symbol as string] = parseFloat(pos.current_price as string);
      }
    }
    logger.info({ count: Object.keys(result).length }, "Alpaca position marks fetched");
    return result;
  } catch (err) {
    logger.warn({ err }, "Alpaca position marks fetch failed");
    return {};
  }
}

/**
 * Syncs every Alpaca position in our DB with Alpaca's official current_price and equity.
 * Call this at the end of each trading cycle instead of updatePaperPositionPrices.
 */
export async function syncAlpacaPositionPrices(broker: AlpacaBrokerRecord): Promise<void> {
  const apiKey = broker.apiKey ?? "";
  const apiSecret = broker.apiSecret ?? "";
  const isPaper = alpacaIsPaper(broker);

  const marks = await getAlpacaPositionMarks(apiKey, apiSecret, isPaper);
  if (Object.keys(marks).length === 0) return;

  const positions = await db.select().from(positionsTable).where(eq(positionsTable.brokerId, broker.id));
  for (const pos of positions) {
    const symbol = pos.contractSymbol ?? pos.symbol;
    const currentPrice = marks[symbol];
    if (!currentPrice || currentPrice <= 0) continue;

    const qty = parseFloat(pos.quantity);
    const entry = parseFloat(pos.entryPrice);
    const multiplier = pos.assetType === "options" ? OPTIONS_MULTIPLIER : 1;
    const marketValue = qty * currentPrice * multiplier;
    const unrealizedPnl = (currentPrice - entry) * qty * multiplier;
    const unrealizedPnlPercent = entry > 0 ? ((currentPrice - entry) / entry) * 100 : 0;

    await db.update(positionsTable)
      .set({ currentPrice: String(currentPrice), marketValue: String(marketValue), unrealizedPnl: String(unrealizedPnl), unrealizedPnlPercent: String(unrealizedPnlPercent) })
      .where(eq(positionsTable.id, pos.id));
  }

  const account = await getAlpacaAccount(apiKey, apiSecret, isPaper);
  if (account) {
    await db.update(brokersTable)
      .set({ accountValue: String(account.equity), buyingPower: String(account.buyingPower) })
      .where(eq(brokersTable.id, broker.id));
  }
}

// ─── Alpaca Options Execution (buy + sell with DB tracking) ──────────────────

type AlpacaBrokerRecord = { id: number; apiKey: string | null; apiSecret: string | null; accountId: string | null };

function alpacaIsPaper(broker: AlpacaBrokerRecord): boolean {
  return !broker.accountId || broker.accountId.startsWith("paper");
}

/**
 * Place a real options buy order on Alpaca and track the position in our DB.
 * Mirrors executePaperBuyOption but routes through the Alpaca API.
 */
export async function executeAlpacaBuyOption(
  broker: AlpacaBrokerRecord,
  strategyId: number,
  contract: OptionsContract,
  contracts = 1,
): Promise<{ executed: boolean; contracts: number; cost: number; contractSymbol: string; orderId?: string }> {
  const apiKey = broker.apiKey ?? "";
  const apiSecret = broker.apiSecret ?? "";
  const isPaper = alpacaIsPaper(broker);

  const premiumPerShare = contract.midPrice > 0 ? contract.midPrice : contract.lastPrice;
  const totalCost = premiumPerShare * OPTIONS_MULTIPLIER * contracts;

  if (totalCost < 1) {
    logger.warn({ contract: contract.contractSymbol }, "Alpaca: option price too low — skipping");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  // Check buying power from Alpaca account
  const account = await getAlpacaAccount(apiKey, apiSecret, isPaper);
  if (!account || account.buyingPower < totalCost) {
    logger.info({ totalCost, buyingPower: account?.buyingPower }, "Alpaca: insufficient buying power for option");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  // Don't duplicate a contract already held in our DB
  const [alreadyHeld] = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.brokerId, broker.id), eq(positionsTable.contractSymbol, contract.contractSymbol)));
  if (alreadyHeld) {
    logger.info({ contractSymbol: contract.contractSymbol }, "Alpaca: contract already held — skipping");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  // Place the order on Alpaca
  const order = await placeAlpacaOrder({ apiKey, apiSecret, isPaper, symbol: contract.contractSymbol, qty: contracts, side: "buy", orderType: "market" });
  if (!order.success) {
    logger.error({ contract: contract.contractSymbol, error: order.error }, "Alpaca buy order failed");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  // Poll for the actual fill price — market orders on Alpaca paper fill within a few seconds
  let fillPrice = premiumPerShare;
  if (order.orderId) {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const orderResp = await fetch(`${brokerBase(isPaper)}/v2/orders/${order.orderId}`, { headers: alpacaHeaders(apiKey, apiSecret) });
        if (orderResp.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const o = await orderResp.json() as any;
          if (o.filled_avg_price) {
            fillPrice = parseFloat(o.filled_avg_price);
            logger.info({ orderId: order.orderId, fillPrice, symbol: contract.contractSymbol }, "Alpaca order fill price confirmed");
            break;
          }
        }
      } catch { /* ignore, use midPrice fallback */ }
    }
  }

  const actualCost = fillPrice * OPTIONS_MULTIPLIER * contracts;

  // Track in our DB using the real fill price
  await db.insert(tradesTable).values({
    brokerId: broker.id,
    strategyId,
    symbol: "SPY",
    assetType: "options",
    side: "buy",
    quantity: String(contracts),
    entryPrice: String(fillPrice),
    status: "open",
    optionType: contract.optionType,
    contractSymbol: contract.contractSymbol,
    strike: String(contract.strike),
    expiry: contract.expiry,
    notes: `Alpaca ${isPaper ? "paper" : "live"} order ${order.orderId} — ${contract.optionType.toUpperCase()} $${contract.strike} exp ${contract.expiry.toISOString().slice(0, 10)}`,
    openedAt: new Date(),
  });

  await db.insert(positionsTable).values({
    brokerId: broker.id,
    strategyId,
    symbol: "SPY",
    assetType: "options",
    side: contract.optionType === "call" ? "long_call" : "long_put",
    quantity: String(contracts),
    entryPrice: String(fillPrice),
    currentPrice: String(fillPrice),
    marketValue: String(actualCost),
    unrealizedPnl: "0",
    unrealizedPnlPercent: "0",
    optionType: contract.optionType,
    contractSymbol: contract.contractSymbol,
    strike: String(contract.strike),
    expiry: contract.expiry,
  });

  // Refresh account data in DB from Alpaca
  const fresh = await getAlpacaAccount(apiKey, apiSecret, isPaper);
  if (fresh) {
    await db.update(brokersTable)
      .set({ buyingPower: String(fresh.buyingPower), accountValue: String(fresh.equity) })
      .where(eq(brokersTable.id, broker.id));
  }

  logger.info({ contractSymbol: contract.contractSymbol, contracts, actualCost, fillPrice, orderId: order.orderId }, "Alpaca BUY OPTION executed");
  return { executed: true, contracts, cost: actualCost, contractSymbol: contract.contractSymbol, orderId: order.orderId };
}

/**
 * Close an open options position by DB position ID via a real Alpaca sell order.
 * Mirrors executePaperSellOptionById but routes through the Alpaca API.
 */
export async function executeAlpacaSellOptionById(
  broker: AlpacaBrokerRecord,
  positionId: number,
  currentPremium: number,
): Promise<{ executed: boolean; realizedPnl: number; realizedPnlPercent: number; contractSymbol: string }> {
  const apiKey = broker.apiKey ?? "";
  const apiSecret = broker.apiSecret ?? "";
  const isPaper = alpacaIsPaper(broker);

  const [position] = await db.select().from(positionsTable).where(eq(positionsTable.id, positionId));
  if (!position) return { executed: false, realizedPnl: 0, realizedPnlPercent: 0, contractSymbol: "" };

  const contractSymbol = position.contractSymbol ?? "";
  const contracts = parseFloat(position.quantity);
  const entryPrice = parseFloat(position.entryPrice);
  const proceeds = contracts * currentPremium * OPTIONS_MULTIPLIER;
  const cost = contracts * entryPrice * OPTIONS_MULTIPLIER;
  const realizedPnl = proceeds - cost;
  const realizedPnlPercent = entryPrice > 0 ? ((currentPremium - entryPrice) / entryPrice) * 100 : 0;

  // Place the sell on Alpaca
  const order = await placeAlpacaOrder({ apiKey, apiSecret, isPaper, symbol: contractSymbol, qty: contracts, side: "sell", orderType: "market" });
  if (!order.success) {
    logger.error({ contractSymbol, error: order.error }, "Alpaca sell order failed");
    return { executed: false, realizedPnl: 0, realizedPnlPercent: 0, contractSymbol };
  }

  // Close in our DB
  const [openTrade] = await db
    .select()
    .from(tradesTable)
    .where(and(eq(tradesTable.brokerId, broker.id), eq(tradesTable.contractSymbol, contractSymbol), eq(tradesTable.status, "open")));

  if (openTrade) {
    await db.update(tradesTable)
      .set({ exitPrice: String(currentPremium), realizedPnl: String(realizedPnl), realizedPnlPercent: String(realizedPnlPercent), status: "closed", closedAt: new Date() })
      .where(eq(tradesTable.id, openTrade.id));
  }

  await db.delete(positionsTable).where(eq(positionsTable.id, positionId));

  // Refresh account data from Alpaca
  const fresh = await getAlpacaAccount(apiKey, apiSecret, isPaper);
  if (fresh) {
    await db.update(brokersTable)
      .set({ buyingPower: String(fresh.buyingPower), accountValue: String(fresh.equity) })
      .where(eq(brokersTable.id, broker.id));
  }

  logger.info({ contractSymbol, contracts, proceeds, pnl: realizedPnl, orderId: order.orderId }, "Alpaca SELL OPTION executed");
  return { executed: true, realizedPnl, realizedPnlPercent, contractSymbol };
}
