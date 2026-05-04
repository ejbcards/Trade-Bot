import cron from "node-cron";
import { db, botStateTable, botLogsTable, activityTable, strategiesTable, decisionRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { evaluateDecisionTable } from "./decisionEngine";
import { fetchMarketData, fetchSpyOptionsChain } from "./marketData";
import {
  ensurePaperBroker,
  executePaperBuy,
  executePaperSell,
  executePaperBuyOption,
  executePaperSellOption,
  checkStopLossTakeProfit,
  checkOptionsStopLossTakeProfit,
  updatePaperPositionPrices,
} from "./paperTrading";

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

function nextWeekdayTime(hour: number, minute: number): Date {
  const now = new Date();
  const todayET = new Date(new Date().toLocaleString("en-US", { timeZone: ET_TZ }));
  const target = new Date(todayET);
  target.setHours(hour, minute, 0, 0);
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: ET_TZ }));
  const offsetMs = now.getTime() - nowET.getTime();
  target.setTime(target.getTime() + offsetMs);
  if (target <= now) target.setDate(target.getDate() + 1);
  while (target.getDay() === 0 || target.getDay() === 6) target.setDate(target.getDate() + 1);
  return target;
}

export async function refreshSchedule() {
  const nextStart = nextWeekdayTime(9, 30);
  const nextStop = nextWeekdayTime(16, 0);
  const adjustedStop = nextStop <= nextStart
    ? new Date(nextStart.getTime() + 6.5 * 60 * 60 * 1000)
    : nextStop;

  const existing = await getState();
  if (existing) {
    await db.update(botStateTable).set({ scheduledStartAt: nextStart, scheduledStopAt: adjustedStop }).where(eq(botStateTable.id, existing.id));
  } else {
    await db.insert(botStateTable).values({ isRunning: false, tradesExecutedToday: 0, dailyPnl: "0", scheduledStartAt: nextStart, scheduledStopAt: adjustedStop });
  }
  logger.info({ nextStart: nextStart.toISOString(), nextStop: adjustedStop.toISOString() }, "Schedule refreshed");
}

// ─── Options trading cycle ───────────────────────────────────────────────

