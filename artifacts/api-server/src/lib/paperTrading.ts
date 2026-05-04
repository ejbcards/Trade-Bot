import { db, brokersTable, tradesTable, positionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

export const PAPER_BROKER_TYPE = "paper";
const PAPER_STARTING_CASH = 100_000;

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
    const marketValue = qty * price;
    totalPositionValue += marketValue;

    await db
      .update(positionsTable)
      .set({
        currentPrice: String(price),
        marketValue: String(marketValue),
        unrealizedPnl: String((price - entry) * qty),
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
