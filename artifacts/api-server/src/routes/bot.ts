import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, botStateTable, botLogsTable, activityTable } from "@workspace/db";
import { StartBotBody, GetBotLogsQueryParams } from "@workspace/api-zod";
import { refreshSchedule, runTradingCycle } from "../lib/scheduler";
import { ensurePaperBroker } from "../lib/paperTrading";

const router: IRouter = Router();

async function ensureBotState() {
  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state) {
    const [newState] = await db
      .insert(botStateTable)
      .values({ isRunning: false, tradesExecutedToday: 0, dailyPnl: "0" })
      .returning();
    return newState;
  }
  return state;
}

function parseBotState(s: typeof botStateTable.$inferSelect) {
  return {
    isRunning: s.isRunning,
    startedAt: s.startedAt?.toISOString() ?? null,
    activeStrategyId: s.activeStrategyId ?? null,
    activeBrokerId: s.activeBrokerId ?? null,
    tradesExecutedToday: s.tradesExecutedToday,
    dailyPnl: parseFloat(s.dailyPnl),
    lastHeartbeat: s.lastHeartbeat?.toISOString() ?? null,
    scheduledStartAt: s.scheduledStartAt?.toISOString() ?? null,
    scheduledStopAt: s.scheduledStopAt?.toISOString() ?? null,
  };
}

router.get("/bot/status", async (req, res): Promise<void> => {
  const state = await ensureBotState();
  res.json(parseBotState(state));
});

router.post("/bot/start", async (req, res): Promise<void> => {
  const parsed = StartBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await ensureBotState();
  const [state] = await db
    .update(botStateTable)
    .set({
      isRunning: true,
      startedAt: new Date(),
      activeStrategyId: parsed.data.strategyId,
      activeBrokerId: parsed.data.brokerId,
      lastHeartbeat: new Date(),
    })
    .where(eq(botStateTable.id, existing.id))
    .returning();

  await db.insert(botLogsTable).values({ level: "info", message: "Bot started manually", action: "start" });
  await db.insert(activityTable).values({
    type: "bot_started",
    title: "Bot Started",
    description: `Trading bot activated with strategy ID ${parsed.data.strategyId}`,
  });

  res.json(parseBotState(state ?? (await ensureBotState())));
});

router.post("/bot/stop", async (_req, res): Promise<void> => {
  const existing = await ensureBotState();
  const [state] = await db
    .update(botStateTable)
    .set({ isRunning: false, activeStrategyId: null, activeBrokerId: null })
    .where(eq(botStateTable.id, existing.id))
    .returning();

  await db.insert(botLogsTable).values({ level: "info", message: "Bot stopped by user", action: "stop" });
  await db.insert(activityTable).values({ type: "bot_stopped", title: "Bot Stopped", description: "Trading bot deactivated by user" });
  await refreshSchedule();

  res.json(parseBotState(state ?? (await ensureBotState())));
});

router.post("/bot/run-cycle", async (_req, res): Promise<void> => {
  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state?.activeStrategyId) {
    res.status(400).json({ error: "Bot not running or no active strategy" });
    return;
  }

  await runTradingCycle();

  const logs = await db
    .select()
    .from(botLogsTable)
    .orderBy(desc(botLogsTable.createdAt))
    .limit(20);

  res.json({ cycleComplete: true, logs: logs.map((l) => ({ level: l.level, message: l.message, action: l.action, symbol: l.symbol })) });
});

router.get("/bot/logs", async (req, res): Promise<void> => {
  const params = GetBotLogsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const logs = await db
    .select()
    .from(botLogsTable)
    .orderBy(desc(botLogsTable.createdAt))
    .limit(params.data.limit ?? 50);

  res.json(logs);
});

// Schwab auth URL for frontend
router.get("/bot/schwab-auth-url", async (req, res): Promise<void> => {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").filter(Boolean);
  const host = domains[0] ?? req.get("host") ?? "localhost";
  const proto = host.includes("replit") ? "https" : "http";
  const redirectUri = `${proto}://${host}/api/schwab/callback`;
  const clientId = process.env.SCHWAB_APP_KEY ?? "";
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "readonly,PlaceTrades" });
  const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?${params.toString()}`;
  res.json({ authUrl, redirectUri });
});

// Ensure paper broker is initialized
router.post("/bot/init-paper", async (_req, res): Promise<void> => {
  const brokerId = await ensurePaperBroker();
  res.json({ brokerId });
});

export default router;
