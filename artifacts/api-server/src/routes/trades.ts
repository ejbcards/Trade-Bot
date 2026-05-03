import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tradesTable, brokersTable, strategiesTable } from "@workspace/db";
import { GetTradeParams, ListTradesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function parseTrade(t: typeof tradesTable.$inferSelect & { brokerName?: string; strategyName?: string | null }) {
  return {
    ...t,
    quantity: parseFloat(t.quantity),
    entryPrice: parseFloat(t.entryPrice),
    exitPrice: t.exitPrice ? parseFloat(t.exitPrice) : null,
    realizedPnl: t.realizedPnl ? parseFloat(t.realizedPnl) : null,
    realizedPnlPercent: t.realizedPnlPercent ? parseFloat(t.realizedPnlPercent) : null,
    aiConfidence: t.aiConfidence ? parseFloat(t.aiConfidence) : null,
    brokerName: t.brokerName ?? "",
    strategyName: t.strategyName ?? null,
  };
}

router.get("/trades", async (req, res): Promise<void> => {
  const params = ListTradesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { brokerId, strategyId, symbol, status, limit, offset } = params.data;

  const conditions = [];
  if (brokerId != null) conditions.push(eq(tradesTable.brokerId, brokerId));
  if (strategyId != null) conditions.push(eq(tradesTable.strategyId, strategyId));
  if (symbol != null) conditions.push(eq(tradesTable.symbol, symbol));
  if (status != null) conditions.push(eq(tradesTable.status, status));

  const trades = await db
    .select({
      id: tradesTable.id,
      brokerId: tradesTable.brokerId,
      strategyId: tradesTable.strategyId,
      symbol: tradesTable.symbol,
      assetType: tradesTable.assetType,
      side: tradesTable.side,
      quantity: tradesTable.quantity,
      entryPrice: tradesTable.entryPrice,
      exitPrice: tradesTable.exitPrice,
      realizedPnl: tradesTable.realizedPnl,
      realizedPnlPercent: tradesTable.realizedPnlPercent,
      status: tradesTable.status,
      aiSignal: tradesTable.aiSignal,
      aiConfidence: tradesTable.aiConfidence,
      notes: tradesTable.notes,
      openedAt: tradesTable.openedAt,
      closedAt: tradesTable.closedAt,
      createdAt: tradesTable.createdAt,
      updatedAt: tradesTable.updatedAt,
      brokerName: brokersTable.name,
      strategyName: strategiesTable.name,
    })
    .from(tradesTable)
    .leftJoin(brokersTable, eq(tradesTable.brokerId, brokersTable.id))
    .leftJoin(strategiesTable, eq(tradesTable.strategyId, strategiesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tradesTable.openedAt))
    .limit(limit ?? 100)
    .offset(offset ?? 0);

  res.json(trades.map(parseTrade));
});

router.get("/trades/:id", async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [trade] = await db
    .select({
      id: tradesTable.id,
      brokerId: tradesTable.brokerId,
      strategyId: tradesTable.strategyId,
      symbol: tradesTable.symbol,
      assetType: tradesTable.assetType,
      side: tradesTable.side,
      quantity: tradesTable.quantity,
      entryPrice: tradesTable.entryPrice,
      exitPrice: tradesTable.exitPrice,
      realizedPnl: tradesTable.realizedPnl,
      realizedPnlPercent: tradesTable.realizedPnlPercent,
      status: tradesTable.status,
      aiSignal: tradesTable.aiSignal,
      aiConfidence: tradesTable.aiConfidence,
      notes: tradesTable.notes,
      openedAt: tradesTable.openedAt,
      closedAt: tradesTable.closedAt,
      createdAt: tradesTable.createdAt,
      updatedAt: tradesTable.updatedAt,
      brokerName: brokersTable.name,
      strategyName: strategiesTable.name,
    })
    .from(tradesTable)
    .leftJoin(brokersTable, eq(tradesTable.brokerId, brokersTable.id))
    .leftJoin(strategiesTable, eq(tradesTable.strategyId, strategiesTable.id))
    .where(eq(tradesTable.id, params.data.id));

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }
  res.json(parseTrade(trade));
});

export default router;
