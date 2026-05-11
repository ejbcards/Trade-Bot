import cron from "node-cron";
import { db, botStateTable, botLogsTable, activityTable, strategiesTable, decisionRulesTable, brokersTable, positionsTable } from "@workspace/db";
import { generateAndSaveRecap } from "../routes/recap";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { evaluateDecisionTable } from "./decisionEngine";
import { fetchMarketData, fetchSpyOptionsChain, fetchVixData } from "./marketData";
import { fetchLiveOptionPrices } from "./liveQuotes";
import {
  ensurePaperBroker,
  executePaperBuy,
  executePaperSell,
  executePaperBuyOption,
  executePaperSellOptionById,
  getAllOpenOptionsPositions,
  checkStopLossTakeProfit,
  updatePaperPositionPrices,
  MAX_CONCURRENT_OPTIONS,
} from "./paperTrading";
import { executeAlpacaBuyOption, executeAlpacaSellOptionById, syncAlpacaPositionPrices, getAlpacaAccount } from "./alpacaBroker";

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

// ─── Shared state updater ────────────────────────────────────────────────

async function incrementBotCounters(tradesCount: number, pnlDelta: number) {
  const [s] = await db.select().from(botStateTable).limit(1);
  if (!s) return;
  await db.update(botStateTable).set({
    tradesExecutedToday: (s.tradesExecutedToday ?? 0) + tradesCount,
    dailyPnl: String(parseFloat(s.dailyPnl ?? "0") + pnlDelta),
  }).where(eq(botStateTable.id, s.id));
}

// ─── Options trading cycle ───────────────────────────────────────────────
//
// Supports:
//   • Multiple concurrent positions (up to MAX_CONCURRENT_OPTIONS)
//   • Direction flip (day trade): close opposite-side positions when trend reverses
//   • Per-position stop-loss / take-profit checked every cycle
//

