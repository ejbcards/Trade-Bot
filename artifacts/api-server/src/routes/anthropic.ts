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
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { startOfDay } from "date-fns";

const router: IRouter = Router();

function parsePnl(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

async function buildSystemPrompt(): Promise<string> {
  const [brokers, strategies, positions, botState, todayTrades, recentTrades] =
    await Promise.all([
      db.select().from(brokersTable).where(eq(brokersTable.isActive, true)),
      db
        .select()
        .from(strategiesTable)
        .where(eq(strategiesTable.isActive, true)),
      db.select().from(positionsTable),
      db.select().from(botStateTable).limit(1),
      db
        .select()
        .from(tradesTable)
        .where(
          and(
            isNotNull(tradesTable.closedAt),
            gte(tradesTable.closedAt, startOfDay(new Date())),
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

  return `You are the GoldenMoose AI trading assistant. You are friendly, knowledgeable about trading, and speak conversationally. You have real-time access to this user's portfolio and trading bot status.

Current time (ET): ${now}

=== BOT STATUS ===
Running: ${state?.isRunning ? "YES" : "NO"}
${state?.activeStrategyId ? `Active Strategy ID: ${state.activeStrategyId}` : "No active strategy"}
${state?.activeBrokerId ? `Active Broker ID: ${state.activeBrokerId}` : ""}

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

=== YOUR ROLE ===
- Answer questions about the current portfolio, positions, P&L, and trading activity.
- Explain what the bot is doing and why, based on the active strategy settings.
- Offer thoughtful trading insights, risk observations, and market context.
- Learn and remember the user's trading preferences, style, and goals from the conversation.
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
