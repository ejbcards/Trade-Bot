import { Router, type IRouter } from "express";
import { eq, desc, asc, and, isNotNull, gte } from "drizzle-orm";
import {
  db,
  conversations,
  messages,
  brokersTable,
  strategiesTable,
  tradesTable,
  positionsTable,
  botStateTable,
  botLogsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { startOfDay } from "date-fns";
import { fetchMarketData, fetchVixData } from "../lib/marketData";

const router: IRouter = Router();

function parsePnl(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

async function buildSystemPrompt(): Promise<string> {
  const dayStart = startOfDay(new Date());

  const [
    brokers,
    strategies,
    positions,
    botState,
    todayTrades,
    recentTrades,
    recentLogs,
    spyData,
    vixData,
  ] = await Promise.all([
    db.select().from(brokersTable).where(eq(brokersTable.isActive, true)),
    db.select().from(strategiesTable).where(eq(strategiesTable.isActive, true)),
    db.select().from(positionsTable),
    db.select().from(botStateTable).limit(1),
    db
      .select()
      .from(tradesTable)
      .where(
        and(
          isNotNull(tradesTable.closedAt),
          gte(tradesTable.closedAt, dayStart),
          eq(tradesTable.status, "closed"),
        ),
      )
      .orderBy(desc(tradesTable.closedAt))
      .limit(20),
    db
      .select()
      .from(tradesTable)
      .orderBy(desc(tradesTable.closedAt))
      .limit(10),
    db
      .select()
      .from(botLogsTable)
      .where(gte(botLogsTable.createdAt, dayStart))
      .orderBy(desc(botLogsTable.createdAt))
      .limit(40),
    fetchMarketData("SPY").catch(() => null),
    fetchVixData().catch(() => null),
  ]);

  const state = botState[0];
  const totalAccountValue = brokers.reduce(
    (sum, b) => sum + (b.accountValue ? parseFloat(b.accountValue) : 0),
    0,
  );
  const totalBuyingPower = brokers.reduce(
    (sum, b) => sum + (b.buyingPower ? parseFloat(b.buyingPower) : 0),
    0,
  );
  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + parsePnl(p.unrealizedPnl),
    0,
  );
  const dailyRealizedPnl = todayTrades.reduce(
    (sum, t) => sum + parsePnl(t.realizedPnl),
    0,
  );
  const dailyPnl = dailyRealizedPnl + totalUnrealizedPnl;
  const dailyPnlPercent =
    totalAccountValue > 0 ? (dailyPnl / totalAccountValue) * 100 : 0;

  const positionsSummary =
    positions.length === 0
      ? "No open positions."
      : positions
          .map(
            (p) =>
              `  - ${p.symbol} (${p.assetType}): qty=${p.quantity} @ entry $${p.entryPrice}, ` +
              `current $${p.currentPrice ?? "N/A"}, unrealized P&L: $${parsePnl(p.unrealizedPnl).toFixed(2)}`,
          )
          .join("\n");

  const strategiesSummary =
    strategies.length === 0
      ? "No active strategies."
      : strategies
          .map(
            (s) =>
              `  - ${s.name} (${s.aiModel ?? "unknown model"}): ` +
              `stop-loss ${s.stopLossPercent ?? "N/A"}%, take-profit ${s.takeProfitPercent ?? "N/A"}%, ` +
              `max position size $${s.maxPositionSize ?? "N/A"}, max daily loss $${s.maxDailyLoss ?? "N/A"}`,
          )
          .join("\n");

  const recentTradesSummary =
    recentTrades.length === 0
      ? "No recent trades."
      : recentTrades
          .map(
            (t) =>
              `  - ${t.symbol} ${t.side} ${t.quantity} @ $${t.entryPrice}: ` +
              `realized P&L $${parsePnl(t.realizedPnl).toFixed(2)} (${t.status})`,
          )
          .join("\n");

  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
    timeStyle: "short",
  });

  // --- Live market analysis ---
  const marketSection = spyData
    ? `SPY Price: $${spyData.currentPrice.toFixed(2)} (${spyData.priceChangePercent != null ? (spyData.priceChangePercent >= 0 ? "+" : "") + spyData.priceChangePercent.toFixed(2) + "%" : "N/A"})
RSI (14): ${spyData.rsi != null ? spyData.rsi.toFixed(1) : "N/A"}
Trend: ${spyData.trendCondition ?? "N/A"}
50-day MA: price is ${spyData.maCondition ?? "N/A"} moving average
Volume: ${spyData.volumeCondition ?? "N/A"}${spyData.candlestickPattern ? `\nCandlestick pattern: ${spyData.candlestickPattern}` : ""}`
    : "Market data currently unavailable.";

  const vixSection = vixData
    ? `VIX Price: ${vixData.price.toFixed(2)} (${vixData.dayChangePercent >= 0 ? "+" : ""}${vixData.dayChangePercent.toFixed(2)}% today)
Volatility Regime: ${vixData.isHighVolatility ? "HIGH — CALL entries blocked, PUT entries allowed, stop losses tightened" : "NORMAL — all entries permitted per strategy guardrails"}`
    : "VIX data currently unavailable.";

  // --- Pending signal (what the bot would do right now) ---
  const trend = spyData?.trendCondition ?? null;
  const rsi = spyData?.rsi ?? 50;
  const isHighVol = vixData?.isHighVolatility ?? false;
  let signalDirection: string;
  let signalReason: string;

  if (!spyData) {
    signalDirection = "UNAVAILABLE";
    signalReason = "Cannot compute signal — market data unavailable";
  } else if (trend === "bullish" && rsi < 82) {
    if (isHighVol) {
      signalDirection = "BLOCKED (would be CALL)";
      signalReason = `SPY is bullish (RSI ${rsi.toFixed(1)}) but CALL entry is blocked by high-vol regime`;
    } else {
      signalDirection = "CALL";
      signalReason = `SPY bullish: MA ${spyData.maCondition ?? "N/A"}, RSI ${rsi.toFixed(1)} — bot would BUY a CALL`;
    }
  } else if (trend === "bearish" && rsi > 18) {
    signalDirection = "PUT";
    signalReason = isHighVol
      ? `SPY bearish + high-vol regime — bot would BUY a PUT with tightened stop loss (RSI ${rsi.toFixed(1)})`
      : `SPY bearish: MA ${spyData.maCondition ?? "N/A"}, RSI ${rsi.toFixed(1)} — bot would BUY a PUT`;
  } else if (rsi >= 82) {
    signalDirection = "HOLD (RSI overbought)";
    signalReason = `RSI at ${rsi.toFixed(1)} — no entries until momentum cools`;
  } else if (rsi <= 18) {
    signalDirection = "HOLD (RSI oversold)";
    signalReason = `RSI at ${rsi.toFixed(1)} — no entries until bounce confirmed`;
  } else {
    signalDirection = "HOLD (neutral)";
    signalReason = `Neutral trend — waiting for directional signal (MA: ${spyData.maCondition ?? "N/A"}, RSI: ${rsi.toFixed(1)})`;
  }

  // --- Recent bot decision logs (today only, key decisions) ---
  const decisionKeywords = [
    "BUY", "SELL", "HOLD", "SKIP", "TAKE-PROFIT", "STOP-LOSS", "ROLLING-STOP",
    "FLIP", "VOL-REGIME", "VOL-FILTER", "WEEKEND-CLOSE", "RSI", "VIX", "SIGNAL",
  ];
  const decisionLogs = recentLogs
    .filter((l) => decisionKeywords.some((kw) => l.message.toUpperCase().includes(kw.toUpperCase())))
    .slice(0, 20);

  const logsSection = decisionLogs.length === 0
    ? "No decision logs for today yet."
    : decisionLogs
        .map((l) => {
          const ts = new Date(l.createdAt).toLocaleTimeString("en-US", {
            timeZone: "America/New_York",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          const sym = l.symbol ? ` [${l.symbol}]` : "";
          const act = l.action ? ` (${l.action})` : "";
          return `  [${ts} ET]${sym}${act} ${l.message}`;
        })
        .join("\n");

  return `You are the GoldenMoose AI trading assistant — a knowledgeable, candid trading companion who speaks conversationally. You have real-time access to live market data, bot decision logs, portfolio status, and current signals refreshed at message time.

Current time (ET): ${now}

=== BOT STATUS ===
Running: ${state?.isRunning ? "YES" : "NO"}
${state?.activeStrategyId ? `Active Strategy ID: ${state.activeStrategyId}` : "No active strategy"}
${state?.activeBrokerId ? `Active Broker ID: ${state.activeBrokerId}` : ""}

=== LIVE MARKET ANALYSIS ===
${marketSection}

=== VOLATILITY REGIME ===
${vixSection}

=== PENDING SIGNAL (what the bot would do RIGHT NOW) ===
Direction: ${signalDirection}
Reasoning: ${signalReason}

=== PORTFOLIO OVERVIEW ===
Total Account Value: $${totalAccountValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Buying Power: $${totalBuyingPower.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Daily P&L: $${dailyPnl.toFixed(2)} (${dailyPnlPercent.toFixed(2)}%)
  - Realized today: $${dailyRealizedPnl.toFixed(2)}
  - Unrealized: $${totalUnrealizedPnl.toFixed(2)}

=== OPEN POSITIONS (${positions.length}) ===
${positionsSummary}

=== ACTIVE STRATEGIES ===
${strategiesSummary}

=== RECENT TRADES ===
${recentTradesSummary}

=== TODAY'S BOT DECISION LOG ===
${logsSection}

=== YOUR ROLE ===
- Answer questions about the current portfolio, positions, P&L, and trading activity.
- Explain what the bot is doing and why — use the live market analysis, pending signal, and decision log above to give specific, accurate answers.
- Interpret the decision log: explain why the bot held, blocked a trade, exited, or flipped direction.
- Offer thoughtful trading insights, risk observations, and market context grounded in the live data you have.
- Be honest about uncertainty — if you don't know something, say so.
- Keep responses concise unless the user asks for detail.
- Never give financial advice that guarantees outcomes. Always note trading carries risk.`;
}

router.get(
  "/anthropic/conversations",
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
    res.json(rows);
  },
);

router.post(
  "/anthropic/conversations",
  async (req, res): Promise<void> => {
    const { title } = req.body as { title?: string };
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const [row] = await db
      .insert(conversations)
      .values({ title: title.trim() })
      .returning();
    res.status(201).json(row);
  },
);

router.get(
  "/anthropic/conversations/:id",
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  },
);

router.delete(
  "/anthropic/conversations/:id",
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).end();
  },
);

router.get(
  "/anthropic/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json(msgs);
  },
);

router.post(
  "/anthropic/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db
      .insert(messages)
      .values({ conversationId: id, role: "user", content: content.trim() });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    const systemPrompt = await buildSystemPrompt();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let fullResponse = "";

    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          fullResponse += event.delta.text;
          res.write(
            `data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`,
          );
        }
      }

      await db.insert(messages).values({
        conversationId: id,
        role: "assistant",
        content: fullResponse,
      });

      res.write(
        `data: ${JSON.stringify({ type: "done", content: fullResponse })}\n\n`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
    } finally {
      res.end();
    }
  },
);

export default router;
