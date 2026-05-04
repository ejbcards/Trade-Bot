import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, decisionRulesTable } from "@workspace/db";
import {
  CreateDecisionRuleBody,
  UpdateDecisionRuleBody,
  ListDecisionRulesParams,
  CreateDecisionRuleParams,
  UpdateDecisionRuleParams,
  DeleteDecisionRuleParams,
  EvaluateStrategyParams,
  EvaluateStrategyBody,
} from "@workspace/api-zod";
import { evaluateDecisionTable } from "../lib/decisionEngine";

const router: IRouter = Router();

function parseRule(r: typeof decisionRulesTable.$inferSelect) {
  return {
    ...r,
    quantityMultiplier: parseFloat(r.quantityMultiplier),
    rsiMin: r.rsiMin != null ? parseFloat(r.rsiMin) : null,
    rsiMax: r.rsiMax != null ? parseFloat(r.rsiMax) : null,
    aiConfidenceMin: r.aiConfidenceMin != null ? parseFloat(r.aiConfidenceMin) : null,
    priceChangeMin: r.priceChangeMin != null ? parseFloat(r.priceChangeMin) : null,
    priceChangeMax: r.priceChangeMax != null ? parseFloat(r.priceChangeMax) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/strategies/:id/decision-rules", async (req, res): Promise<void> => {
  const params = ListDecisionRulesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rules = await db
    .select()
    .from(decisionRulesTable)
    .where(eq(decisionRulesTable.strategyId, params.data.id))
    .orderBy(decisionRulesTable.priority);
  res.json(rules.map(parseRule));
});

router.post("/strategies/:id/decision-rules", async (req, res): Promise<void> => {
  const params = CreateDecisionRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateDecisionRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [rule] = await db
    .insert(decisionRulesTable)
    .values({
      strategyId: params.data.id,
      name: d.name,
      description: d.description ?? null,
      priority: d.priority ?? 0,
      isActive: d.isActive ?? true,
      candlestickPattern: d.candlestickPattern ?? null,
      timeFrame: d.timeFrame ?? null,
      volumeIncreaseLevel: d.volumeIncreaseLevel ?? null,
      rsiMin: d.rsiMin != null ? String(d.rsiMin) : null,
      rsiMax: d.rsiMax != null ? String(d.rsiMax) : null,
      maCondition: d.maCondition ?? null,
      volumeCondition: d.volumeCondition ?? null,
      trendCondition: d.trendCondition ?? null,
      aiSignal: d.aiSignal ?? null,
      aiConfidenceMin: d.aiConfidenceMin != null ? String(d.aiConfidenceMin) : null,
      priceChangeMin: d.priceChangeMin != null ? String(d.priceChangeMin) : null,
      priceChangeMax: d.priceChangeMax != null ? String(d.priceChangeMax) : null,
      action: d.action,
      quantityMultiplier: d.quantityMultiplier != null ? String(d.quantityMultiplier) : "1",
      notes: d.notes ?? null,
    })
    .returning();
  res.status(201).json(parseRule(rule));
});

router.patch("/strategies/:id/decision-rules/:ruleId", async (req, res): Promise<void> => {
  const params = UpdateDecisionRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDecisionRuleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (d.name != null) updateData.name = d.name;
  if (d.description != null) updateData.description = d.description;
  if (d.priority != null) updateData.priority = d.priority;
  if (d.isActive != null) updateData.isActive = d.isActive;
  if ("candlestickPattern" in d) updateData.candlestickPattern = d.candlestickPattern ?? null;
  if ("timeFrame" in d) updateData.timeFrame = d.timeFrame ?? null;
  if ("volumeIncreaseLevel" in d) updateData.volumeIncreaseLevel = d.volumeIncreaseLevel ?? null;
  if ("rsiMin" in d) updateData.rsiMin = d.rsiMin != null ? String(d.rsiMin) : null;
  if ("rsiMax" in d) updateData.rsiMax = d.rsiMax != null ? String(d.rsiMax) : null;
  if ("maCondition" in d) updateData.maCondition = d.maCondition ?? null;
  if ("volumeCondition" in d) updateData.volumeCondition = d.volumeCondition ?? null;
  if ("trendCondition" in d) updateData.trendCondition = d.trendCondition ?? null;
  if ("aiSignal" in d) updateData.aiSignal = d.aiSignal ?? null;
  if ("aiConfidenceMin" in d) updateData.aiConfidenceMin = d.aiConfidenceMin != null ? String(d.aiConfidenceMin) : null;
  if ("priceChangeMin" in d) updateData.priceChangeMin = d.priceChangeMin != null ? String(d.priceChangeMin) : null;
  if ("priceChangeMax" in d) updateData.priceChangeMax = d.priceChangeMax != null ? String(d.priceChangeMax) : null;
  if (d.action != null) updateData.action = d.action;
  if (d.quantityMultiplier != null) updateData.quantityMultiplier = String(d.quantityMultiplier);
  if ("notes" in d) updateData.notes = d.notes ?? null;

  const [rule] = await db
    .update(decisionRulesTable)
    .set(updateData)
    .where(
      and(
        eq(decisionRulesTable.id, params.data.ruleId),
        eq(decisionRulesTable.strategyId, params.data.id)
      )
    )
    .returning();
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.json(parseRule(rule));
});

router.delete("/strategies/:id/decision-rules/:ruleId", async (req, res): Promise<void> => {
  const params = DeleteDecisionRuleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [rule] = await db
    .delete(decisionRulesTable)
    .where(
      and(
        eq(decisionRulesTable.id, params.data.ruleId),
        eq(decisionRulesTable.strategyId, params.data.id)
      )
    )
    .returning();
  if (!rule) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/strategies/:id/evaluate", async (req, res): Promise<void> => {
  const params = EvaluateStrategyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const snap = EvaluateStrategyBody.safeParse(req.body);
  if (!snap.success) {
    res.status(400).json({ error: snap.error.message });
    return;
  }
  const rules = await db
    .select()
    .from(decisionRulesTable)
    .where(eq(decisionRulesTable.strategyId, params.data.id))
    .orderBy(decisionRulesTable.priority);

  const result = evaluateDecisionTable(rules, {
    symbol: snap.data.symbol,
    candlestickPattern: snap.data.candlestickPattern ?? null,
    timeFrame: snap.data.timeFrame ?? null,
    volumeIncreaseLevel: snap.data.volumeIncreaseLevel ?? null,
    rsi: snap.data.rsi ?? null,
    maCondition: snap.data.maCondition ?? null,
    volumeCondition: snap.data.volumeCondition ?? null,
    trendCondition: snap.data.trendCondition ?? null,
    aiSignal: snap.data.aiSignal ?? null,
    aiConfidence: snap.data.aiConfidence ?? null,
    priceChangePercent: snap.data.priceChangePercent ?? null,
  });
  res.json(result);
});

export default router;
