import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, positionsTable, brokersTable, strategiesTable } from "@workspace/db";
import { fetchLiveOptionPrices } from "../lib/liveQuotes";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OPTIONS_MULTIPLIER = 100;

function parsePosition(p: {
  id: number;
  brokerId: number;
  strategyId: number | null;
  symbol: string;
  assetType: string;
  side: string;
  quantity: string;
  entryPrice: string;
  currentPrice: string | null;
  marketValue: string | null;
  unrealizedPnl: string | null;
  unrealizedPnlPercent: string | null;
  openedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  optionType: string | null;
  contractSymbol: string | null;
  strike: string | null;
  expiry: Date | null;
  brokerName: string | null;
  takeProfitPercent: string | null;
  stopLossPercent: string | null;
}) {
  return {
    ...p,
    quantity: parseFloat(p.quantity),
    entryPrice: parseFloat(p.entryPrice),
    currentPrice: p.currentPrice ? parseFloat(p.currentPrice) : null,
    marketValue: p.marketValue ? parseFloat(p.marketValue) : null,
    unrealizedPnl: p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : null,
    unrealizedPnlPercent: p.unrealizedPnlPercent ? parseFloat(p.unrealizedPnlPercent) : null,
    strike: p.strike ? parseFloat(p.strike) : null,
    expiry: p.expiry ? p.expiry.toISOString() : null,
    brokerName: p.brokerName ?? "",
    takeProfitPercent: p.takeProfitPercent ? parseFloat(p.takeProfitPercent) : null,
    stopLossPercent: p.stopLossPercent ? parseFloat(p.stopLossPercent) : null,
  };
}

router.get("/positions", async (_req, res): Promise<void> => {
  const positions = await db
    .select({
      id: positionsTable.id,
      brokerId: positionsTable.brokerId,
      strategyId: positionsTable.strategyId,
      symbol: positionsTable.symbol,
      assetType: positionsTable.assetType,
      side: positionsTable.side,
      quantity: positionsTable.quantity,
      entryPrice: positionsTable.entryPrice,
      currentPrice: positionsTable.currentPrice,
      marketValue: positionsTable.marketValue,
      unrealizedPnl: positionsTable.unrealizedPnl,
      unrealizedPnlPercent: positionsTable.unrealizedPnlPercent,
      openedAt: positionsTable.openedAt,
      createdAt: positionsTable.createdAt,
      updatedAt: positionsTable.updatedAt,
      optionType: positionsTable.optionType,
      contractSymbol: positionsTable.contractSymbol,
      strike: positionsTable.strike,
      expiry: positionsTable.expiry,
      brokerName: brokersTable.name,
      takeProfitPercent: strategiesTable.takeProfitPercent,
      stopLossPercent: strategiesTable.stopLossPercent,
    })
    .from(positionsTable)
    .leftJoin(brokersTable, eq(positionsTable.brokerId, brokersTable.id))
    .leftJoin(strategiesTable, eq(positionsTable.strategyId, strategiesTable.id));

  res.json(positions.map(parsePosition));
});

// ─── Live price stream (SSE) ──────────────────────────────────────────────
//
// Streams real-time bid/ask/mark updates for all open positions every 2s.
// Uses Schwab Market Data API when OAuth tokens are present, falls back to
// Yahoo Finance for paper-trading sessions.
//

router.get("/positions/live", (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send a heartbeat comment immediately so the browser sees the connection
  res.write(": connected\n\n");

  let active = true;

  const tick = async () => {
    if (!active) return;
    try {
      const rows = await db
        .select({
          id: positionsTable.id,
          assetType: positionsTable.assetType,
          contractSymbol: positionsTable.contractSymbol,
          quantity: positionsTable.quantity,
          entryPrice: positionsTable.entryPrice,
        })
        .from(positionsTable);

      if (rows.length === 0) {
        res.write(": no positions\n\n");
        return;
      }

      // Only options have contract symbols we can quote live
      const optionRows = rows.filter((r) => r.assetType === "options" && r.contractSymbol);
      const symbols = [...new Set(optionRows.map((r) => r.contractSymbol as string))];

      const quotes = await fetchLiveOptionPrices(symbols);

      const updates = optionRows.map((pos) => {
        const q = quotes[pos.contractSymbol!];
        const entry = parseFloat(pos.entryPrice);
        const qty = parseFloat(pos.quantity);
        const mark = q?.mark ?? 0;
        const marketValue = mark > 0 ? mark * qty * OPTIONS_MULTIPLIER : 0;
        const unrealizedPnl = mark > 0 ? (mark - entry) * qty * OPTIONS_MULTIPLIER : 0;
        const unrealizedPnlPercent = entry > 0 && mark > 0 ? ((mark - entry) / entry) * 100 : 0;

        return {
          id: pos.id,
          contractSymbol: pos.contractSymbol,
          currentPrice: mark,
          bid: q?.bid ?? null,
          ask: q?.ask ?? null,
          mark,
          change: q?.change ?? 0,
          changePercent: q?.changePercent ?? 0,
          marketValue,
          unrealizedPnl,
          unrealizedPnlPercent,
          source: q?.source ?? "yahoo",
        };
      });

      // Determine overall source
      const sources = new Set(updates.map((u) => u.source));
      const overallSource = sources.size > 1 ? "mixed" : (updates[0]?.source ?? "yahoo");

      const payload = {
        updates,
        timestamp: new Date().toISOString(),
        source: overallSource,
      };

      res.write(`event: prices\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      logger.warn({ err }, "SSE tick error");
    }
  };

  tick();
  const interval = setInterval(tick, 2000);

  const cleanup = () => {
    active = false;
    clearInterval(interval);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

router.get("/positions/summary", async (_req, res): Promise<void> => {
  const positions = await db
    .select({
      id: positionsTable.id,
      side: positionsTable.side,
      marketValue: positionsTable.marketValue,
      unrealizedPnl: positionsTable.unrealizedPnl,
    })
    .from(positionsTable);

  const totalMarketValue = positions.reduce((sum, p) => sum + (p.marketValue ? parseFloat(p.marketValue) : 0), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ? parseFloat(p.unrealizedPnl) : 0), 0);
  const longPositions = positions.filter((p) => p.side === "long").length;
  const shortPositions = positions.filter((p) => p.side === "short").length;

  res.json({
    totalPositions: positions.length,
    totalMarketValue,
    totalUnrealizedPnl,
    totalUnrealizedPnlPercent: totalMarketValue > 0 ? (totalUnrealizedPnl / totalMarketValue) * 100 : 0,
    longPositions,
    shortPositions,
  });
});

export default router;
