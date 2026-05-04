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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, FlaskConical, Pencil, Zap, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Action = "buy" | "sell" | "hold" | "watchlist";

interface RuleForm {
  name: string;
  description: string;
  priority: number;
  isActive: boolean;
  // Chart TA
  candlestickPattern: string;
  timeFrame: string;
  volumeIncreaseLevel: string;
  // Classic
  rsiMin: string;
  rsiMax: string;
  maCondition: string;
  volumeCondition: string;
  trendCondition: string;
  aiSignal: string;
  aiConfidenceMin: string;
  priceChangeMin: string;
  priceChangeMax: string;
  // Action
  action: Action;
  quantityMultiplier: number;
  notes: string;
}

interface TestForm {
  symbol: string;
  candlestickPattern: string;
  timeFrame: string;
  volumeIncreaseLevel: string;
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
  candlestickPattern: "any",
  timeFrame: "any",
  volumeIncreaseLevel: "any",
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
  candlestickPattern: "",
  timeFrame: "",
  volumeIncreaseLevel: "",
  rsi: "",
  maCondition: "",
  volumeCondition: "",
  trendCondition: "",
  aiSignal: "",
  aiConfidence: "",
  priceChangePercent: "",
};

const actionColor: Record<Action, string> = {
  buy:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sell:      "bg-rose-500/15 text-rose-400 border-rose-500/30",
  hold:      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  watchlist: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const CANDLE_LABELS: Record<string, string> = {
  head_and_shoulders:         "Head & Shoulders (bearish)",
  inverse_head_and_shoulders: "Inv. Head & Shoulders (bullish)",
  cup_and_handle:             "Cup & Handle (bullish)",
  triple_top:                 "Triple Top (bearish)",
  triple_bottom:              "Triple Bottom (bullish)",
};
const CANDLE_SHORT: Record<string, string> = {
  head_and_shoulders:         "H&S",
  inverse_head_and_shoulders: "Inv H&S",
  cup_and_handle:             "C&H",
  triple_top:                 "3-Top",
  triple_bottom:              "3-Bot",
};
const TF_LABELS: Record<string, string> = {
  daily_5min:  "Daily + 5 min (DF)",
  "15min":     "15 min (DFI)",
  "4hr_30min": "4 hr + 30 min (FT)",
};
const VOL_LABELS: Record<string, string> = {
  small:  "Small +15% (S)",
  medium: "Medium +20% (M)",
  large:  "Large +30% (L)",
};

const NONE = "__none__";

function condStr(val: string | null | undefined, short?: Record<string, string>) {
  if (!val || val === "any") return "—";
  if (short && short[val]) return short[val];
  return val.replace(/_/g, " ");
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
  const createRule  = useCreateDecisionRule();
  const updateRule  = useUpdateDecisionRule();
  const deleteRule  = useDeleteDecisionRule();
  const evalStrategy = useEvaluateStrategy();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/strategies/${strategyId}/decision-rules`] });

  function openCreate() {
    setEditingRule(null);
    setForm({ ...BLANK_RULE, priority: rules?.length ?? 0 });
    setIsOpen(true);
  }

  function openEdit(rule: NonNullable<typeof rules>[number]) {
    setEditingRule(rule.id);
    setForm({
      name: rule.name,
      description: rule.description ?? "",
      priority: rule.priority,
      isActive: rule.isActive,
      candlestickPattern: rule.candlestickPattern ?? "any",
      timeFrame: rule.timeFrame ?? "any",
      volumeIncreaseLevel: rule.volumeIncreaseLevel ?? "any",
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
      candlestickPattern: f.candlestickPattern === "any" ? null : f.candlestickPattern || null,
      timeFrame: f.timeFrame === "any" ? null : f.timeFrame || null,
      volumeIncreaseLevel: f.volumeIncreaseLevel === "any" ? null : f.volumeIncreaseLevel || null,
      rsiMin: f.rsiMin !== "" ? parseFloat(f.rsiMin) : null,
      rsiMax: f.rsiMax !== "" ? parseFloat(f.rsiMax) : null,
      maCondition: f.maCondition === "any" ? null : f.maCondition || null,
      volumeCondition: f.volumeCondition === "any" ? null : f.volumeCondition || null,
      trendCondition: f.trendCondition === "any" ? null : f.trendCondition || null,
      aiSignal: f.aiSignal === "any" ? null : f.aiSignal || null,
      aiConfidenceMin: f.aiConfidenceMin !== "" ? parseFloat(f.aiConfidenceMin) : null,
      priceChangeMin: f.priceChangeMin !== "" ? parseFloat(f.priceChangeMin) : null,
      priceChangeMax: f.priceChangeMax !== "" ? parseFloat(f.priceChangeMax) : null,
      action: f.action,
      quantityMultiplier: f.quantityMultiplier,
      notes: f.notes || null,
    };
  }

  function handleSave() {
    if (!form.name) { toast.error("Rule name is required"); return; }
    const payload = buildPayload(form);
    if (editingRule != null) {
      updateRule.mutate({ id: strategyId, ruleId: editingRule, data: payload }, {
        onSuccess: () => { invalidate(); toast.success("Rule updated"); setIsOpen(false); },
        onError: (e: any) => toast.error("Failed to update rule", { description: e.message }),
      });
    } else {
      createRule.mutate({ id: strategyId, data: payload }, {
        onSuccess: () => { invalidate(); toast.success("Rule created"); setIsOpen(false); },
        onError: (e: any) => toast.error("Failed to create rule", { description: e.message }),
      });
    }
  }

  function handleDelete(ruleId: number) {
    if (!confirm("Delete this rule?")) return;
    deleteRule.mutate({ id: strategyId, ruleId }, {
      onSuccess: () => { invalidate(); toast.success("Rule deleted"); },
      onError: (e: any) => toast.error("Failed to delete rule", { description: e.message }),
    });
  }

  function handleToggleActive(ruleId: number, current: boolean) {
    updateRule.mutate({ id: strategyId, ruleId, data: { isActive: !current } }, {
      onSuccess: () => { invalidate(); },
    });
  }

  function handleTest() {
    evalStrategy.mutate({
      id: strategyId,
      data: {
        symbol: testForm.symbol || "AAPL",
        candlestickPattern: testForm.candlestickPattern || null,
        timeFrame: testForm.timeFrame || null,
        volumeIncreaseLevel: testForm.volumeIncreaseLevel || null,
        rsi: testForm.rsi !== "" ? parseFloat(testForm.rsi) : null,
        maCondition: testForm.maCondition || null,
        volumeCondition: testForm.volumeCondition || null,
        trendCondition: testForm.trendCondition || null,
        aiSignal: testForm.aiSignal || null,
        aiConfidence: testForm.aiConfidence !== "" ? parseFloat(testForm.aiConfidence) : null,
        priceChangePercent: testForm.priceChangePercent !== "" ? parseFloat(testForm.priceChangePercent) : null,
      },
    }, {
      onSuccess: (res) => setTestResult(res),
      onError: (e: any) => toast.error("Evaluation failed", { description: e.message }),
    });
  }

  const sorted = [...(rules ?? [])].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            Decision Table
          </p>
          <p className="text-xs text-muted-foreground">Rules evaluated top-to-bottom; first match wins.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setTestResult(null); setTestOpen(true); }}>
            <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Test Signal
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Rule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      ) : !sorted.length ? (
        <div className="border border-dashed rounded-lg py-6 text-center">
          <Zap className="w-7 h-7 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">No rules yet.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Rule
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-8 text-center text-xs">#</TableHead>
                <TableHead className="text-xs">Rule</TableHead>
                <TableHead className="text-xs">Pattern</TableHead>
                <TableHead className="text-xs">Timeframe</TableHead>
                <TableHead className="text-xs">Volume+</TableHead>
                <TableHead className="text-xs">RSI</TableHead>
                <TableHead className="text-xs">AI Sig</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs w-16 text-center">On</TableHead>
                <TableHead className="w-16 text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((rule) => (
                <TableRow key={rule.id} className={cn(!rule.isActive && "opacity-40")}>
                  <TableCell className="text-center text-xs font-mono text-muted-foreground">{rule.priority + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium text-xs truncate max-w-[110px]">{rule.name}</div>
                    {rule.description && <div className="text-[10px] text-muted-foreground truncate max-w-[110px]">{rule.description}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{condStr(rule.candlestickPattern, CANDLE_SHORT)}</TableCell>
                  <TableCell className="text-xs">{condStr(rule.timeFrame, { daily_5min: "D+5m", "15min": "15m", "4hr_30min": "4h+30m" })}</TableCell>
                  <TableCell className="text-xs">{condStr(rule.volumeIncreaseLevel, { small: "S +15%", medium: "M +20%", large: "L +30%" })}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {rule.rsiMin != null || rule.rsiMax != null ? `${rule.rsiMin ?? ""}–${rule.rsiMax ?? ""}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{condStr(rule.aiSignal)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 uppercase font-bold", actionColor[rule.action as Action] ?? "")}>
                      {rule.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={rule.isActive} onCheckedChange={() => handleToggleActive(rule.id, rule.isActive)} className="scale-75" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(rule)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rule Editor */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule != null ? "Edit Rule" : "New Decision Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label className="text-xs">Rule Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Cup & Handle Breakout Buy" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Priority (lower fires first)</Label>
                <Input type="number" min={0} value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional notes..." />
              </div>
            </div>

            <Tabs defaultValue="chart-ta">
              <TabsList className="w-full">
                <TabsTrigger value="chart-ta" className="flex-1 text-xs">Chart Technical Analysis</TabsTrigger>
                <TabsTrigger value="indicators" className="flex-1 text-xs">Classic Indicators</TabsTrigger>
              </TabsList>

              <TabsContent value="chart-ta" className="mt-3 border rounded-lg p-4 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Conditions — leave as "Any" to skip</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Volume Increase</Label>
                    <Select value={form.volumeIncreaseLevel} onValueChange={v => setForm({ ...form, volumeIncreaseLevel: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="small">S — +15%</SelectItem>
                        <SelectItem value="medium">M — +20%</SelectItem>
                        <SelectItem value="large">L — +30%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Candlestick Pattern</Label>
                    <Select value={form.candlestickPattern} onValueChange={v => setForm({ ...form, candlestickPattern: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="head_and_shoulders">Head & Shoulders (bearish reversal)</SelectItem>
                        <SelectItem value="inverse_head_and_shoulders">Inverse Head & Shoulders (bullish reversal)</SelectItem>
                        <SelectItem value="cup_and_handle">Cup & Handle (bullish continuation)</SelectItem>
                        <SelectItem value="triple_top">Triple Top (bearish reversal)</SelectItem>
                        <SelectItem value="triple_bottom">Triple Bottom (bullish reversal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 col-span-3">
                    <Label className="text-xs">Confirmation Time Frame</Label>
                    <Select value={form.timeFrame} onValueChange={v => setForm({ ...form, timeFrame: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="daily_5min">Daily + 5 min chart (DF)</SelectItem>
                        <SelectItem value="15min">15 min chart (DFI)</SelectItem>
                        <SelectItem value="4hr_30min">4 hr + 30 min chart (FT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="indicators" className="mt-3 border rounded-lg p-4 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Conditions — leave blank to skip</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">RSI Min</Label>
                    <Input type="number" min={0} max={100} step={0.5} placeholder="e.g., 30" value={form.rsiMin} onChange={e => setForm({ ...form, rsiMin: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">RSI Max</Label>
                    <Input type="number" min={0} max={100} step={0.5} placeholder="e.g., 70" value={form.rsiMax} onChange={e => setForm({ ...form, rsiMax: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Moving Average</Label>
                    <Select value={form.maCondition} onValueChange={v => setForm({ ...form, maCondition: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="bullish_cross">Bullish Cross</SelectItem>
                        <SelectItem value="bearish_cross">Bearish Cross</SelectItem>
                        <SelectItem value="above_fast">Above Fast MA</SelectItem>
                        <SelectItem value="below_slow">Below Slow MA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Volume Level</Label>
                    <Select value={form.volumeCondition} onValueChange={v => setForm({ ...form, volumeCondition: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trend</Label>
                    <Select value={form.trendCondition} onValueChange={v => setForm({ ...form, trendCondition: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="uptrend">Uptrend</SelectItem>
                        <SelectItem value="downtrend">Downtrend</SelectItem>
                        <SelectItem value="sideways">Sideways</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">AI Signal</Label>
                    <Select value={form.aiSignal} onValueChange={v => setForm({ ...form, aiSignal: v })}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="buy">Buy</SelectItem>
                        <SelectItem value="sell">Sell</SelectItem>
                        <SelectItem value="hold">Hold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Min AI Confidence</Label>
                    <Input type="number" min={0} max={1} step={0.05} placeholder="e.g., 0.75" value={form.aiConfidenceMin} onChange={e => setForm({ ...form, aiConfidenceMin: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Price Change % Min</Label>
                    <Input type="number" step={0.1} placeholder="e.g., -5" value={form.priceChangeMin} onChange={e => setForm({ ...form, priceChangeMin: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Price Change % Max</Label>
                    <Input type="number" step={0.1} placeholder="e.g., 0" value={form.priceChangeMax} onChange={e => setForm({ ...form, priceChangeMax: e.target.value })} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Action</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Signal *</Label>
                  <Select value={form.action} onValueChange={v => setForm({ ...form, action: v as Action })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy"><span className="text-emerald-400 font-bold">BUY</span> — open position</SelectItem>
                      <SelectItem value="sell"><span className="text-rose-400 font-bold">SELL</span> — close position</SelectItem>
                      <SelectItem value="watchlist"><span className="text-sky-400 font-bold">WATCHLIST</span> — monitor only</SelectItem>
                      <SelectItem value="hold"><span className="text-amber-400 font-bold">HOLD</span> — do nothing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Position Size (0.1–1.0)</Label>
                  <Input type="number" min={0.1} max={1} step={0.05} value={form.quantityMultiplier} onChange={e => setForm({ ...form, quantityMultiplier: parseFloat(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs">Active</Label>
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
            <p className="text-xs text-muted-foreground">Enter a market snapshot to see which rule fires.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Symbol</Label>
                <Input value={testForm.symbol} onChange={e => setTestForm({ ...testForm, symbol: e.target.value })} placeholder="AAPL" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Volume Increase Level</Label>
                <Select value={testForm.volumeIncreaseLevel || NONE} onValueChange={v => setTestForm({ ...testForm, volumeIncreaseLevel: v === NONE ? "" : v })}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="— not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— not set</SelectItem>
                    <SelectItem value="small">Small +15%</SelectItem>
                    <SelectItem value="medium">Medium +20%</SelectItem>
                    <SelectItem value="large">Large +30%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Candlestick Pattern</Label>
                <Select value={testForm.candlestickPattern || NONE} onValueChange={v => setTestForm({ ...testForm, candlestickPattern: v === NONE ? "" : v })}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="— not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— not set</SelectItem>
                    <SelectItem value="head_and_shoulders">Head & Shoulders</SelectItem>
                    <SelectItem value="inverse_head_and_shoulders">Inverse Head & Shoulders</SelectItem>
                    <SelectItem value="cup_and_handle">Cup & Handle</SelectItem>
                    <SelectItem value="triple_top">Triple Top</SelectItem>
                    <SelectItem value="triple_bottom">Triple Bottom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Time Frame</Label>
                <Select value={testForm.timeFrame || NONE} onValueChange={v => setTestForm({ ...testForm, timeFrame: v === NONE ? "" : v })}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="— not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— not set</SelectItem>
                    <SelectItem value="daily_5min">Daily + 5 min (DF)</SelectItem>
                    <SelectItem value="15min">15 min (DFI)</SelectItem>
                    <SelectItem value="4hr_30min">4 hr + 30 min (FT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RSI (0–100)</Label>
                <Input type="number" value={testForm.rsi} onChange={e => setTestForm({ ...testForm, rsi: e.target.value })} placeholder="e.g., 35" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">AI Signal</Label>
                <Select value={testForm.aiSignal || NONE} onValueChange={v => setTestForm({ ...testForm, aiSignal: v === NONE ? "" : v })}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="— not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— not set</SelectItem>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="hold">Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {testResult && (
              <div className={cn("rounded-lg border p-4 space-y-1.5", actionColor[testResult.action as Action] ?? "border-muted")}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm uppercase tracking-widest">
                    {testResult.action === "watchlist" ? "📋 WATCHLIST" :
                     testResult.action === "buy"       ? "🟢 BUY" :
                     testResult.action === "sell"      ? "🔴 SELL" : "🟡 HOLD"}
                  </span>
                  {testResult.action === "buy" || testResult.action === "sell" ? (
                    <Badge variant="outline" className="text-xs">{Math.round(testResult.quantityMultiplier * 100)}% position</Badge>
                  ) : null}
                </div>
                <p className="text-xs">{testResult.reason}</p>
                {testResult.matchedRuleName && <p className="text-xs opacity-70">Rule: "{testResult.matchedRuleName}"</p>}
                <p className="text-xs opacity-50">{testResult.rulesEvaluated} rule(s) evaluated</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Close</Button>
            <Button onClick={handleTest} disabled={evalStrategy.isPending}>
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
              {evalStrategy.isPending ? "Evaluating..." : "Run Evaluation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
