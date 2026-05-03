import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, positionsTable, brokersTable } from "@workspace/db";

const router: IRouter = Router();

function parsePosition(p: typeof positionsTable.$inferSelect & { brokerName?: string }) {
  return {
    ...p,
    quantity: parseFloat(p.quantity),
    entryPrice: parseFloat(p.entryPrice),
    currentPrice: p.currentPrice ? parseFloat(p.currentPrice) : null,
    marketValue: p.marketValue ? parseFloat(p.marketValue) : null,
    unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : null,
    unrealizedPnlPercent: p.unrealizedPnlPercent ? parseFloat(p.unrealizedPnlPercent) : null,
    brokerName: p.brokerName ?? "",
  };
}

router.get("/positions", async (_req, res): Promise<void> => {
  const positions = await db
    .select({
      id: positionsTable.id,
      brokerId: positionsTable.brokerId,
      strategyId: positionsTable.strategyId,
      symbol: positionsTable.symbol,
      assetType: positionsTable.assetType,
      side: positionsTable.side,
      quantity: positionsTable.quantity,
      entryPrice: positionsTable.entryPrice,
      currentPrice: positionsTable.currentPrice,
      marketValue: positionsTable.marketValue,
      unrealizedPnl: positionsTable.unrealizedPnl,
      unrealizedPnlPercent: positionsTable.unrealizedPnlPercent,
      openedAt: positionsTable.openedAt,
      createdAt: positionsTable.createdAt,
      updatedAt: positionsTable.updatedAt,
      brokerName: brokersTable.name,
    })
    .from(positionsTable)
    .leftJoin(brokersTable, eq(positionsTable.brokerId, brokersTable.id));

  res.json(positions.map(parsePosition));
});

router.get("/positions/summary", async (_req, res): Promise<void> => {
  const positions = await db
    .select({
      id: positionsTable.id,
      side: positionsTable.side,
      marketValue: positionsTable.marketValue,
      unrealizedPnl: positionsTable.unrealizedPnl,
    })
    .from(positionsTable);

  const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue ? parseFloat(p.marketValue) : 0), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : 0), 0);
  const longPositions = positions.filter((p) => p.side === "long").length;
  const shortPositions = positions.filter((p) => p.side === "short").length;

  res.json({
    totalPositions: positions.length,
    totalMarketValue,
    totalUnrealizedPnl,
    totalUnrealizedPnlPercent: totalMarketValue > 0 ? (totalUnrealizedPnl / totalMarketValue) * 100 : 0,
    longPositions,
    shortPositions,
  });
});

export default router;
