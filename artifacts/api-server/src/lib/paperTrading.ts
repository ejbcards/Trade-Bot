import { db, brokersTable, tradesTable, positionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import type { OptionsContract } from "./marketData";

export const PAPER_BROKER_TYPE = "paper";
const PAPER_STARTING_CASH = 100_000;
const OPTIONS_MULTIPLIER = 100; // 1 contract = 100 shares

export async function ensurePaperBroker(): Promise<number> {
  const [existing] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.brokerType, PAPER_BROKER_TYPE));

  if (existing) return existing.id;

  const [created] = await db
    .insert(brokersTable)
    .values({
      name: "Paper Trading",
      brokerType: PAPER_BROKER_TYPE,
      status: "connected",
      isActive: true,
      accountValue: String(PAPER_STARTING_CASH),
      buyingPower: String(PAPER_STARTING_CASH),
    })
    .returning();

  logger.info({ brokerId: created.id }, "Paper trading broker initialized with $100,000");
  return created.id;
}

export async function getPaperBuyingPower(brokerId: number): Promise<number> {
  const [broker] = await db.select().from(brokersTable).where(eq(brokersTable.id, brokerId));
  return parseFloat(broker?.buyingPower ?? "0");
}

// ─── Stock paper trading ──────────────────────────────────────────────────

export async function executePaperBuy(
  brokerId: number,
  strategyId: number,
  symbol: string,
  currentPrice: number,
  maxPositionSize: number,
): Promise<{ executed: boolean; quantity: number; cost: number }> {
  const buyingPower = await getPaperBuyingPower(brokerId);
  if (buyingPower < currentPrice) {
    logger.info({ symbol, buyingPower }, "Insufficient paper buying power");
    return { executed: false, quantity: 0, cost: 0 };
  }

  const [existing] = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.brokerId, brokerId),
        eq(positionsTable.symbol, symbol),
        eq(positionsTable.strategyId, strategyId),
      ),
    );

  if (existing) {
    logger.info({ symbol }, "Position already open — skipping paper buy");
    return { executed: false, quantity: 0, cost: 0 };
  }

  const tradeAmount = Math.min(maxPositionSize, buyingPower);
  const quantity = Math.floor(tradeAmount / currentPrice);
  if (quantity < 1) return { executed: false, quantity: 0, cost: 0 };

  const cost = quantity * currentPrice;

  await db.insert(tradesTable).values({
    brokerId,
    strategyId,
    symbol,
    assetType: "stocks",
    side: "buy",
    quantity: String(quantity),
    entryPrice: String(currentPrice),
    status: "open",
    notes: "Paper trade — GoldenMoose simulator",
    openedAt: new Date(),
  });

  await db.insert(positionsTable).values({
    brokerId,
    strategyId,
    symbol,
    assetType: "stocks",
    side: "long",
    quantity: String(quantity),
    entryPrice: String(currentPrice),
    currentPrice: String(currentPrice),
    marketValue: String(cost),
    unrealizedPnl: "0",
    unrealizedPnlPercent: "0",
  });

  const newBuyingPower = buyingPower - cost;
  await db.update(brokersTable).set({ buyingPower: String(newBuyingPower) }).where(eq(brokersTable.id, brokerId));

  logger.info({ symbol, quantity, cost, price: currentPrice }, "Paper BUY executed");
  return { executed: true, quantity, cost };
}

export async function executePaperSell(
  brokerId: number,
  strategyId: number,
  symbol: string,
  currentPrice: number,
): Promise<{ executed: boolean; realizedPnl: number; realizedPnlPercent: number }> {
  const [position] = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.brokerId, brokerId),
        eq(positionsTable.symbol, symbol),
        eq(positionsTable.strategyId, strategyId),
      ),
    );

  if (!position) {
    logger.info({ symbol }, "No open position to sell");
    return { executed: false, realizedPnl: 0, realizedPnlPercent: 0 };
  }

  const quantity = parseFloat(position.quantity);
  const entryPrice = parseFloat(position.entryPrice);
  const proceeds = quantity * currentPrice;
  const realizedPnl = proceeds - quantity * entryPrice;
  const realizedPnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

  const [openTrade] = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.brokerId, brokerId),
        eq(tradesTable.symbol, symbol),
        eq(tradesTable.strategyId, strategyId),
        eq(tradesTable.status, "open"),
      ),
    );

  if (openTrade) {
    await db
      .update(tradesTable)
      .set({
        exitPrice: String(currentPrice),
        realizedPnl: String(realizedPnl),
        realizedPnlPercent: String(realizedPnlPercent),
        status: "closed",
        closedAt: new Date(),
      })
      .where(eq(tradesTable.id, openTrade.id));
  }

  await db.delete(positionsTable).where(eq(positionsTable.id, position.id));

  const buyingPower = await getPaperBuyingPower(brokerId);
  await db
    .update(brokersTable)
    .set({ buyingPower: String(buyingPower + proceeds) })
    .where(eq(brokersTable.id, brokerId));

  logger.info({ symbol, quantity, proceeds, pnl: realizedPnl, price: currentPrice }, "Paper SELL executed");
  return { executed: true, realizedPnl, realizedPnlPercent };
}

