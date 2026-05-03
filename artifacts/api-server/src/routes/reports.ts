import { Router, type IRouter } from "express";
import { eq, gte, lte, and, desc } from "drizzle-orm";
import { db, tradesTable } from "@workspace/db";
import { GetPerformanceReportQueryParams, GetPnlChartQueryParams, GetWinRateStatsQueryParams, GetTopSymbolsQueryParams } from "@workspace/api-zod";
import { subDays, subWeeks, subMonths, subQuarters, subYears, startOfDay, format } from "date-fns";

function getPeriodDates(period: string) {
  const now = new Date();
  const endDate = now;
  let startDate: Date;

  switch (period) {
    case "daily":
      startDate = startOfDay(now);
      break;
    case "weekly":
      startDate = subWeeks(now, 1);
      break;
    case "monthly":
      startDate = subMonths(now, 1);
      break;
    case "quarterly":
      startDate = subQuarters(now, 1);
      break;
    case "annually":
      startDate = subYears(now, 1);
      break;
    default:
      startDate = subMonths(now, 1);
  }
  return { startDate, endDate };
}

function parsePnl(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

const router: IRouter = Router();

router.get("/reports/performance", async (req, res): Promise<void> => {
  const params = GetPerformanceReportQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { period, brokerId, strategyId } = params.data;
  const { startDate, endDate } = getPeriodDates(period);

  const conditions = [
    gte(tradesTable.openedAt, startDate),
    lte(tradesTable.openedAt, endDate),
    eq(tradesTable.status, "closed"),
  ];
  if (brokerId != null) conditions.push(eq(tradesTable.brokerId, brokerId));
  if (strategyId != null) conditions.push(eq(tradesTable.strategyId, strategyId));

  const trades = await db
    .select()
    .from(tradesTable)
    .where(and(...conditions));

  const closedTrades = trades.filter((t) => t.realizedPnl != null);
  const winningTrades = closedTrades.filter((t) => parsePnl(t.realizedPnl) > 0);
  const losingTrades = closedTrades.filter((t) => parsePnl(t.realizedPnl) < 0);

  const totalPnl = closedTrades.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0);
  const totalWins = winningTrades.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0));
  const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
  const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;

  const pnls = closedTrades.map((t) => parsePnl(t.realizedPnl));
  const maxDrawdown = pnls.length > 0 ? Math.abs(Math.min(0, ...pnls)) : 0;
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : null;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : null;

  const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
  const pnlStdDev =
    closedTrades.length > 1
      ? Math.sqrt(pnls.reduce((sum, p) => sum + Math.pow(p - avgPnl, 2), 0) / (pnls.length - 1))
      : 0;
  const sharpeRatio = pnlStdDev > 0 ? (avgPnl / pnlStdDev) * Math.sqrt(252) : null;

  const entryPricesSum = closedTrades.reduce((sum, t) => sum + parseFloat(t.entryPrice), 0);
  const totalInvested = entryPricesSum > 0 ? entryPricesSum : 1;
  const totalPnlPercent = (totalPnl / totalInvested) * 100;

  res.json({
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    totalPnl,
    totalPnlPercent,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    sharpeRatio,
    bestTrade,
    worstTrade,
  });
});

router.get("/reports/pnl-chart", async (req, res): Promise<void> => {
  const params = GetPnlChartQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { period, brokerId } = params.data;
  const { startDate, endDate } = getPeriodDates(period ?? "monthly");

  const conditions = [
    gte(tradesTable.openedAt, startDate),
    lte(tradesTable.openedAt, endDate),
    eq(tradesTable.status, "closed"),
  ];
  if (brokerId != null) conditions.push(eq(tradesTable.brokerId, brokerId));

  const trades = await db
    .select()
    .from(tradesTable)
    .where(and(...conditions))
    .orderBy(tradesTable.openedAt);

  // Group by date
  const byDate = new Map<string, { pnl: number; count: number }>();
  for (const trade of trades) {
    const date = format(trade.openedAt, "yyyy-MM-dd");
    const existing = byDate.get(date) ?? { pnl: 0, count: 0 };
    byDate.set(date, {
      pnl: existing.pnl + parsePnl(trade.realizedPnl),
      count: existing.count + 1,
    });
  }

  let cumulative = 0;
  const result = Array.from(byDate.entries()).map(([date, data]) => {
    cumulative += data.pnl;
    return {
      date,
      pnl: data.pnl,
      cumulativePnl: cumulative,
      tradeCount: data.count,
    };
  });

  res.json(result);
});

router.get("/reports/win-rate", async (req, res): Promise<void> => {
  const params = GetWinRateStatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { startDate, endDate } = getPeriodDates(params.data.period ?? "monthly");

  const trades = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        gte(tradesTable.openedAt, startDate),
        lte(tradesTable.openedAt, endDate),
        eq(tradesTable.status, "closed"),
      ),
    );

  const wins = trades.filter((t) => parsePnl(t.realizedPnl) > 0);
  const losses = trades.filter((t) => parsePnl(t.realizedPnl) < 0);
  const breakeven = trades.filter((t) => parsePnl(t.realizedPnl) === 0);

  const pnls = trades.map((t) => parsePnl(t.realizedPnl));

  res.json({
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    avgWinAmount: wins.length > 0 ? wins.reduce((s, t) => s + parsePnl(t.realizedPnl), 0) / wins.length : 0,
    avgLossAmount: losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + parsePnl(t.realizedPnl), 0)) / losses.length : 0,
    largestWin: pnls.length > 0 ? Math.max(0, ...pnls) : 0,
    largestLoss: pnls.length > 0 ? Math.abs(Math.min(0, ...pnls)) : 0,
  });
});

router.get("/reports/top-symbols", async (req, res): Promise<void> => {
  const params = GetTopSymbolsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { period, limit } = params.data;
  const { startDate, endDate } = getPeriodDates(period ?? "monthly");

  const trades = await db
    .select()
    .from(tradesTable)
    .where(
      and(
        gte(tradesTable.openedAt, startDate),
        lte(tradesTable.openedAt, endDate),
        eq(tradesTable.status, "closed"),
      ),
    );

  const bySymbol = new Map<string, { pnl: number; invested: number; count: number; wins: number }>();
  for (const trade of trades) {
    const existing = bySymbol.get(trade.symbol) ?? { pnl: 0, invested: 0, count: 0, wins: 0 };
    const pnl = parsePnl(trade.realizedPnl);
    bySymbol.set(trade.symbol, {
      pnl: existing.pnl + pnl,
      invested: existing.invested + parseFloat(trade.entryPrice),
      count: existing.count + 1,
      wins: existing.wins + (pnl > 0 ? 1 : 0),
    });
  }

  const result = Array.from(bySymbol.entries())
    .map(([symbol, data]) => ({
      symbol,
      totalPnl: data.pnl,
      totalPnlPercent: data.invested > 0 ? (data.pnl / data.invested) * 100 : 0,
      tradeCount: data.count,
      winRate: data.count > 0 ? data.wins / data.count : 0,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl)
    .slice(0, limit ?? 10);

  res.json(result);
});

export default router;
