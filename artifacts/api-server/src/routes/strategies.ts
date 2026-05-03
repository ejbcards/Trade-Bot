import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, strategiesTable } from "@workspace/db";
import {
  CreateStrategyBody,
  UpdateStrategyParams,
  UpdateStrategyBody,
  GetStrategyParams,
  DeleteStrategyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseStrategy(s: typeof strategiesTable.$inferSelect) {
  return {
    ...s,
    maxPositionSize: parseFloat(s.maxPositionSize),
    maxDailyLoss: parseFloat(s.maxDailyLoss),
    stopLossPercent: parseFloat(s.stopLossPercent),
    takeProfitPercent: parseFloat(s.takeProfitPercent),
    aiSignalThreshold: parseFloat(s.aiSignalThreshold),
    rsiOverbought: s.rsiOverbought ? parseFloat(s.rsiOverbought) : null,
    rsiOversold: s.rsiOversold ? parseFloat(s.rsiOversold) : null,
    winRate: s.winRate ? parseFloat(s.winRate) : null,
    totalPnl: s.totalPnl ? parseFloat(s.totalPnl) : null,
  };
}

router.get("/strategies", async (_req, res): Promise<void> => {
  const strategies = await db.select().from(strategiesTable).orderBy(strategiesTable.createdAt);
  res.json(strategies.map(parseStrategy));
});

router.post("/strategies", async (req, res): Promise<void> => {
  const parsed = CreateStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [strategy] = await db
    .insert(strategiesTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      brokerId: parsed.data.brokerId,
      assetType: parsed.data.assetType,
      symbols: parsed.data.symbols,
      isActive: parsed.data.isActive ?? true,
      maxPositionSize: String(parsed.data.maxPositionSize),
      maxDailyLoss: String(parsed.data.maxDailyLoss),
      stopLossPercent: String(parsed.data.stopLossPercent),
      takeProfitPercent: String(parsed.data.takeProfitPercent),
      aiEnabled: parsed.data.aiEnabled ?? true,
      aiModel: parsed.data.aiModel ?? null,
      aiSignalThreshold: String(parsed.data.aiSignalThreshold),
      rsiOverbought: parsed.data.rsiOverbought != null ? String(parsed.data.rsiOverbought) : null,
      rsiOversold: parsed.data.rsiOversold != null ? String(parsed.data.rsiOversold) : null,
      maFastPeriod: parsed.data.maFastPeriod ?? null,
      maSlowPeriod: parsed.data.maSlowPeriod ?? null,
    })
    .returning();
  res.status(201).json(parseStrategy(strategy));
});

router.get("/strategies/:id", async (req, res): Promise<void> => {
  const params = GetStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [strategy] = await db.select().from(strategiesTable).where(eq(strategiesTable.id, params.data.id));
  if (!strategy) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }
  res.json(parseStrategy(strategy));
});

router.patch("/strategies/:id", async (req, res): Promise<void> => {
  const params = UpdateStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStrategyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.description != null) updateData.description = parsed.data.description;
  if (parsed.data.symbols != null) updateData.symbols = parsed.data.symbols;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;
  if (parsed.data.maxPositionSize != null) updateData.maxPositionSize = String(parsed.data.maxPositionSize);
  if (parsed.data.maxDailyLoss != null) updateData.maxDailyLoss = String(parsed.data.maxDailyLoss);
  if (parsed.data.stopLossPercent != null) updateData.stopLossPercent = String(parsed.data.stopLossPercent);
  if (parsed.data.takeProfitPercent != null) updateData.takeProfitPercent = String(parsed.data.takeProfitPercent);
  if (parsed.data.aiEnabled != null) updateData.aiEnabled = parsed.data.aiEnabled;
  if (parsed.data.aiSignalThreshold != null) updateData.aiSignalThreshold = String(parsed.data.aiSignalThreshold);
  if (parsed.data.rsiOverbought != null) updateData.rsiOverbought = String(parsed.data.rsiOverbought);
  if (parsed.data.rsiOversold != null) updateData.rsiOversold = String(parsed.data.rsiOversold);
  if (parsed.data.maFastPeriod != null) updateData.maFastPeriod = parsed.data.maFastPeriod;
  if (parsed.data.maSlowPeriod != null) updateData.maSlowPeriod = parsed.data.maSlowPeriod;

  const [strategy] = await db
    .update(strategiesTable)
    .set(updateData)
    .where(eq(strategiesTable.id, params.data.id))
    .returning();
  if (!strategy) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }
  res.json(parseStrategy(strategy));
});

router.delete("/strategies/:id", async (req, res): Promise<void> => {
  const params = DeleteStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [strategy] = await db.delete(strategiesTable).where(eq(strategiesTable.id, params.data.id)).returning();
  if (!strategy) {
    res.status(404).json({ error: "Strategy not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