// ─── Options paper trading ────────────────────────────────────────────────

export async function executePaperBuyOption(
  brokerId: number,
  strategyId: number,
  contract: OptionsContract,
  contracts = 1,
): Promise<{ executed: boolean; contracts: number; cost: number; contractSymbol: string }> {
  const premiumPerShare = contract.midPrice > 0 ? contract.midPrice : contract.lastPrice;
  const costPerContract = premiumPerShare * OPTIONS_MULTIPLIER;
  const totalCost = costPerContract * contracts;

  if (totalCost < 1) {
    logger.warn({ contract: contract.contractSymbol }, "Option price too low or zero — skipping");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  const buyingPower = await getPaperBuyingPower(brokerId);
  if (buyingPower < totalCost) {
    logger.info({ totalCost, buyingPower }, "Insufficient paper buying power for option");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  // Only one options position per strategy at a time
  const [existing] = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.brokerId, brokerId),
        eq(positionsTable.symbol, "SPY"),
        eq(positionsTable.strategyId, strategyId),
        eq(positionsTable.assetType, "options"),
      ),
    );

  if (existing) {
    logger.info({ symbol: "SPY" }, "Options position already open — skipping paper buy");
    return { executed: false, contracts: 0, cost: 0, contractSymbol: contract.contractSymbol };
  }

  await db.insert(tradesTable).values({
    brokerId,
    strategyId,
    symbol: "SPY",
    assetType: "options",
    side: "buy",
    quantity: String(contracts),
    entryPrice: String(premiumPerShare),
    status: "open",
    optionType: contract.optionType,
    contractSymbol: contract.contractSymbol,
    strike: String(contract.strike),
    expiry: contract.expiry,
    notes: `Paper options trade — ${contract.optionType.toUpperCase()} $${contract.strike} exp ${contract.expiry.toISOString().slice(0, 10)}`,
    openedAt: new Date(),
  });

  await db.insert(positionsTable).values({
    brokerId,
    strategyId,
    symbol: "SPY",
    assetType: "options",
    side: contract.optionType === "call" ? "long_call" : "long_put",
    quantity: String(contracts),
    entryPrice: String(premiumPerShare),
    currentPrice: String(premiumPerShare),
    marketValue: String(totalCost),
    unrealizedPnl: "0",
    unrealizedPnlPercent: "0",
    optionType: contract.optionType,
    contractSymbol: contract.contractSymbol,
    strike: String(contract.strike),
    expiry: contract.expiry,
  });

  await db
    .update(brokersTable)
    .set({ buyingPower: String(buyingPower - totalCost) })
    .where(eq(brokersTable.id, brokerId));

  logger.info(
    { contractSymbol: contract.contractSymbol, contracts, totalCost, premium: premiumPerShare },
    `Paper BUY OPTION — ${contract.optionType.toUpperCase()}`,
  );
  return { executed: true, contracts, cost: totalCost, contractSymbol: contract.contractSymbol };
}

