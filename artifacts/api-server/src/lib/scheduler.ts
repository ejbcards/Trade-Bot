import cron from "node-cron";
import { db, botStateTable, botLogsTable, activityTable, strategiesTable, decisionRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { evaluateDecisionTable } from "./decisionEngine";

const ET_TZ = "America/New_York";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getState() {
  const [state] = await db.select().from(botStateTable).limit(1);
  return state ?? null;
}

async function logBot(level: string, message: string, action?: string, symbol?: string) {
  await db.insert(botLogsTable).values({ level, message, action: action ?? null, symbol: symbol ?? null });
  logger.info({ action, symbol }, message);
}

/** Returns next occurrence of HH:MM ET on a weekday >= today */
function nextWeekdayTime(hour: number, minute: number): Date {
  const now = new Date();
  // Build a candidate in ET
  const candidate = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ET_TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2") +
    `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  );
  // Convert ET-string to actual UTC Date
  const etString = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(now);
  // Build today's target time in UTC by formatting today's date in ET and applying the offset
  const todayET = new Date(
    new Date().toLocaleString("en-US", { timeZone: ET_TZ })
  );
  const target = new Date(todayET);
  target.setHours(hour, minute, 0, 0);
  // Convert back: difference between local and ET
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: ET_TZ }));
  const offsetMs = now.getTime() - nowET.getTime();
  target.setTime(target.getTime() + offsetMs);

  // If already past today, move to next weekday
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  // Skip weekends
  while (target.getDay() === 0 || target.getDay() === 6) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/** Compute and persist next scheduled start/stop into bot_state */
export async function refreshSchedule() {
  const nextStart = nextWeekdayTime(9, 30);
  const nextStop  = nextWeekdayTime(16, 0);
  // Ensure stop is after start
  const adjustedStop = nextStop <= nextStart
    ? new Date(nextStart.getTime() + 6.5 * 60 * 60 * 1000)
    : nextStop;

  const existing = await getState();
  if (existing) {
    await db
      .update(botStateTable)
      .set({ scheduledStartAt: nextStart, scheduledStopAt: adjustedStop })
      .where(eq(botStateTable.id, existing.id));
  } else {
    await db.insert(botStateTable).values({
      isRunning: false,
      tradesExecutedToday: 0,
      dailyPnl: "0",
      scheduledStartAt: nextStart,
      scheduledStopAt: adjustedStop,
    });
  }
  logger.info({ nextStart: nextStart.toISOString(), nextStop: adjustedStop.toISOString() }, "Schedule refreshed");
}

// ─── Trading Loop ────────────────────────────────────────────────────────────

async function runTradingCycle() {
  const state = await getState();
  if (!state?.isRunning) return;
  if (!state.activeStrategyId) return;

  // Update heartbeat
  await db
    .update(botStateTable)
    .set({ lastHeartbeat: new Date() })
    .where(eq(botStateTable.id, state.id));

  // Load the active strategy
  const [strategy] = await db
    .select()
    .from(strategiesTable)
    .where(eq(strategiesTable.id, state.activeStrategyId));

  if (!strategy || !strategy.isActive) {
    await logBot("warn", "Active strategy not found or inactive — skipping cycle", "cycle_skip");
    return;
  }

  const symbols: string[] = Array.isArray(strategy.symbols) ? strategy.symbols : [];
  if (symbols.length === 0) {
    await logBot("info", "No symbols configured for strategy — skipping cycle", "cycle_skip");
    return;
  }

  // Load rules
  const rules = await db
    .select()
    .from(decisionRulesTable)
    .where(eq(decisionRulesTable.strategyId, strategy.id));

  await logBot("info", `Trading cycle started for strategy "${strategy.name}" — ${symbols.length} symbol(s)`, "cycle_start");

  for (const symbol of symbols) {
    // In paper-trading mode (no Schwab keys), we log what the bot WOULD do.
    // When Schwab API keys are connected, replace this with live market data.
    const snapshot = {
      symbol,
      rsi: null,
      maCondition: null,
      volumeCondition: null,
      trendCondition: null,
      aiSignal: null,
      aiConfidence: null,
      priceChangePercent: null,
      candlestickPattern: null,
      timeFrame: null,
      volumeIncreaseLevel: null,
    };

    const result = evaluateDecisionTable(rules, snapshot);

    await logBot(
      "info",
      `[PAPER] ${symbol} → ${result.action.toUpperCase()} (${result.reason})`,
      result.action,
      symbol
    );
  }

  await logBot("info", "Trading cycle complete", "cycle_end");
}

// ─── Cron Jobs ───────────────────────────────────────────────────────────────

export function startScheduler() {
  logger.info("Starting market scheduler (America/New_York)");

  // Refresh schedule timestamps every hour so the UI always shows accurate times
  refreshSchedule().catch((e) => logger.error(e, "Failed initial schedule refresh"));
  cron.schedule("0 * * * *", () => {
    refreshSchedule().catch((e) => logger.error(e, "Schedule refresh failed"));
  }, { timezone: ET_TZ });

  // Market open — 9:30 AM ET, weekdays
  cron.schedule("30 9 * * 1-5", async () => {
    const state = await getState();
    if (state?.isRunning) {
      logger.info("Bot already running at market open");
      return;
    }
    logger.info("Market open — starting bot");
    const [updated] = await db
      .update(botStateTable)
      .set({ isRunning: true, startedAt: new Date(), lastHeartbeat: new Date() })
      .returning();
    if (updated) {
      await logBot("info", "Bot auto-started at market open (9:30 AM ET)", "auto_start");
      await db.insert(activityTable).values({
        type: "bot_started",
        title: "Bot Started — Market Open",
        description: "Trading bot automatically activated at 9:30 AM ET",
      });
      // Refresh to move scheduled start to next business day
      await refreshSchedule();
    }
  }, { timezone: ET_TZ });

  // Market close — 4:00 PM ET, weekdays
  cron.schedule("0 16 * * 1-5", async () => {
    const state = await getState();
    if (!state?.isRunning) return;
    logger.info("Market close — stopping bot");
    await db
      .update(botStateTable)
      .set({ isRunning: false, tradesExecutedToday: 0, dailyPnl: "0" })
      .returning();
    await logBot("info", "Bot auto-stopped at market close (4:00 PM ET)", "auto_stop");
    await db.insert(activityTable).values({
      type: "bot_stopped",
      title: "Bot Stopped — Market Close",
      description: "Trading bot automatically deactivated at 4:00 PM ET",
    });
    await refreshSchedule();
  }, { timezone: ET_TZ });

  // Trading loop — every 5 minutes during market hours (9:30–16:00 ET, weekdays)
  cron.schedule("*/5 * * * 1-5", async () => {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: ET_TZ }));
    const h = nowET.getHours();
    const m = nowET.getMinutes();
    const minuteOfDay = h * 60 + m;
    const marketOpen  = 9 * 60 + 30;
    const marketClose = 16 * 60;
    if (minuteOfDay < marketOpen || minuteOfDay >= marketClose) return;
    await runTradingCycle().catch((e) => logger.error(e, "Trading cycle error"));
  }, { timezone: ET_TZ });

  // Daily reset at midnight ET
  cron.schedule("0 0 * * *", async () => {
    await db
      .update(botStateTable)
      .set({ tradesExecutedToday: 0, dailyPnl: "0" })
      .where(eq(botStateTable.id, 1));
    await logBot("info", "Daily counters reset at midnight ET", "daily_reset");
  }, { timezone: ET_TZ });

  logger.info("Market scheduler ready — bot will auto-start 9:30 AM ET weekdays");
}
