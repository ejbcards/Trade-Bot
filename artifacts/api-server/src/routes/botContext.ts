import { Router, type IRouter } from "express";
import { desc, gte } from "drizzle-orm";
import { db, botStateTable, botLogsTable, positionsTable } from "@workspace/db";
import { fetchMarketData, fetchVixData } from "../lib/marketData";

const router: IRouter = Router();

const ET_TZ = "America/New_York";

function startOfDayET(): Date {
  const utcNow = new Date();
  const etNow = new Date(utcNow.toLocaleString("en-US", { timeZone: ET_TZ }));
  etNow.setHours(0, 0, 0, 0);
  const offsetMs = utcNow.getTime() - new Date(utcNow.toLocaleString("en-US", { timeZone: ET_TZ })).getTime();
  return new Date(etNow.getTime() + offsetMs);
}

function computePendingSignal(
  spy: { rsi: number | null; trend: string | null; maCondition: string | null } | null,
  isHighVolatility: boolean,
  rsiOverbought = 82,
  rsiOversold = 18,
): { direction: string; reason: string; blockedBy: string | null } {
  if (!spy) {
    return { direction: "unavailable", reason: "Could not fetch SPY market data", blockedBy: null };
  }

  const trend = spy.trend;
  const rsi = spy.rsi ?? 50;
  const ma = spy.maCondition ?? "unknown";

  if (trend === "bullish" && rsi < rsiOverbought) {
    if (isHighVolatility) {
      return {
        direction: "blocked",
        reason: `SPY is bullish (RSI ${rsi.toFixed(1)}, MA: ${ma}) but CALL entry is blocked — high-vol regime active`,
        blockedBy: "high_vol",
      };
    }
    return {
      direction: "call",
      reason: `SPY bullish signal: MA ${ma}, RSI ${rsi.toFixed(1)} — would BUY CALL`,
      blockedBy: null,
    };
  } else if (trend === "bearish" && rsi > rsiOversold) {
    return {
      direction: "put",
      reason: isHighVolatility
        ? `SPY bearish + high-vol regime — would BUY PUT with tightened SL (RSI ${rsi.toFixed(1)}, MA: ${ma})`
        : `SPY bearish signal: MA ${ma}, RSI ${rsi.toFixed(1)} — would BUY PUT`,
      blockedBy: null,
    };
  } else if (rsi >= rsiOverbought) {
    return {
      direction: "hold",
      reason: `RSI overbought at ${rsi.toFixed(1)} — no new entries until momentum cools`,
      blockedBy: "rsi_extreme",
    };
  } else if (rsi <= rsiOversold) {
    return {
      direction: "hold",
      reason: `RSI oversold at ${rsi.toFixed(1)} — no new entries until bounce confirmed`,
      blockedBy: "rsi_extreme",
    };
  } else {
    return {
      direction: "hold",
      reason: `Neutral trend (MA: ${ma}, RSI: ${rsi.toFixed(1)}) — waiting for directional signal`,
      blockedBy: null,
    };
  }
}

router.get("/bot/context", async (_req, res): Promise<void> => {
  const dayStart = startOfDayET();

  const [botStateRows, recentLogs, openPositions, spyData, vixData] = await Promise.all([
    db.select().from(botStateTable).limit(1),
    db
      .select()
      .from(botLogsTable)
      .where(gte(botLogsTable.createdAt, dayStart))
      .orderBy(desc(botLogsTable.createdAt))
      .limit(30),
    db.select().from(positionsTable),
    fetchMarketData("SPY").catch(() => null),
    fetchVixData().catch(() => null),
  ]);

  const state = botStateRows[0];
  const isHighVol = vixData?.isHighVolatility ?? false;

  const pendingSignal = computePendingSignal(
    spyData
      ? { rsi: spyData.rsi, trend: spyData.trendCondition, maCondition: spyData.maCondition }
      : null,
    isHighVol,
  );

  const decisionKeywords = [
    "BUY", "SELL", "HOLD", "SKIP", "TAKE-PROFIT", "STOP-LOSS", "ROLLING-STOP",
    "FLIP", "VOL-REGIME", "VOL-FILTER", "WEEKEND-CLOSE", "RSI", "VIX", "SIGNAL",
    "error", "warn",
  ];

  const filteredLogs = recentLogs
    .filter((l) => decisionKeywords.some((kw) => l.message.toUpperCase().includes(kw.toUpperCase())))
    .slice(0, 20);

  res.json({
    botRunning: state?.isRunning ?? false,
    marketSnapshot: {
      spyPrice: spyData?.currentPrice ?? null,
      spyChange: spyData?.priceChangePercent ?? null,
      rsi: spyData?.rsi ?? null,
      trend: spyData?.trendCondition ?? null,
      maCondition: spyData?.maCondition ?? null,
      vixPrice: vixData?.price ?? null,
      vixDayChange: vixData?.dayChangePercent ?? null,
      isHighVolatility: isHighVol,
      fetchedAt: new Date().toISOString(),
    },
    pendingSignal,
    recentLogs: filteredLogs.map((l) => ({
      level: l.level,
      message: l.message,
      action: l.action,
      symbol: l.symbol,
      createdAt: l.createdAt.toISOString(),
    })),
    openPositionCount: openPositions.length,
  });
});

export default router;