export async function executePaperSellOption(
  brokerId: number,
  strategyId: number,
  currentPremium: number,
): Promise<{ executed: boolean; realizedPnl: number; realizedPnlPercent: number; contractSymbol: string }> {
  const [position] = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.brokerId, brokerId),
        eq(positionsTable.symbol, "SPY"),
        eq(positionsTable.strategyId, strategyId),
        eq(positionsTable.assetType, "options"),
      ),
    );

  if (!position) {
    return { executed: false, realizedPnl: 0, realizedPnlPercent: 0, contractSymbol: "" };
  }

  const contracts = parseFloat(position.quantity);
  const entryPrice = parseFloat(position.entryPrice);
  const proceeds = contracts * currentPremium * OPTIONS_MULTIPLIER;
  const cost = contracts * entryPrice * OPTIONS_MULTIPLIER;
  const realizedPnl = proceeds - cost;
  const realizedPnlPercent = ((currentPremium - entryPrice) / entryPrice) * 100;
  const contractSymbol = position.contractSymbol ?? "";

  const [openTrade] = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        eq(tradesTable.brokerId, brokerId),
        eq(tradesTable.symbol, "SPY"),
        eq(tradesTable.strategyId, strategyId),
        eq(tradesTable.assetType, "options"),
        eq(tradesTable.status, "open"),
      ),
    );

  if (openTrade) {
    await db
      .update(tradesTable)
      .set({
        exitPrice: String(currentPremium),
        realizedPnl: String(realizedPnl),
        realizedPnlPercent: String(realizedPnlPercent),
        status: "closed",
        closedAt: new Date(),
      })
      .where(eq(tradesTable.id, openTrade.id));
  }

  await db.delete(positionsTable).where(eq(positionsTable.id, position.id));

  const buyingPower = await getPaperBuyingPower(brokerId);
  await db
    .update(brokersTable)
    .set({ buyingPower: String(buyingPower + proceeds) })
    .where(eq(brokersTable.id, brokerId));

  logger.info({ contractSymbol, contracts, proceeds, pnl: realizedPnl, premium: currentPremium }, "Paper SELL OPTION executed");
  return { executed: true, realizedPnl, realizedPnlPercent, contractSymbol };
}

// ─── Options stop-loss / take-profit (on premium %) ──────────────────────

export async function checkOptionsStopLossTakeProfit(
  brokerId: number,
  strategyId: number,
  currentPremium: number,
  stopLossPercent: number,
  takeProfitPercent: number,
): Promise<"stop_loss" | "take_profit" | null> {
  const [position] = await db
    .select()
    .from(positionsTable)
    .where(
      and(
        eq(positionsTable.brokerId, brokerId),
        eq(positionsTable.symbol, "SPY"),
        eq(positionsTable.strategyId, strategyId),
        eq(positionsTable.assetType, "options"),
      ),
    );

  if (!position) return null;

  const entryPrice = parseFloat(position.entryPrice);
  const changePct = ((currentPremium - entryPrice) / entryPrice) * 100;

  if (changePct <= -stopLossPercent) return "stop_loss";
  if (changePct >= takeProfitPercent) return "take_profit";
  return null;
}

// ─── Stock stop-loss / take-profit ────────────────────────────────────────

export async function checkStopLossTakeProfit(
  brokerId: number,
  symbol: string,
  currentPrice: number,
  stopLossPercent: number,
  takeProfitPercent: number,
): Promise<"stop_loss" | "take_profit" | null> {
  const [position] = await db
    .select()
    .from(positionsTable)
    .where(and(eq(positionsTable.brokerId, brokerId), eq(positionsTable.symbol, symbol)));

  if (!position) return null;

  const entryPrice = parseFloat(position.entryPrice);
  const changePct = ((currentPrice - entryPrice) / entryPrice) * 100;

  if (changePct <= -stopLossPercent) return "stop_loss";
  if (changePct >= takeProfitPercent) return "take_profit";
  return null;
}

// ─── Update position market prices ────────────────────────────────────────

export async function updatePaperPositionPrices(
  brokerId: number,
  prices: Record<string, number>,
): Promise<void> {
  const positions = await db.select().from(positionsTable).where(eq(positionsTable.brokerId, brokerId));

  let totalPositionValue = 0;
  for (const pos of positions) {
    const price = prices[pos.symbol] ?? parseFloat(pos.currentPrice ?? pos.entryPrice);
    const qty = parseFloat(pos.quantity);
    const entry = parseFloat(pos.entryPrice);
    const multiplier = pos.assetType === "options" ? OPTIONS_MULTIPLIER : 1;
    const marketValue = qty * price * multiplier;
    totalPositionValue += marketValue;

    await db
      .update(positionsTable)
      .set({
        currentPrice: String(price),
        marketValue: String(marketValue),
        unrealizedPnl: String((price - entry) * qty * multiplier),
        unrealizedPnlPercent: String(((price - entry) / entry) * 100),
      })
      .where(eq(positionsTable.id, pos.id));
  }

  const buyingPower = await getPaperBuyingPower(brokerId);
  await db
    .update(brokersTable)
    .set({ accountValue: String(buyingPower + totalPositionValue) })
    .where(eq(brokersTable.id, brokerId));
}
