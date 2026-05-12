import { Router, type IRouter } from "express";
import { eq, desc, and, gte, isNotNull } from "drizzle-orm";
import {
  db,
  dailyRecaps,
  botLogsTable,
  botStateTable,
  tradesTable,
  positionsTable,
  strategiesTable,
  brokersTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { emitBotTrade } from "../lib/botEvents";

const router: IRouter = Router();

const ET_TZ = "America/New_York";

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ET_TZ });
}

function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: ET_TZ }));
}

function startOfDayET(): Date {
  const et = nowET();
  et.setHours(0, 0, 0, 0);
  const utcNow = new Date();
  const offsetMs = utcNow.getTime() - new Date(utcNow.toLocaleString("en-US", { timeZone: ET_TZ })).getTime();
  return new Date(et.getTime() + offsetMs);
}

function parsePnl(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

async function buildRecapPrompt(): Promise<string> {
  const todayStr = todayET();
  const dayStart = startOfDayET();

  const [botState, todayTrades, openPositions, activeStrategies, activeBrokers, todayLogs] =
    await Promise.all([
      db.select().from(botStateTable).limit(1),
      db
        .select()
        .from(tradesTable)
        .where(
          and(
            gte(tradesTable.openedAt, dayStart),
            isNotNull(tradesTable.openedAt),
          ),
        )
        .orderBy(desc(tradesTable.openedAt)),
      db.select().from(positionsTable),
      db.select().from(strategiesTable).where(eq(strategiesTable.isActive, true)),
      db.select().from(brokersTable).where(eq(brokersTable.isActive, true)),
      db
        .select()
        .from(botLogsTable)
        .where(gte(botLogsTable.createdAt, dayStart))
        .orderBy(desc(botLogsTable.createdAt))
        .limit(150),
    ]);

  const state = botState[0];

  const closedTrades = todayTrades.filter((t) => t.status === "closed");
  const openedTrades = todayTrades.filter((t) => t.status !== "closed");
  const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + parsePnl(t.realizedPnl), 0);
  const wins = closedTrades.filter((t) => parsePnl(t.realizedPnl) > 0);
  const losses = closedTrades.filter((t) => parsePnl(t.realizedPnl) <= 0);

  const tradesSummary =
    closedTrades.length === 0 && openedTrades.length === 0
      ? "No trades were opened or closed today."
      : [
          closedTrades.length > 0 && `Closed trades (${closedTrades.length}):`,
          ...closedTrades.map(
            (t) =>
              `  - ${t.symbol} ${t.side?.toUpperCase() ?? ""} ${t.quantity}x @ entry $${t.entryPrice} → closed @ $${t.exitPrice ?? "?"} | P&L: ${parsePnl(t.realizedPnl) >= 0 ? "+" : ""}$${parsePnl(t.realizedPnl).toFixed(2)} | Signal: ${t.aiSignal ?? "n/a"}`,
          ),
          openedTrades.length > 0 && `\nStill-open positions opened today (${openedTrades.length}):`,
          ...openedTrades.map(
            (t) => `  - ${t.symbol} ${t.side?.toUpperCase() ?? ""} ${t.quantity}x @ $${t.entryPrice}`,
          ),
        ]
          .filter(Boolean)
          .join("\n");

  const importantLogKeywords = [
    "BUY", "SELL", "TAKE-PROFIT", "STOP-LOSS", "ROLLING-STOP", "FLIP",
    "SKIP", "HOLD", "VOL-REGIME", "VOL-FILTER", "WEEKEND-CLOSE", "RSI", "VIX", "error",
  ];
  const keyLogs = todayLogs
    .filter((l) => importantLogKeywords.some((kw) => l.message.toUpperCase().includes(kw.toUpperCase())))
    .slice(0, 50);

  const logsSummary =
    keyLogs.length === 0
      ? "No significant bot activity logs for today."
      : keyLogs.map((l) => `  [${l.level.toUpperCase()}] ${l.message}`).join("\n");

  const strategyNames = activeStrategies.map((s) => s.name).join(", ") || "None active";
  const brokerNames = activeBrokers.map((b) => b.name).join(", ") || "None";
  const totalUnrealizedPnl = openPositions.reduce((sum, p) => sum + parsePnl(p.unrealizedPnl), 0);

  const now = new Date().toLocaleString("en-US", {
    timeZone: ET_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `You are GoldenMoose, an AI trading bot. Write a day recap summary for ${todayStr}.

Current time: ${now} ET
Bot status: ${state?.isRunning ? "RUNNING" : "STOPPED"}
Active strategy: ${strategyNames}
Active broker: ${brokerNames}

=== TODAY'S TRADES ===
${tradesSummary}

Total realized P&L today: ${totalRealizedPnl >= 0 ? "+" : ""}$${totalRealizedPnl.toFixed(2)}
Wins: ${wins.length} | Losses: ${losses.length}
Open positions (unrealized P&L): ${openPositions.length} positions, ${totalUnrealizedPnl >= 0 ? "+" : ""}$${totalUnrealizedPnl.toFixed(2)} unrealized

=== KEY BOT ACTIVITY LOGS (today) ===
${logsSummary}

=== INSTRUCTIONS ===
Write a concise, conversational end-of-day recap in the voice of a sharp, friendly trading desk analyst.

Structure your response as:
1. **Overview** — 2-3 sentences covering the day's theme (active, quiet, volatile, etc.) and the headline P&L result.
2. **Trades Taken** — For each trade: what was bought/sold, why (based on the signal logged), what happened, what the outcome was. Be specific with prices and P&L. If no trades, say so honestly.
3. **Why No Trades (if applicable)** — If no entries were made, explain the reason from the logs (e.g., RSI extreme, VIX filter blocked calls, neutral trend, etc.).
4. **Volatility Notes** — Comment on any VIX regime warnings or vol-filter events seen in the logs.
5. **Open Positions** — Briefly note anything still held and unrealized P&L.
6. **Tomorrow's Setup** — 1-2 sentences on what to watch for based on today's conditions.

Keep it under 400 words. Be direct and informative, not generic.`;
}

export async function generateAndSaveRecap(todayStr?: string): Promise<string> {
  const date = todayStr ?? todayET();
  const prompt = await buildRecapPrompt();

  let fullContent = "";

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullContent += event.delta.text;
    }
  }

  const existing = await db.select().from(dailyRecaps).where(eq(dailyRecaps.date, date)).limit(1);

  if (existing.length > 0) {
    await db
      .update(dailyRecaps)
      .set({ content: fullContent, generatedAt: new Date() })
      .where(eq(dailyRecaps.date, date));
  } else {
    await db.insert(dailyRecaps).values({ date, content: fullContent });
  }

  emitBotTrade({
    type: "recap",
    symbol: "RECAP",
    price: 0,
    reason: "Daily recap generated",
    content: fullContent,
  });

  return fullContent;
}

