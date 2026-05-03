import { Router, type IRouter } from "express";
import { eq, gte, desc } from "drizzle-orm";
import { db, brokersTable, strategiesTable, tradesTable, positionsTable, botStateTable, activityTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
import { startOfDay, subWeeks, subMonths } from "date-fns";

const router: IRouter = Router();

function parsePnl(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [brokers, strategies, positions, botState, recentTrades, weeklyTrades, monthlyTrades] = await Promise.all([
    db.select().from(brokersTable).where(eq(brokersTable.isActive, true)),
    db.select().from(strategiesTable).where(eq(strategiesTable.isActive, true)),
    db.select().from(positionsTable),
    db.select().from(botStateTable).limit(1),
    db.select().from(tradesTable).where(
      gte(tradesTable.openedAt, startOfDay(new Date()))
    ),
    db.select().from(tradesTable).where(
      gte(tradesTable.openedAt, subWeeks(new Date(), 1))
    ),
    db.select().from(tradesTable).where(
      gte(tradesTable.openedAt, subMonths(new Date(), 1))
    ),
  ]);

  const totalAccountValue = brokers.reduce((sum, b) => sum + (b.accountValue ? parseFloat(b.accountValue) : 0), 0);
  const totalBuyingPower = brokers.reduce((sum, b) => sum + (b.buyingPower ? parseFloat(b.buyingPower) : 0), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + parsePnl(p.unrealizedPnl), 0);

  const todayClosedTrades = recentTrades.filter((t) => t.status === "closed");
  const dailyPnl = todayClosedTrades.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0);
  const dailyPnlPercent = totalAccountValue > 0 ? (dailyPnl / totalAccountValue) * 100 : 0;

  const weekClosed = weeklyTrades.filter((t) => t.status === "closed");
  const weeklyPnl = weekClosed.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0);

  const monthClosed = monthlyTrades.filter((t) => t.status === "closed");
  const monthlyPnl = monthClosed.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0);

  const allClosed = await db.select().from(tradesTable).where(eq(tradesTable.status, "closed"));
  const wins = allClosed.filter((t) => parsePnl(t.realizedPnl) > 0).length;
  const winRateAllTime = allClosed.length > 0 ? wins / allClosed.length : 0;

  const state = botState[0];

  res.json({
    totalAccountValue,
    totalBuyingPower,
    dailyPnl,
    dailyPnlPercent,
    weeklyPnl,
    monthlyPnl,
    totalOpenPositions: positions.length,
    totalUnrealizedPnl,
    activeBrokers: brokers.filter((b) => b.status === "connected").length,
    activeStrategies: strategies.length,
    botRunning: state?.isRunning ?? false,
    tradesExecutedToday: recentTrades.length,
    winRateAllTime,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const params = GetRecentActivityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const activities = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(params.data.limit ?? 20);

  res.json(
    activities.map((a) => ({
      ...a,
      pnl: a.pnl ? parseFloat(a.pnl) : null,
    })),
  );
});

export default router;
