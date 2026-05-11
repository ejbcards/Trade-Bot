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
      .limit(10),
    db
      .select()
      .from(tradesTable)
      .orderBy(desc(tradesTable.closedAt))
      .limit(5),
    db
      .select()
      .from(botLogsTable)
      .where(gte(botLogsTable.createdAt, dayStart))
      .orderBy(desc(botLogsTable.createdAt))
      .limit(15),
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
      ? "none"
      : strategies
          .map((s) => `${s.name}: SL ${s.stopLossPercent ?? "?"}% TP ${s.takeProfitPercent ?? "?"}% maxPos $${s.maxPositionSize ?? "?"}`)
          .join("; ");

  const recentTradesSummary =
    recentTrades.length === 0
      ? "none"
      : recentTrades
          .map((t) => `${t.symbol} ${t.side} x${t.quantity} P&L $${parsePnl(t.realizedPnl).toFixed(2)}`)
          .join(", ");

  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });

  // --- Live market (compact single-line format) ---
  const spyLine = spyData
    ? `SPY $${spyData.currentPrice.toFixed(2)} (${spyData.priceChangePercent != null ? (spyData.priceChangePercent >= 0 ? "+" : "") + spyData.priceChangePercent.toFixed(2) + "%" : "?"}) | RSI ${spyData.rsi?.toFixed(1) ?? "?"} | trend:${spyData.trendCondition ?? "?"} | MA:${spyData.maCondition ?? "?"}`
    : "SPY data unavailable";

  const isHighVol = vixData?.isHighVolatility ?? false;
  const vixLine = vixData
    ? `VIX ${vixData.price.toFixed(2)} (${vixData.dayChangePercent >= 0 ? "+" : ""}${vixData.dayChangePercent.toFixed(2)}%) | regime:${isHighVol ? "HIGH — CALLs blocked, SL tightened" : "NORMAL"}`
    : "VIX data unavailable";

  // --- Pending signal ---
  const trend = spyData?.trendCondition ?? null;
  const rsi = spyData?.rsi ?? 50;
  let signal: string;

  if (!spyData) {
    signal = "UNAVAILABLE — market data missing";
  } else if (trend === "bullish" && rsi < 82) {
    signal = isHighVol
      ? `BLOCKED (bullish RSI ${rsi.toFixed(1)}) — high-vol, CALL entry blocked`
      : `CALL — bullish, MA:${spyData.maCondition}, RSI ${rsi.toFixed(1)}`;
  } else if (trend === "bearish" && rsi > 18) {
    signal = `PUT — bearish, RSI ${rsi.toFixed(1)}${isHighVol ? ", high-vol (SL tightened)" : ""}`;
  } else if (rsi >= 82) {
    signal = `HOLD — RSI overbought (${rsi.toFixed(1)})`;
  } else if (rsi <= 18) {
    signal = `HOLD — RSI oversold (${rsi.toFixed(1)})`;
  } else {
    signal = `HOLD — neutral (MA:${spyData.maCondition}, RSI ${rsi.toFixed(1)})`;
  }

  // --- Decision logs (compact, 6 most recent key entries) ---
  const decisionKeywords = ["BUY", "SELL", "HOLD", "SKIP", "TAKE-PROFIT", "STOP-LOSS", "ROLLING-STOP", "FLIP", "VOL-REGIME", "VOL-FILTER", "RSI", "VIX"];
  const decisionLogs = recentLogs
    .filter((l) => decisionKeywords.some((kw) => l.message.toUpperCase().includes(kw)))
    .slice(0, 6)
    .map((l) => {
      const ts = new Date(l.createdAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" });
      return `${ts} ${l.message}`;
    })
    .join("\n");

  return `You are GoldenMoose, an AI trading assistant. Friendly, candid, conversational. You have live portfolio + market data injected below — use it to give specific, grounded answers. Be concise unless asked for detail. Never guarantee outcomes.

Time (ET): ${now}
Bot: ${state?.isRunning ? "RUNNING" : "STOPPED"}${state?.activeStrategyId ? ` | strategy #${state.activeStrategyId}` : ""}

MARKET: ${spyLine}
VIX: ${vixLine}
SIGNAL NOW: ${signal}

PORTFOLIO: value $${totalAccountValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} | buying power $${totalBuyingPower.toLocaleString("en-US", { maximumFractionDigits: 0 })} | daily P&L $${dailyPnl.toFixed(2)} (${dailyPnlPercent.toFixed(2)}%) | realized $${dailyRealizedPnl.toFixed(2)} | unrealized $${totalUnrealizedPnl.toFixed(2)}

POSITIONS (${positions.length}): ${positions.length === 0 ? "none" : positions.map((p) => `${p.symbol} qty=${p.quantity} entry $${p.entryPrice} cur $${p.currentPrice ?? "?"} P&L $${parsePnl(p.unrealizedPnl).toFixed(2)}`).join("; ")}

STRATEGIES: ${strategiesSummary}

RECENT TRADES: ${recentTradesSummary}

DECISION LOG (today):
${decisionLogs || "No decisions logged yet today."}`;
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
