import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, botStateTable, botLogsTable, activityTable } from "@workspace/db";
import { StartBotBody, GetBotLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

async function ensureBotState() {
  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state) {
    const [newState] = await db
      .insert(botStateTable)
      .values({
        isRunning: false,
        tradesExecutedToday: 0,
        dailyPnl: "0",
      })
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
  const [state] = await db
    .update(botStateTable)
    .set({
      isRunning: true,
      startedAt: new Date(),
      activeStrategyId: parsed.data.strategyId,
      activeBrokerId: parsed.data.brokerId,
      lastHeartbeat: new Date(),
    })
    .returning();

  if (!state) {
    await db.insert(botStateTable).values({
      isRunning: true,
      startedAt: new Date(),
      activeStrategyId: parsed.data.strategyId,
      activeBrokerId: parsed.data.brokerId,
      tradesExecutedToday: 0,
      dailyPnl: "0",
    });
  }

  await db.insert(botLogsTable).values({
    level: "info",
    message: "Bot started successfully",
    action: "start",
  });

  await db.insert(activityTable).values({
    type: "bot_started",
    title: "Bot Started",
    description: `Trading bot activated with strategy ID ${parsed.data.strategyId}`,
  });

  const finalState = await ensureBotState();
  res.json(parseBotState(finalState));
});

router.post("/bot/stop", async (_req, res): Promise<void> => {
  const [state] = await db
    .update(botStateTable)
    .set({
      isRunning: false,
      activeStrategyId: null,
      activeBrokerId: null,
    })
    .returning();

  await db.insert(botLogsTable).values({
    level: "info",
    message: "Bot stopped by user",
    action: "stop",
  });

  await db.insert(activityTable).values({
    type: "bot_stopped",
    title: "Bot Stopped",
    description: "Trading bot deactivated by user",
  });

  const finalState = state ?? (await ensureBotState());
  res.json(parseBotState(finalState));
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

export default router;