export { todayET };

// GET /bot/recap — return today's recap if it exists, else null
router.get("/bot/recap", async (_req, res): Promise<void> => {
  const [recap] = await db
    .select()
    .from(dailyRecaps)
    .where(eq(dailyRecaps.date, todayET()))
    .limit(1);

  if (!recap) {
    res.json(null);
    return;
  }

  res.json({
    id: recap.id,
    date: recap.date,
    content: recap.content,
    generatedAt: recap.generatedAt.toISOString(),
  });
});

// POST /bot/recap/generate — stream a freshly-generated recap via SSE
router.post("/bot/recap/generate", async (_req, res): Promise<void> => {
  const todayStr = todayET();
  const prompt = await buildRecapPrompt();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullContent = "";

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullContent += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`);
      }
    }

    const existing = await db.select().from(dailyRecaps).where(eq(dailyRecaps.date, todayStr)).limit(1);
    let savedRecap;
    if (existing.length > 0) {
      [savedRecap] = await db
        .update(dailyRecaps)
        .set({ content: fullContent, generatedAt: new Date() })
        .where(eq(dailyRecaps.date, todayStr))
        .returning();
    } else {
      [savedRecap] = await db
        .insert(dailyRecaps)
        .values({ date: todayStr, content: fullContent })
        .returning();
    }

    res.write(
      `data: ${JSON.stringify({
        type: "done",
        recap: {
          id: savedRecap!.id,
          date: savedRecap!.date,
          content: fullContent,
          generatedAt: savedRecap!.generatedAt.toISOString(),
        },
      })}\n\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    res.write(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