async function runOptionsCycle(
  brokerId: number,
  strategyId: number,
  stopLossPercent: number,
  takeProfitPercent: number,
  rollingStopPercent: number,
  rsiOverbought: number,
  rsiOversold: number,
  maxPositionUsd: number,
): Promise<void> {
  // ── 0. Resolve broker — detect Alpaca to route orders accordingly ───────
  const [activeBroker] = await db.select().from(brokersTable).where(eq(brokersTable.id, brokerId));
  const isAlpaca = activeBroker?.brokerType === "alpaca" && !!activeBroker.apiKey && !!activeBroker.apiSecret;

  // ── 1. Fetch live SPY data + VIX volatility filter ─────────────────────
  const [data, vixData] = await Promise.all([fetchMarketData("SPY"), fetchVixData()]);
  if (!data) {
    await logBot("warn", "[SKIP] SPY — could not fetch market data", "data_error", "SPY");
    return;
  }

  // ── 1a. Volatility regime check ─────────────────────────────────────────
  //
  //  High-volatility conditions (either triggers the regime):
  //    • VIX price > $23
  //    • VIX spiked > +2% on the day
  //
  //  During high-volatility regime:
  //    • Stop losses tightened to 15% on both calls and puts
  //    • New CALL entries are blocked (avoid longs when fear is elevated)
  //    • PUT entries are still allowed if the signal is bearish (lean short)
  //
  const isHighVolatility = vixData?.isHighVolatility ?? false;
  const vixLabel = vixData
    ? `VIX $${vixData.price.toFixed(2)} (${vixData.dayChangePercent >= 0 ? "+" : ""}${vixData.dayChangePercent.toFixed(2)}%)`
    : "VIX unavailable";

  if (isHighVolatility) {
    await logBot(
      "warn",
      `[VOL-REGIME] ${vixLabel} — elevated volatility detected. Stop losses clamped to 15%. Call entries blocked; leaning PUTS.`,
      "vol_filter",
      "VIX",
    );
  }

  // During high volatility, tighten stop loss to 15% regardless of strategy setting
  const effectiveStopLoss = isHighVolatility ? Math.min(stopLossPercent, 15) : stopLossPercent;

  const trend = data.trendCondition;
  const rsi = data.rsi ?? 50;

  const indicators = [
    data.rsi !== null ? `RSI:${data.rsi.toFixed(1)}` : null,
    data.maCondition ? `MA:${data.maCondition}` : null,
    data.candlestickPattern ? `Pat:${data.candlestickPattern}` : null,
    data.trendCondition ? `Trend:${data.trendCondition}` : null,
    vixData ? `VIX:${vixData.price.toFixed(1)}${isHighVolatility ? "⚠" : ""}` : null,
  ].filter(Boolean).join(" ");

  // ── 2. Fetch options chain (used for SL/TP prices + new entry) ──────────
  const chain = await fetchSpyOptionsChain(data.currentPrice, maxPositionUsd);
  const callPremium = chain?.call?.midPrice ?? chain?.call?.lastPrice ?? 0;
  const putPremium = chain?.put?.midPrice ?? chain?.put?.lastPrice ?? 0;

  // ── 3. Layered exit checks on every open position ────────────────────────
  //
  //  Priority order:
  //   A) Indicator exit  — thesis breakdown (trend flip or RSI extreme)
  //   B) Fixed TP        — ceiling, take profits quickly
  //   C) Effective stop  — max(rolling stop from peak, fixed SL from entry)
  //
  const openPositions = await getAllOpenOptionsPositions(brokerId, strategyId);

  // Fetch real prices for each held contract — not a generic ATM proxy
  const heldSymbols = openPositions.map((p) => p.contractSymbol).filter((s): s is string => !!s);
  const liveQuotes = heldSymbols.length > 0 ? await fetchLiveOptionPrices(heldSymbols) : {};

  for (const pos of openPositions) {
    const isCall = pos.optionType === "call" || pos.side === "long_call";
    const quote = pos.contractSymbol ? liveQuotes[pos.contractSymbol] : null;

    const currentPremium = quote?.mark && quote.mark > 0
      ? quote.mark
      : (isCall ? callPremium : putPremium);

    if (currentPremium <= 0) continue;

    const entryPrice = parseFloat(pos.entryPrice);
    const changePct = entryPrice > 0 ? ((currentPremium - entryPrice) / entryPrice) * 100 : 0;

    // Update high water mark — track the peak premium this position has reached
    const storedHWM = pos.highWaterMark ? parseFloat(pos.highWaterMark) : entryPrice;
    const highWaterMark = Math.max(storedHWM, currentPremium);
    if (highWaterMark > storedHWM) {
      await db.update(positionsTable).set({ highWaterMark: String(highWaterMark) }).where(eq(positionsTable.id, pos.id));
    }

    // Compute effective stop level: rolling stop (once in profit) or fixed SL floor
    // During high-volatility regime, effectiveStopLoss is clamped to 15%
    const fixedStopLevel = entryPrice * (1 - effectiveStopLoss / 100);
    const rollingStopLevel = highWaterMark * (1 - rollingStopPercent / 100);
    const usingRollingStop = highWaterMark > entryPrice && rollingStopLevel > fixedStopLevel;
    const effectiveStopLevel = Math.max(fixedStopLevel, rollingStopLevel);

    // A) Indicator-based exit — exit when the thesis breaks down
    let exitTrigger: string | null = null;
    let exitReason = "";

    if (isCall && trend === "bearish") {
      // Trend flipped against us — primary exit signal
      exitTrigger = "SIGNAL-FLIP";
      exitReason = `trend turned bearish (RSI:${rsi.toFixed(1)}, MA:${data.maCondition})`;
    } else if (isCall && trend !== "bullish" && rsi >= rsiOverbought) {
      // Trend lost conviction AND RSI is truly extreme — secondary exit
      // (if trend is still bullish, high RSI is momentum, not exhaustion)
      exitTrigger = "RSI-EXTREME";
      exitReason = `RSI overbought at ${rsi.toFixed(1)} with ${trend} trend — momentum exhausted`;
    } else if (!isCall && trend === "bullish") {
      exitTrigger = "SIGNAL-FLIP";
      exitReason = `trend turned bullish (RSI:${rsi.toFixed(1)}, MA:${data.maCondition})`;
    } else if (!isCall && trend !== "bearish" && rsi <= rsiOversold) {
      exitTrigger = "RSI-EXTREME";
      exitReason = `RSI oversold at ${rsi.toFixed(1)} with ${trend} trend — momentum exhausted`;
    }

    // B) Fixed take profit
    if (!exitTrigger && changePct >= takeProfitPercent) {
      exitTrigger = "TAKE-PROFIT";
      exitReason = `+${changePct.toFixed(1)}% hit TP target (${takeProfitPercent}%)`;
    }

    // C) Effective stop (rolling or fixed SL)
    if (!exitTrigger && currentPremium <= effectiveStopLevel) {
      exitTrigger = usingRollingStop ? "ROLLING-STOP" : "STOP-LOSS";
      exitReason = usingRollingStop
        ? `dropped ${rollingStopPercent}% from peak $${highWaterMark.toFixed(2)} → stop $${rollingStopLevel.toFixed(2)}`
        : `down ${Math.abs(changePct).toFixed(1)}% from entry (floor $${fixedStopLevel.toFixed(2)})`;
    }

    logger.info(
      { contract: pos.contractSymbol, entryPrice, currentPremium, changePct: changePct.toFixed(1), hwm: highWaterMark.toFixed(2), effectiveStop: effectiveStopLevel.toFixed(2), exitTrigger: exitTrigger ?? "none" },
      "Exit check",
    );

    if (exitTrigger) {
      const result = isAlpaca
        ? await executeAlpacaSellOptionById(activeBroker, pos.id, currentPremium)
        : await executePaperSellOptionById(brokerId, pos.id, currentPremium);
      if (result.executed) {
        const pnlStr = result.realizedPnl >= 0 ? `+$${result.realizedPnl.toFixed(2)}` : `-$${Math.abs(result.realizedPnl).toFixed(2)}`;
        await logBot("info", `[${exitTrigger}] ${result.contractSymbol} @ $${currentPremium.toFixed(2)} — ${exitReason} — P&L: ${pnlStr}`, "sell", "SPY");
        await db.insert(activityTable).values({
          type: "trade_closed",
          title: `${exitTrigger}: ${isCall ? "CALL" : "PUT"} closed`,
          description: `${result.contractSymbol} @ $${currentPremium.toFixed(2)} — ${exitReason} — P&L: ${pnlStr}`,
        });
        await incrementBotCounters(1, result.realizedPnl);
      }
    }
  }

  // ── 4. Determine direction signal ──────────────────────────────────────
  // (trend + rsi already declared above for use in exit checks)

  // Relaxed RSI gates for day trading (72→78 / 28→22)
  let direction: "call" | "put" | null = null;
  let reason = "";

  if (trend === "bullish" && rsi < 78) {
    if (isHighVolatility) {
      // During high-volatility regime: block new call entries.
      // "Avoid opening new positions" when VIX is elevated — lean short instead.
      await logBot(
        "warn",
        `[VOL-FILTER] ${vixLabel} — SPY shows bullish signal but CALL entry blocked. ${isHighVolatility ? "High-vol regime: lean PUTS only." : ""}`,
        "vol_filter",
        "SPY",
      );
      return;
    }
    direction = "call";
    reason = `SPY bullish (MA:${data.maCondition}, RSI:${rsi.toFixed(1)}) — buy CALL`;
  } else if (trend === "bearish" && rsi > 22) {
    direction = "put";
    reason = isHighVolatility
      ? `SPY bearish + ${vixLabel} — elevated vol → leaning PUT (MA:${data.maCondition}, RSI:${rsi.toFixed(1)}, SL:15%)`
      : `SPY bearish (MA:${data.maCondition}, RSI:${rsi.toFixed(1)}) — buy PUT`;
  } else {
    await logBot(
      "info",
      `[LIVE] SPY @ $${data.currentPrice.toFixed(2)} [${indicators}] → HOLD — ${trend === "neutral" ? "neutral trend" : `RSI extreme (${rsi.toFixed(1)})`}`,
      "hold",
      "SPY",
    );
    return;
  }

  // ── 5. Direction flip — close opposite positions (day trade) ────────────
  const oppositeType = direction === "call" ? "put" : "call";
  const afterSlTp = await getAllOpenOptionsPositions(brokerId, strategyId);

  for (const pos of afterSlTp) {
    const posType = pos.optionType ?? (pos.side === "long_call" ? "call" : "put");
    if (posType !== oppositeType) continue;

    // Use the opposite-direction premium for the closing price
    const closePremium = direction === "call" ? putPremium : callPremium;
    if (closePremium <= 0) continue;

    const result = isAlpaca
      ? await executeAlpacaSellOptionById(activeBroker, pos.id, closePremium)
      : await executePaperSellOptionById(brokerId, pos.id, closePremium);
    if (result.executed) {
      const pnlStr = result.realizedPnl >= 0 ? `+$${result.realizedPnl.toFixed(2)}` : `-$${Math.abs(result.realizedPnl).toFixed(2)}`;
      await logBot(
        "info",
        `[FLIP] Closing ${oppositeType.toUpperCase()} ${result.contractSymbol} @ $${closePremium.toFixed(2)} — P&L: ${pnlStr} (trend reversed to ${direction})`,
        "sell",
        "SPY",
      );
      await db.insert(activityTable).values({
        type: "trade_closed",
        title: `Direction Flip: ${oppositeType.toUpperCase()} → ${direction.toUpperCase()}`,
        description: `${result.contractSymbol} closed @ $${closePremium.toFixed(2)} — P&L: ${pnlStr}`,
      });
      await incrementBotCounters(1, result.realizedPnl);
    }
  }

  // ── 6. Open a new position if below the concurrent limit ────────────────
  if (!chain) {
    await logBot("warn", "Could not fetch SPY options chain — skipping entry", "data_error", "SPY");
    return;
  }

  const contract = direction === "call" ? chain.call : chain.put;
  if (!contract) {
    await logBot("warn", `No ATM ${direction} found in SPY options chain`, "data_error", "SPY");
    return;
  }

  const currentOpen = await getAllOpenOptionsPositions(brokerId, strategyId);
  if (currentOpen.length >= MAX_CONCURRENT_OPTIONS) {
    await logBot("info", `[SKIP] Max concurrent positions (${MAX_CONCURRENT_OPTIONS}) reached`, "hold", "SPY");
    return;
  }

  const contractsToTrade = Math.max(1, Math.floor(maxPositionUsd / (contract.midPrice * 100)));
  const r = isAlpaca
    ? await executeAlpacaBuyOption(activeBroker, strategyId, contract, contractsToTrade)
    : await executePaperBuyOption(brokerId, strategyId, contract, contractsToTrade);

  const brokerLabel = isAlpaca ? "Alpaca" : "Paper";
  await logBot(
    "info",
    `[${brokerLabel.toUpperCase()}] SPY @ $${data.currentPrice.toFixed(2)} [${indicators}] → BUY ${direction.toUpperCase()} ${contract.contractSymbol} @ $${contract.midPrice.toFixed(2)} — ${reason}`,
    "buy",
    "SPY",
  );

  if (r.executed) {
    await db.insert(activityTable).values({
      type: "trade_opened",
      title: `${brokerLabel} BUY ${direction.toUpperCase()}: SPY`,
      description: `${r.contracts}x ${contract.contractSymbol} @ $${contract.midPrice.toFixed(2)} premium (cost $${r.cost.toFixed(2)}) — strike $${contract.strike}, exp ${contract.expiry.toISOString().slice(0, 10)}`,
    });
    const [s] = await db.select().from(botStateTable).limit(1);
    if (s) {
      await db.update(botStateTable).set({ tradesExecutedToday: (s.tradesExecutedToday ?? 0) + 1 }).where(eq(botStateTable.id, s.id));
    }
  }

  // Sync position prices — Alpaca uses their official mark; paper uses live bid/ask mid
  if (isAlpaca) {
    await syncAlpacaPositionPrices(activeBroker);
  } else {
    const livePricesMap: Record<string, number> = {};
    for (const [sym, q] of Object.entries(liveQuotes)) {
      if (q.mark > 0) livePricesMap[sym] = q.mark;
    }
    if (contract.midPrice > 0) livePricesMap[contract.contractSymbol] = contract.midPrice;
    await updatePaperPositionPrices(brokerId, livePricesMap);
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

// ─── Weekend close — flatten all positions by 3:30 PM ET on Fridays ─────────
//
// Options lose time value over the weekend without any chance to react.
// This routine closes every open position regardless of P&L, then stops the bot.
//

async function closeAllPositionsForWeekend(): Promise<void> {
  const openPositions = await db
    .select({
      id: positionsTable.id,
      brokerId: positionsTable.brokerId,
      strategyId: positionsTable.strategyId,
      contractSymbol: positionsTable.contractSymbol,
      optionType: positionsTable.optionType,
      side: positionsTable.side,
      entryPrice: positionsTable.entryPrice,
    })
    .from(positionsTable);

  if (openPositions.length === 0) {
    await logBot("info", "[WEEKEND-CLOSE] No open positions to close — already flat", "weekend_close");
    return;
  }

  await logBot("info", `[WEEKEND-CLOSE] Closing ${openPositions.length} position(s) before weekend`, "weekend_close");

  // Fetch live quotes for all held contracts in one shot
  const contractSymbols = openPositions.map((p) => p.contractSymbol).filter((s): s is string => !!s);
  const liveQuotes = contractSymbols.length > 0 ? await fetchLiveOptionPrices(contractSymbols) : {};

  // Resolve brokers once (keyed by brokerId)
  const brokerIds = [...new Set(openPositions.map((p) => p.brokerId))];
  const brokerRows = await db.select().from(brokersTable).where(inArray(brokersTable.id, brokerIds));
  const brokerMap = Object.fromEntries(brokerRows.map((b) => [b.id, b]));

  let totalRealizedPnl = 0;
  let closedCount = 0;

  for (const pos of openPositions) {
    const broker = brokerMap[pos.brokerId];
    // Re-fetch broker if not in initial batch (multiple brokers edge case)
    const activeBroker = broker ?? (await db.select().from(brokersTable).where(eq(brokersTable.id, pos.brokerId)).then((r) => r[0]));
    if (!activeBroker) continue;

    const isAlpaca = activeBroker.brokerType === "alpaca" && !!activeBroker.apiKey && !!activeBroker.apiSecret;
    const quote = pos.contractSymbol ? liveQuotes[pos.contractSymbol] : null;
    const closingPrice = (quote?.mark && quote.mark > 0) ? quote.mark : parseFloat(pos.entryPrice);

    const result = isAlpaca
      ? await executeAlpacaSellOptionById(activeBroker, pos.id, closingPrice)
      : await executePaperSellOptionById(pos.brokerId, pos.id, closingPrice);

    if (result.executed) {
      totalRealizedPnl += result.realizedPnl;
      closedCount++;
      const pnlStr = result.realizedPnl >= 0 ? `+$${result.realizedPnl.toFixed(2)}` : `-$${Math.abs(result.realizedPnl).toFixed(2)}`;
      await logBot(
        "info",
        `[WEEKEND-CLOSE] ${result.contractSymbol} closed @ $${closingPrice.toFixed(2)} — P&L: ${pnlStr}`,
        "sell",
        "SPY",
      );
    }
  }

  const totalStr = totalRealizedPnl >= 0 ? `+$${totalRealizedPnl.toFixed(2)}` : `-$${Math.abs(totalRealizedPnl).toFixed(2)}`;
  await logBot("info", `[WEEKEND-CLOSE] Done — ${closedCount} position(s) closed, total P&L: ${totalStr}`, "weekend_close");
  await db.insert(activityTable).values({
    type: "bot_stopped",
    title: "Weekend Close — All Positions Flattened",
    description: `${closedCount} position(s) closed before weekend. Total realized P&L: ${totalStr}`,
  });

  // Stop the bot so it won't re-enter over the weekend
  await db.update(botStateTable).set({ isRunning: false, tradesExecutedToday: 0, dailyPnl: "0" });
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
    const rollingStopPercent = parseFloat(strategy.rollingStopPercent ?? "20");
    const rsiOverbought = parseFloat(strategy.rsiOverbought ?? "82");
    const rsiOversold = parseFloat(strategy.rsiOversold ?? "18");
    const maxPositionUsd = parseFloat(strategy.maxPositionSize ?? "2000");
    await runOptionsCycle(brokerId, strategy.id, stopLossPercent, takeProfitPercent, rollingStopPercent, rsiOverbought, rsiOversold, maxPositionUsd);
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

  // Friday 3:30 PM ET — close all positions before the weekend
  // Runs 30 minutes before market close so we get good liquidity on exits.
  cron.schedule("30 15 * * 5", async () => {
    logger.info("Friday 3:30 PM ET — closing all positions for weekend");
    await closeAllPositionsForWeekend().catch((e) => logger.error(e, "Weekend close failed"));
    await refreshSchedule();
  }, { timezone: ET_TZ });

  cron.schedule("0 16 * * 1-5", async () => {
    const state = await getState();
    if (!state?.isRunning) return;
    logger.info("Market close — stopping bot");
    await db.update(botStateTable).set({ isRunning: false, tradesExecutedToday: 0, dailyPnl: "0" });
    await logBot("info", "Bot auto-stopped at market close (4:00 PM ET)", "auto_stop");
    await db.insert(activityTable).values({ type: "bot_stopped", title: "Bot Stopped — Market Close", description: "Trading bot automatically deactivated at 4:00 PM ET" });
    await refreshSchedule();

    // Auto-generate the day recap at market close
    logger.info("Generating day recap...");
    generateAndSaveRecap().then(() => {
      logger.info("Day recap generated successfully");
    }).catch((e) => logger.error(e, "Day recap generation failed"));
  }, { timezone: ET_TZ });

  cron.schedule("*/30 * * * * 1-5", async () => {
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

  // Refresh Alpaca account equity + buying power every minute — keeps dashboard
  // in sync with Alpaca even when the bot is stopped or outside market hours.
  cron.schedule("* * * * *", async () => {
    try {
      const alpacaBrokers = await db
        .select()
        .from(brokersTable)
        .where(and(eq(brokersTable.brokerType, "alpaca"), eq(brokersTable.status, "connected")));

      for (const broker of alpacaBrokers) {
        if (!broker.apiKey || !broker.apiSecret) continue;
        const isPaper = !broker.accountId || broker.accountId.startsWith("paper");
        const account = await getAlpacaAccount(broker.apiKey, broker.apiSecret, isPaper);
        if (account) {
          await db
            .update(brokersTable)
            .set({ accountValue: String(account.equity), buyingPower: String(account.buyingPower) })
            .where(eq(brokersTable.id, broker.id));
        }
      }
    } catch (err) {
      logger.warn({ err }, "Alpaca account value refresh failed");
    }
  });

  logger.info("Market scheduler ready — live market data + SPY options via Yahoo Finance");
}