async function runOptionsCycle(
  brokerId: number,
  strategyId: number,
  stopLossPercent: number,
  takeProfitPercent: number,
  maxPositionUsd: number,
): Promise<void> {
  const data = await fetchMarketData("SPY");
  if (!data) {
    await logBot("warn", "[SKIP] SPY — could not fetch market data", "data_error", "SPY");
    return;
  }

  const indicators = [
    data.rsi !== null ? `RSI:${data.rsi.toFixed(1)}` : null,
    data.maCondition ? `MA:${data.maCondition}` : null,
    data.candlestickPattern ? `Pat:${data.candlestickPattern}` : null,
    data.trendCondition ? `Trend:${data.trendCondition}` : null,
  ].filter(Boolean).join(" ");

  // ── Check stop-loss / take-profit on existing options position ──
  // We need current option premium — fetch from options chain
  const chainForSL = await fetchSpyOptionsChain(data.currentPrice);
  if (chainForSL) {
    // Find current premium for existing position optionType
    const callPremium = chainForSL.call?.midPrice ?? chainForSL.call?.lastPrice ?? 0;
    const putPremium = chainForSL.put?.midPrice ?? chainForSL.put?.lastPrice ?? 0;
    const avgPremium = (callPremium + putPremium) / 2;

    const trigger = await checkOptionsStopLossTakeProfit(brokerId, strategyId, avgPremium, stopLossPercent, takeProfitPercent);
    if (trigger) {
      const label = trigger === "stop_loss" ? "STOP-LOSS" : "TAKE-PROFIT";
      const result = await executePaperSellOption(brokerId, strategyId, avgPremium);
      if (result.executed) {
        const pnlStr = result.realizedPnl >= 0 ? `+$${result.realizedPnl.toFixed(2)}` : `-$${Math.abs(result.realizedPnl).toFixed(2)}`;
        await logBot("info", `[${label}] SPY option ${result.contractSymbol} — P&L: ${pnlStr}`, "sell", "SPY");
        await db.insert(activityTable).values({
          type: "trade_closed",
          title: `${label}: SPY option closed`,
          description: `${result.contractSymbol} closed at $${avgPremium.toFixed(2)} premium — P&L: ${pnlStr}`,
        });
        const [s] = await db.select().from(botStateTable).limit(1);
        if (s) {
          await db.update(botStateTable).set({
            tradesExecutedToday: (s.tradesExecutedToday ?? 0) + 1,
            dailyPnl: String(parseFloat(s.dailyPnl ?? "0") + result.realizedPnl),
          }).where(eq(botStateTable.id, s.id));
        }
      }
      return;
    }
  }

  // ── Determine trade direction from SPY trend ──
  const trend = data.trendCondition;
  const rsi = data.rsi ?? 50;
  const rsiOk = trend === "bullish" ? rsi < 72 : rsi > 28;

  let direction: "call" | "put" | null = null;
  let reason = "";

  if (trend === "bullish" && rsiOk) {
    direction = "call";
    reason = `SPY bullish (MA:${data.maCondition}, RSI:${rsi.toFixed(1)}) — buy CALL`;
  } else if (trend === "bearish" && rsiOk) {
    direction = "put";
    reason = `SPY bearish (MA:${data.maCondition}, RSI:${rsi.toFixed(1)}) — buy PUT`;
  } else {
    await logBot("info", `[LIVE] SPY @ $${data.currentPrice.toFixed(2)} [${indicators}] → HOLD — ${trend === "neutral" ? "neutral trend" : `RSI extreme (${rsi.toFixed(1)})`}`, "hold", "SPY");
    return;
  }

  // ── Fetch options chain and execute ──
  const chain = await fetchSpyOptionsChain(data.currentPrice);
  if (!chain) {
    await logBot("warn", "Could not fetch SPY options chain — skipping", "data_error", "SPY");
    return;
  }

  const contract = direction === "call" ? chain.call : chain.put;
  if (!contract) {
    await logBot("warn", `No ATM ${direction} found in SPY options chain`, "data_error", "SPY");
    return;
  }

  const contractsToTrade = Math.max(1, Math.floor(maxPositionUsd / (contract.midPrice * 100)));
  const r = await executePaperBuyOption(brokerId, strategyId, contract, contractsToTrade);

  await logBot(
    "info",
    `[LIVE] SPY @ $${data.currentPrice.toFixed(2)} [${indicators}] → BUY ${direction.toUpperCase()} ${contract.contractSymbol} @ $${contract.midPrice.toFixed(2)} — ${reason}`,
    "buy",
    "SPY",
  );

  if (r.executed) {
    await db.insert(activityTable).values({
      type: "trade_opened",
      title: `Paper BUY ${direction.toUpperCase()}: SPY`,
      description: `${r.contracts}x ${contract.contractSymbol} @ $${contract.midPrice.toFixed(2)} premium (cost $${r.cost.toFixed(2)}) — strike $${contract.strike}, exp ${contract.expiry.toISOString().slice(0, 10)}`,
    });
    const [s] = await db.select().from(botStateTable).limit(1);
    if (s) {
      await db.update(botStateTable).set({ tradesExecutedToday: (s.tradesExecutedToday ?? 0) + 1 }).where(eq(botStateTable.id, s.id));
    }
  }

  // Update position price
  if (contract.midPrice > 0) {
    await updatePaperPositionPrices(brokerId, { SPY: contract.midPrice });
  }
}

// ─── Stock trading cycle ─────────────────────────────────────────────────

