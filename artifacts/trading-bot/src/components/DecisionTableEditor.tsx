import { useState } from "react";
import {
  useListDecisionRules,
  useCreateDecisionRule,
  useUpdateDecisionRule,
  useDeleteDecisionRule,
  useEvaluateStrategy,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  FlaskConical,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Pencil,
  Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Action = "buy" | "sell" | "hold";

interface RuleForm {
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  rsiMin: string;
  rsiMax: string;
  maCondition: string;
  volumeCondition: string;
  trendCondition: string;
  aiSignal: string;
  aiConfidenceMin: string;
  priceChangeMin: string;
  priceChangeMax: string;
  action: Action;
  quantityMultiplier: number;
  notes: string;
}

interface TestForm {
  symbol: string;
  rsi: string;
  maCondition: string;
  volumeCondition: string;
  trendCondition: string;
  aiSignal: string;
  aiConfidence: string;
  priceChangePercent: string;
}

const BLANK_RULE: RuleForm = {
  name: "",
  description: "",
  priority: 0,
  isActive: true,
  rsiMin: "",
  rsiMax: "",
  maCondition: "any",
  volumeCondition: "any",
  trendCondition: "any",
  aiSignal: "any",
  aiConfidenceMin: "",
  priceChangeMin: "",
  priceChangeMax: "",
  action: "hold",
  quantityMultiplier: 1,
  notes: "",
};

const BLANK_TEST: TestForm = {
  symbol: "AAPL",
  rsi: "",
  maCondition: "",
  volumeCondition: "",
  trendCondition: "",
  aiSignal: "",
  aiConfidence: "",
  priceChangePercent: "",
};

const actionColor: Record<Action, string> = {
  buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sell: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  hold: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function conditionLabel(val: string | null | undefined, none = "—") {
  if (!val || val === "any") return none;
  return val.replace(/_/g, " ");
}

function numLabel(val: number | null | undefined) {
  if (val == null) return "—";
  return val.toString();
}

interface Props {
  strategyId: number;
  strategyName: string;
}

export function DecisionTableEditor({ strategyId, strategyName }: Props) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<number | null>(null);
  const [form, setForm] = useState<RuleForm>(BLANK_RULE);
  const [testOpen, setTestOpen] = useState(false);
  const [testForm, setTestForm] = useState<TestForm>(BLANK_TEST);
  const [testResult, setTestResult] = useState<null | {
    action: string;
    matchedRuleName: string | null;
    reason: string;
    rulesEvaluated: number;
    quantityMultiplier: number;
  }>(null);

  const { data: rules, isLoading } = useListDecisionRules(strategyId);
  const createRule = useCreateDecisionRule();
  const updateRule = useUpdateDecisionRule();
  const deleteRule = useDeleteDecisionRule();
  const evaluateStrategy = useEvaluateStrategy();

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: [`/api/strategies/${strategyId}/decision-rules`],
    });

  function openCreate() {
    setEditingRule(null);
    setForm({ ...BLANK_RULE, priority: (rules?.length ?? 0) });
    setIsOpen(true);
  }

  function openEdit(rule: NonNullable<typeof rules>[number]) {
    setEditingRule(rule.id);
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      priority: rule.priority,
      isActive: rule.isActive,
      rsiMin: rule.rsiMin != null ? String(rule.rsiMin) : "",
      rsiMax: rule.rsiMax != null ? String(rule.rsiMax) : "",
      maCondition: rule.maCondition ?? "any",
      volumeCondition: rule.volumeCondition ?? "any",
      trendCondition: rule.trendCondition ?? "any",
      aiSignal: rule.aiSignal ?? "any",
      aiConfidenceMin: rule.aiConfidenceMin != null ? String(rule.aiConfidenceMin) : "",
      priceChangeMin: rule.priceChangeMin != null ? String(rule.priceChangeMin) : "",
      priceChangeMax: rule.priceChangeMax != null ? String(rule.priceChangeMax) : "",
      action: rule.action as Action,
      quantityMultiplier: rule.quantityMultiplier,
      notes: rule.notes ?? "",
    });
    setIsOpen(true);
  }

  function buildPayload(f: RuleForm) {
    return {
      name: f.name,
      description: f.description || null,
      priority: f.priority,
      isActive: f.isActive,
      rsiMin: f.rsiMin !== "" ? parseFloat(f.rsiMin) : null,
      rsiMax: f.rsiMax !== "" ? parseFloat(f.rsiMax) : null,
      maCondition: f.maCondition === "any" ? null : f.maCondition,
      volumeCondition: f.volumeCondition === "any" ? null : f.volumeCondition,
      trendCondition: f.trendCondition === "any" ? null : f.trendCondition,
      aiSignal: f.aiSignal === "any" ? null : f.aiSignal,
      aiConfidenceMin: f.aiConfidenceMin !== "" ? parseFloat(f.aiConfidenceMin) : null,
      priceChangeMin: f.priceChangeMin !== "" ? parseFloat(f.priceChangeMin) : null,
      priceChangeMax: f.priceChangeMax !== "" ? parseFloat(f.priceChangeMax) : null,
      action: f.action,
      quantityMultiplier: f.quantityMultiplier,
      notes: f.notes || null,
    };
  }

  function handleSave() {
    if (!form.name) {
      toast.error("Rule name is required");
      return;
    }
    const payload = buildPayload(form);
    if (editingRule != null) {
      updateRule.mutate(
        { id: strategyId, ruleId: editingRule, data: payload },
        {
          onSuccess: () => {
            invalidate();
            toast.success("Rule updated");
            setIsOpen(false);
          },
          onError: (e: any) => toast.error("Failed to update rule", { description: e.message }),
        }
      );
    } else {
      createRule.mutate(
        { id: strategyId, data: payload },
        {
          onSuccess: () => {
            invalidate();
            toast.success("Rule created");
            setIsOpen(false);
          },
          onError: (e: any) => toast.error("Failed to create rule", { description: e.message }),
        }
      );
    }
  }

  function handleDelete(ruleId: number) {
    if (!confirm("Delete this rule?")) return;
    deleteRule.mutate(
      { id: strategyId, ruleId },
      {
        onSuccess: () => {
          invalidate();
          toast.success("Rule deleted");
        },
        onError: (e: any) => toast.error("Failed to delete rule", { description: e.message }),
      }
    );
  }

  function handleToggleActive(ruleId: number, current: boolean) {
    updateRule.mutate(
      { id: strategyId, ruleId, data: { isActive: !current } },
      {
        onSuccess: () => {
          invalidate();
          toast.success(`Rule ${!current ? "enabled" : "disabled"}`);
        },
      }
    );
  }

  function handleTest() {
    evaluateStrategy.mutate(
      {
        id: strategyId,
        data: {
          symbol: testForm.symbol || "AAPL",
          rsi: testForm.rsi !== "" ? parseFloat(testForm.rsi) : null,
          maCondition: testForm.maCondition || null,
          volumeCondition: testForm.volumeCondition || null,
          trendCondition: testForm.trendCondition || null,
          aiSignal: testForm.aiSignal || null,
          aiConfidence: testForm.aiConfidence !== "" ? parseFloat(testForm.aiConfidence) : null,
          priceChangePercent: testForm.priceChangePercent !== "" ? parseFloat(testForm.priceChangePercent) : null,
        },
      },
      {
        onSuccess: (res) => setTestResult(res),
        onError: (e: any) => toast.error("Evaluation failed", { description: e.message }),
      }
    );
  }

  const SET_SELECT = "none";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Decision Table</p>
          <p className="text-xs text-muted-foreground">
            Rules evaluated top-to-bottom; first match wins.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setTestResult(null); setTestOpen(true); }}>
            <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
            Test Signal
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Rule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !rules || rules.length === 0 ? (
        <div className="border border-dashed rounded-lg py-8 text-center">
          <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">No rules yet.</p>
          <p className="text-xs text-muted-foreground mt-0.5">Add rules to define when to buy, sell, or hold.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Rule
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead>Rule Name</TableHead>
                <TableHead>RSI</TableHead>
                <TableHead>MA</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>AI Signal</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Qty%</TableHead>
                <TableHead className="w-24 text-center">Active</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rules].sort((a, b) => a.priority - b.priority).map((rule) => (
                <TableRow key={rule.id} className={cn(!rule.isActive && "opacity-50")}>
                  <TableCell className="text-center text-muted-foreground text-xs font-mono">{rule.priority + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm truncate max-w-[120px]">{rule.name}</div>
                    {rule.description && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{rule.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {rule.rsiMin != null || rule.rsiMax != null
                      ? `${numLabel(rule.rsiMin)}–${numLabel(rule.rsiMax)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{conditionLabel(rule.maCondition)}</TableCell>
                  <TableCell className="text-xs capitalize">{conditionLabel(rule.volumeCondition)}</TableCell>
                  <TableCell className="text-xs capitalize">{conditionLabel(rule.trendCondition)}</TableCell>
                  <TableCell className="text-xs capitalize">{conditionLabel(rule.aiSignal)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs uppercase font-semibold", actionColor[rule.action as Action] ?? "")}>
                      {rule.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{Math.round(rule.quantityMultiplier * 100)}%</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={rule.isActive} onCheckedChange={() => handleToggleActive(rule.id, rule.isActive)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rule Editor Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule != null ? "Edit Rule" : "New Decision Rule"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Oversold Bounce Buy" />
              </div>
              <div className="space-y-2">
                <Label>Priority (lower fires first)</Label>
                <Input type="number" min={0} value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional notes about this rule..." />
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Conditions (leave blank = match any)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">RSI Min</Label>
                  <Input type="number" min={0} max={100} step={0.5} placeholder="e.g., 0" value={form.rsiMin} onChange={e => setForm({ ...form, rsiMin: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">RSI Max</Label>
                  <Input type="number" min={0} max={100} step={0.5} placeholder="e.g., 30" value={form.rsiMax} onChange={e => setForm({ ...form, rsiMax: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Moving Average</Label>
                  <Select value={form.maCondition} onValueChange={v => setForm({ ...form, maCondition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="bullish_cross">Bullish Cross (fast crosses above slow)</SelectItem>
                      <SelectItem value="bearish_cross">Bearish Cross (fast crosses below slow)</SelectItem>
                      <SelectItem value="above_fast">Price Above Fast MA</SelectItem>
                      <SelectItem value="below_slow">Price Below Slow MA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Volume</Label>
                  <Select value={form.volumeCondition} onValueChange={v => setForm({ ...form, volumeCondition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="high">High (&gt;1.5× avg)</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low (&lt;0.5× avg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Trend Direction</Label>
                  <Select value={form.trendCondition} onValueChange={v => setForm({ ...form, trendCondition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="uptrend">Uptrend</SelectItem>
                      <SelectItem value="downtrend">Downtrend</SelectItem>
                      <SelectItem value="sideways">Sideways</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">AI Signal</Label>
                  <Select value={form.aiSignal} onValueChange={v => setForm({ ...form, aiSignal: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Min AI Confidence (0–1)</Label>
                  <Input type="number" min={0} max={1} step={0.05} placeholder="e.g., 0.75" value={form.aiConfidenceMin} onChange={e => setForm({ ...form, aiConfidenceMin: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Price Change % Min</Label>
                  <Input type="number" step={0.1} placeholder="e.g., -5" value={form.priceChangeMin} onChange={e => setForm({ ...form, priceChangeMin: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Price Change % Max</Label>
                  <Input type="number" step={0.1} placeholder="e.g., 0" value={form.priceChangeMax} onChange={e => setForm({ ...form, priceChangeMax: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Action</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Signal <span className="text-destructive">*</span></Label>
                  <Select value={form.action} onValueChange={v => setForm({ ...form, action: v as Action })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">
                        <span className="text-emerald-400 font-semibold">BUY</span>
                      </SelectItem>
                      <SelectItem value="sell">
                        <span className="text-rose-400 font-semibold">SELL</span>
                      </SelectItem>
                      <SelectItem value="hold">
                        <span className="text-amber-400 font-semibold">HOLD</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position Size (% of max, 0.1–1.0)</Label>
                  <Input type="number" min={0.1} max={1} step={0.05} value={form.quantityMultiplier} onChange={e => setForm({ ...form, quantityMultiplier: parseFloat(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.isActive} onCheckedChange={c => setForm({ ...form, isActive: c })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createRule.isPending || updateRule.isPending}>
              {editingRule != null ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Signal Dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Test Decision Table — {strategyName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Enter a market snapshot to see which rule fires and what action the bot would take.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Symbol</Label>
                <Input value={testForm.symbol} onChange={e => setTestForm({ ...testForm, symbol: e.target.value })} placeholder="AAPL" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RSI (0–100)</Label>
                <Input type="number" value={testForm.rsi} onChange={e => setTestForm({ ...testForm, rsi: e.target.value })} placeholder="e.g., 28" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">MA Condition</Label>
                <Select value={testForm.maCondition || SET_SELECT} onValueChange={v => setTestForm({ ...testForm, maCondition: v === SET_SELECT ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SET_SELECT}>— (not set)</SelectItem>
                    <SelectItem value="bullish_cross">Bullish Cross</SelectItem>
                    <SelectItem value="bearish_cross">Bearish Cross</SelectItem>
                    <SelectItem value="above_fast">Above Fast MA</SelectItem>
                    <SelectItem value="below_slow">Below Slow MA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Volume</Label>
                <Select value={testForm.volumeCondition || SET_SELECT} onValueChange={v => setTestForm({ ...testForm, volumeCondition: v === SET_SELECT ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SET_SELECT}>— (not set)</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Trend</Label>
                <Select value={testForm.trendCondition || SET_SELECT} onValueChange={v => setTestForm({ ...testForm, trendCondition: v === SET_SELECT ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SET_SELECT}>— (not set)</SelectItem>
                    <SelectItem value="uptrend">Uptrend</SelectItem>
                    <SelectItem value="downtrend">Downtrend</SelectItem>
                    <SelectItem value="sideways">Sideways</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">AI Signal</Label>
                <Select value={testForm.aiSignal || SET_SELECT} onValueChange={v => setTestForm({ ...testForm, aiSignal: v === SET_SELECT ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SET_SELECT}>— (not set)</SelectItem>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="hold">Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">AI Confidence (0–1)</Label>
                <Input type="number" min={0} max={1} step={0.05} value={testForm.aiConfidence} onChange={e => setTestForm({ ...testForm, aiConfidence: e.target.value })} placeholder="e.g., 0.85" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price Change %</Label>
                <Input type="number" step={0.1} value={testForm.priceChangePercent} onChange={e => setTestForm({ ...testForm, priceChangePercent: e.target.value })} placeholder="e.g., -2.5" />
              </div>
            </div>

            {testResult && (
              <div className={cn("rounded-lg border p-4 space-y-2", actionColor[testResult.action as Action] ?? "border-muted")}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    Signal: {testResult.action}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(testResult.quantityMultiplier * 100)}% position size
                  </Badge>
                </div>
                <p className="text-xs">{testResult.reason}</p>
                {testResult.matchedRuleName && (
                  <p className="text-xs opacity-70">Matched: "{testResult.matchedRuleName}"</p>
                )}
                <p className="text-xs opacity-60">{testResult.rulesEvaluated} rule(s) evaluated</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Close</Button>
            <Button onClick={handleTest} disabled={evaluateStrategy.isPending}>
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
              {evaluateStrategy.isPending ? "Evaluating..." : "Run Evaluation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
