import { type DecisionRule } from "@workspace/db";

export interface MarketSnapshot {
  symbol: string;
  rsi?: number | null;
  maCondition?: string | null;
  volumeCondition?: string | null;
  trendCondition?: string | null;
  aiSignal?: string | null;
  aiConfidence?: number | null;
  priceChangePercent?: number | null;
}

export interface EvaluationResult {
  symbol: string;
  action: "buy" | "sell" | "hold";
  quantityMultiplier: number;
  matchedRuleId: number | null;
  matchedRuleName: string | null;
  reason: string;
  rulesEvaluated: number;
}

function parseNum(val: string | null | undefined): number | null {
  if (val == null) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function ruleMatches(rule: DecisionRule, snap: MarketSnapshot): boolean {
  const rsiMin = parseNum(rule.rsiMin);
  const rsiMax = parseNum(rule.rsiMax);

  if (rsiMin !== null) {
    if (snap.rsi == null || snap.rsi < rsiMin) return false;
  }
  if (rsiMax !== null) {
    if (snap.rsi == null || snap.rsi > rsiMax) return false;
  }

  if (rule.maCondition && rule.maCondition !== "any") {
    if (snap.maCondition !== rule.maCondition) return false;
  }

  if (rule.volumeCondition && rule.volumeCondition !== "any") {
    if (snap.volumeCondition !== rule.volumeCondition) return false;
  }

  if (rule.trendCondition && rule.trendCondition !== "any") {
    if (snap.trendCondition !== rule.trendCondition) return false;
  }

  if (rule.aiSignal && rule.aiSignal !== "any") {
    if (snap.aiSignal !== rule.aiSignal) return false;
  }

  const confMin = parseNum(rule.aiConfidenceMin);
  if (confMin !== null) {
    if (snap.aiConfidence == null || snap.aiConfidence < confMin) return false;
  }

  const pcMin = parseNum(rule.priceChangeMin);
  const pcMax = parseNum(rule.priceChangeMax);
  if (pcMin !== null) {
    if (snap.priceChangePercent == null || snap.priceChangePercent < pcMin) return false;
  }
  if (pcMax !== null) {
    if (snap.priceChangePercent == null || snap.priceChangePercent > pcMax) return false;
  }

  return true;
}

export function evaluateDecisionTable(
  rules: DecisionRule[],
  snap: MarketSnapshot
): EvaluationResult {
  const activeRules = rules
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of activeRules) {
    if (ruleMatches(rule, snap)) {
      return {
        symbol: snap.symbol,
        action: rule.action as "buy" | "sell" | "hold",
        quantityMultiplier: parseNum(rule.quantityMultiplier) ?? 1,
        matchedRuleId: rule.id,
        matchedRuleName: rule.name,
        reason: `Matched rule #${rule.priority + 1}: "${rule.name}"`,
        rulesEvaluated: activeRules.length,
      };
    }
  }

  return {
    symbol: snap.symbol,
    action: "hold",
    quantityMultiplier: 0,
    matchedRuleId: null,
    matchedRuleName: null,
    reason: "No decision rules matched — defaulting to HOLD",
    rulesEvaluated: activeRules.length,
  };
}