async function runStocksCycle(
  brokerId: number,
  strategy: { id: number; symbols: string[] | unknown; maxPositionSize: string | null; stopLossPercent: string | null; takeProfitPercent: string | null },
  rules: unknown[],
): Promise<void> {
  const symbols: string[] = Array.isArray(strategy.symbols) ? strategy.symbols : [];
  const maxPositionSize = parseFloat(strategy.maxPositionSize ?? "1000");
  const stopLossPercent = parseFloat(strategy.stopLossPercent ?? "2");
  const takeProfitPercent = parseFloat(strategy.takeProfitPercent ?? "5");
  const prices: Record<string, number> = {};

  for (const symbol of symbols) {
    try {
      const data = await fetchMarketData(symbol);
      if (!data) {
        await logBot("warn", `[SKIP] ${symbol} — could not fetch market data`, "data_error", symbol);
        continue;
      }
      prices[symbol] = data.currentPrice;

      const trigger = await checkStopLossTakeProfit(brokerId, symbol, data.currentPrice, stopLossPercent, takeProfitPercent);
      if (trigger) {
        const label = trigger === "stop_loss" ? "STOP-LOSS" : "TAKE-PROFIT";
        const result = await executePaperSell(brokerId, strategy.id, symbol, data.currentPrice);
        if (result.executed) {
          const pnlStr = result.realizedPnl >= 0 ? `+$${result.realizedPnl.toFixed(2)}` : `-$${Math.abs(result.realizedPnl).toFixed(2)}`;
          await logBot("info", `[${label}] ${symbol} @ $${data.currentPrice.toFixed(2)} — P&L: ${pnlStr}`, "sell", symbol);
          await db.insert(activityTable).values({ type: "trade_closed", title: `${label}: ${symbol} closed`, description: `Paper trade closed at $${data.currentPrice.toFixed(2)} — P&L: ${pnlStr}` });
          const [s] = await db.select().from(botStateTable).limit(1);
          if (s) await db.update(botStateTable).set({ tradesExecutedToday: (s.tradesExecutedToday ?? 0) + 1, dailyPnl: String(parseFloat(s.dailyPnl ?? "0") + result.realizedPnl) }).where(eq(botStateTable.id, s.id));
        }
        continue;
      }

      const snapshot = {
        symbol, rsi: data.rsi, maCondition: data.maCondition, volumeCondition: data.volumeCondition,
        trendCondition: data.trendCondition, aiSignal: null as string | null, aiConfidence: null as number | null,
        priceChangePercent: data.priceChangePercent, candlestickPattern: data.candlestickPattern,
        timeFrame: data.timeFrame, volumeIncreaseLevel: data.volumeIncreaseLevel,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decision = evaluateDecisionTable(rules as any[], snapshot);

      const indicators = [
        data.rsi !== null ? `RSI:${data.rsi.toFixed(1)}` : null,
        data.maCondition ? `MA:${data.maCondition}` : null,
        data.candlestickPattern ? `Pat:${data.candlestickPattern}` : null,
        data.volumeIncreaseLevel ? `Vol:${data.volumeIncreaseLevel}` : null,
        data.trendCondition ? `Trend:${data.trendCondition}` : null,
      ].filter(Boolean).join(" ");

      await logBot("info", `[LIVE] ${symbol} @ $${data.currentPrice.toFixed(2)} [${indicators}] → ${decision.action.toUpperCase()} — ${decision.reason}`, decision.action, symbol);

      if (decision.action === "buy") {
        const r = await executePaperBuy(brokerId, strategy.id, symbol, data.currentPrice, maxPositionSize * decision.quantityMultiplier);
        if (r.executed) {
          await db.insert(activityTable).values({ type: "trade_opened", title: `Paper BUY: ${symbol}`, description: `Bought ${r.quantity} shares @ $${data.currentPrice.toFixed(2)} (cost $${r.cost.toFixed(2)})` });
          const [s] = await db.select().from(botStateTable).limit(1);
          if (s) await db.update(botStateTable).set({ tradesExecutedToday: (s.tradesExecutedToday ?? 0) + 1 }).where(eq(botStateTable.id, s.id));
        }
      } else if (decision.action === "sell") {
        const r = await executePaperSell(brokerId, strategy.id, symbol, data.currentPrice);
        if (r.executed) {
          const pnlStr = r.realizedPnl >= 0 ? `+$${r.realizedPnl.toFixed(2)}` : `-$${Math.abs(r.realizedPnl).toFixed(2)}`;
          await db.insert(activityTable).values({ type: "trade_closed", title: `Paper SELL: ${symbol}`, description: `Sold @ $${data.currentPrice.toFixed(2)} — P&L: ${pnlStr}` });
          const [s] = await db.select().from(botStateTable).limit(1);
          if (s) await db.update(botStateTable).set({ tradesExecutedToday: (s.tradesExecutedToday ?? 0) + 1, dailyPnl: String(parseFloat(s.dailyPnl ?? "0") + r.realizedPnl) }).where(eq(botStateTable.id, s.id));
        }
      }
    } catch (err) {
      logger.error({ symbol, err }, "Error processing symbol in trading cycle");
      await logBot("error", `Error processing ${symbol}: ${String(err)}`, "error", symbol);
    }
  }

  if (Object.keys(prices).length > 0) await updatePaperPositionPrices(brokerId, prices);
}

// ─── Main trading loop ───────────────────────────────────────────────────

export async function runTradingCycle() {
  const state = await getState();
  if (!state?.isRunning) return;
  if (!state.activeStrategyId) return;

  await db.update(botStateTable).set({ lastHeartbeat: new Date() }).where(eq(botStateTable.id, state.id));

  const [strategy] = await db.select().from(strategiesTable).where(eq(strategiesTable.id, state.activeStrategyId));
  if (!strategy || !strategy.isActive) {
    await logBot("warn", "Active strategy not found or inactive — skipping cycle", "cycle_skip");
    return;
  }

  const paperBrokerId = await ensurePaperBroker();
  if (!state.activeBrokerId) {
    await db.update(botStateTable).set({ activeBrokerId: paperBrokerId }).where(eq(botStateTable.id, state.id));
  }
  const brokerId = state.activeBrokerId ?? paperBrokerId;

  const assetType = strategy.assetType ?? "stocks";
  await logBot("info", `[LIVE DATA] Cycle started: "${strategy.name}" — assetType:${assetType}`, "cycle_start");

  if (assetType === "options") {
    const stopLossPercent = parseFloat(strategy.stopLossPercent ?? "50");
    const takeProfitPercent = parseFloat(strategy.takeProfitPercent ?? "100");
    const maxPositionUsd = parseFloat(strategy.maxPositionSize ?? "2000");
    await runOptionsCycle(brokerId, strategy.id, stopLossPercent, takeProfitPercent, maxPositionUsd);
  } else {
    const rules = await db.select().from(decisionRulesTable).where(eq(decisionRulesTable.strategyId, strategy.id));
    await runStocksCycle(brokerId, strategy, rules);
  }

  await logBot("info", "Trading cycle complete", "cycle_end");
}

// ─── Cron Jobs ───────────────────────────────────────────────────────────

export function startScheduler() {
  logger.info("Starting market scheduler (America/New_York)");

  ensurePaperBroker().catch((e) => logger.error(e, "Failed to initialize paper broker"));
  refreshSchedule().catch((e) => logger.error(e, "Failed initial schedule refresh"));

  cron.schedule("0 * * * *", () => {
    refreshSchedule().catch((e) => logger.error(e, "Schedule refresh failed"));
  }, { timezone: ET_TZ });

  cron.schedule("30 9 * * 1-5", async () => {
    const state = await getState();
    if (state?.isRunning) { logger.info("Bot already running at market open"); return; }
    logger.info("Market open — starting bot");
    const paperBrokerId = await ensurePaperBroker();
    const [updated] = await db.update(botStateTable).set({ isRunning: true, startedAt: new Date(), lastHeartbeat: new Date(), activeBrokerId: paperBrokerId }).returning();
    if (updated) {
      await logBot("info", "Bot auto-started at market open (9:30 AM ET)", "auto_start");
      await db.insert(activityTable).values({ type: "bot_started", title: "Bot Started — Market Open", description: "Trading bot automatically activated at 9:30 AM ET" });
      await refreshSchedule();
    }
  }, { timezone: ET_TZ });

  cron.schedule("0 16 * * 1-5", async () => {
    const state = await getState();
    if (!state?.isRunning) return;
    logger.info("Market close — stopping bot");
    await db.update(botStateTable).set({ isRunning: false, tradesExecutedToday: 0, dailyPnl: "0" });
    await logBot("info", "Bot auto-stopped at market close (4:00 PM ET)", "auto_stop");
    await db.insert(activityTable).values({ type: "bot_stopped", title: "Bot Stopped — Market Close", description: "Trading bot automatically deactivated at 4:00 PM ET" });
    await refreshSchedule();
  }, { timezone: ET_TZ });

  cron.schedule("*/5 * * * 1-5", async () => {
    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: ET_TZ }));
    const h = nowET.getHours();
    const m = nowET.getMinutes();
    const minuteOfDay = h * 60 + m;
    if (minuteOfDay < 9 * 60 + 30 || minuteOfDay >= 16 * 60) return;
    await runTradingCycle().catch((e) => logger.error(e, "Trading cycle error"));
  }, { timezone: ET_TZ });

  cron.schedule("0 0 * * *", async () => {
    await db.update(botStateTable).set({ tradesExecutedToday: 0, dailyPnl: "0" }).where(eq(botStateTable.id, 1));
    await logBot("info", "Daily counters reset at midnight ET", "daily_reset");
  }, { timezone: ET_TZ });

  logger.info("Market scheduler ready — live market data + SPY options via Yahoo Finance");
}
