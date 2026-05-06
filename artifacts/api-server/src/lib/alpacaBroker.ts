import { logger } from "./logger";

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
