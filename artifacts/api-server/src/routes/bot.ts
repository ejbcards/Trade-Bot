import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, botStateTable, botLogsTable, activityTable } from "@workspace/db";
import { StartBotBody, GetBotLogsQueryParams } from "@workspace/api-zod";
import { refreshSchedule } from "../lib/scheduler";
import { fetchMarketData } from "../lib/marketData";
import { ensurePaperBroker, executePaperBuy, executePaperSell, checkStopLossTakeProfit, updatePaperPositionPrices } from "../lib/paperTrading";
import { evaluateDecisionTable } from "../lib/decisionEngine";
import { strategiesTable, decisionRulesTable } from "@workspace/db";

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

  await db.insert(botLogsTable).values({
    level: "info",
    message: "Bot started manually",
    action: "start",
  });

  await db.insert(activityTable).values({
    type: "bot_started",
    title: "Bot Started",
    description: `Trading bot activated with strategy ID ${parsed.data.strategyId}`,
  });

  const finalState = state ?? (await ensureBotState());
  res.json(parseBotState(finalState));
});

router.post("/bot/stop", async (_req, res): Promise<void> => {
  const existing = await ensureBotState();
  const [state] = await db
    .update(botStateTable)
    .set({
      isRunning: false,
      activeStrategyId: null,
      activeBrokerId: null,
    })
    .where(eq(botStateTable.id, existing.id))
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

  // Refresh schedule so the next scheduled start is shown correctly
  await refreshSchedule();

  const finalState = state ?? (await ensureBotState());
  res.json(parseBotState(finalState));
});

router.post("/bot/run-cycle", async (_req, res): Promise<void> => {
  const [state] = await db.select().from(botStateTable).limit(1);
  if (!state?.activeStrategyId) {
    res.status(400).json({ error: "Bot not running or no active strategy" });
    return;
  }

  const [strategy] = await db.select().from(strategiesTable).where(eq(strategiesTable.id, state.activeStrategyId));
  if (!strategy) { res.status(400).json({ error: "Strategy not found" }); return; }

  const symbols: string[] = Array.isArray(strategy.symbols) ? strategy.symbols : [];
  const rules = await db.select().from(decisionRulesTable).where(eq(decisionRulesTable.strategyId, strategy.id));
  const paperBrokerId = await ensurePaperBroker();
  const brokerId = state.activeBrokerId ?? paperBrokerId;
  const maxPositionSize = parseFloat(strategy.maxPositionSize ?? "1000");
  const stopLossPct = parseFloat(strategy.stopLossPercent ?? "2");
  const takeProfitPct = parseFloat(strategy.takeProfitPercent ?? "5");

  const results: object[] = [];
  const prices: Record<string, number> = {};

  for (const symbol of symbols) {
    const data = await fetchMarketData(symbol);
    if (!data) { results.push({ symbol, error: "No market data" }); continue; }
    prices[symbol] = data.currentPrice;

    const trigger = await checkStopLossTakeProfit(brokerId, symbol, data.currentPrice, stopLossPct, takeProfitPct);
    if (trigger) {
      const r = await executePaperSell(brokerId, strategy.id, symbol, data.currentPrice);
      results.push({ symbol, action: trigger, price: data.currentPrice, executed: r.executed, pnl: r.realizedPnl });
      continue;
    }

    const snapshot = {
      symbol, rsi: data.rsi, maCondition: data.maCondition, volumeCondition: data.volumeCondition,
      trendCondition: data.trendCondition, aiSignal: null as string | null, aiConfidence: null as number | null,
      priceChangePercent: data.priceChangePercent, candlestickPattern: data.candlestickPattern,
      timeFrame: data.timeFrame, volumeIncreaseLevel: data.volumeIncreaseLevel,
    };
    const decision = evaluateDecisionTable(rules, snapshot);

    let executed = false;
    let tradeDetail: object = {};
    if (decision.action === "buy") {
      const r = await executePaperBuy(brokerId, strategy.id, symbol, data.currentPrice, maxPositionSize * decision.quantityMultiplier);
      executed = r.executed;
      tradeDetail = { quantity: r.quantity, cost: r.cost };
    } else if (decision.action === "sell") {
      const r = await executePaperSell(brokerId, strategy.id, symbol, data.currentPrice);
      executed = r.executed;
      tradeDetail = { pnl: r.realizedPnl };
    }

    results.push({ symbol, price: data.currentPrice, rsi: data.rsi, ma: data.maCondition, trend: data.trendCondition, pattern: data.candlestickPattern, vol: data.volumeIncreaseLevel, action: decision.action, reason: decision.reason, executed, ...tradeDetail });
  }

  if (Object.keys(prices).length > 0) await updatePaperPositionPrices(brokerId, prices);
  res.json({ cycleComplete: true, symbolsProcessed: symbols.length, results });
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
