import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListStrategies, useCreateStrategy, useDeleteStrategy, useUpdateStrategy, useListBrokers } from "@workspace/api-client-react";
import { DecisionTableEditor } from "@/components/DecisionTableEditor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/format";
import { BrainCircuit, Settings2, Plus, AlertTriangle, Trash2, ShieldAlert, Crown, Lock, Key, ArrowRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

type Strategy = {
  id: number;
  name: string;
  description?: string | null;
  brokerId: number;
  assetType: string;
  symbols: string[];
  isActive: boolean;
  maxPositionSize: number;
  maxDailyLoss: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  rollingStopPercent?: number | null;
  aiEnabled: boolean;
  aiSignalThreshold: number;
  rsiOverbought?: number | null;
  rsiOversold?: number | null;
  vixPriceThreshold: number;
  vixChangeThreshold: number;
  vixStopClampPercent: number;
  tradeCount: number;
  winRate?: number | null;
  totalPnl?: number | null;
};

type FormData = {
  name: string;
  description: string;
  brokerId: string;
  assetType: string;
  symbols: string;
  maxPositionSize: number;
  maxDailyLoss: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  rollingStopPercent: number;
  aiEnabled: boolean;
  aiSignalThreshold: number;
  rsiOverbought: number;
  rsiOversold: number;
  isActive: boolean;
  vixPriceThreshold: number;
  vixChangeThreshold: number;
  vixStopClampPercent: number;
};

const defaultForm: FormData = {
  name: "",
  description: "",
  brokerId: "",
  assetType: "stocks",
  symbols: "",
  maxPositionSize: 1000,
  maxDailyLoss: 500,
  stopLossPercent: 2,
  takeProfitPercent: 5,
  rollingStopPercent: 20,
  aiEnabled: true,
  aiSignalThreshold: 0.7,
  rsiOverbought: 82,
  rsiOversold: 18,
  isActive: true,
  vixPriceThreshold: 23,
  vixChangeThreshold: 2,
  vixStopClampPercent: 15,
};

function StrategyForm({
  formData,
  setFormData,
  brokers,
  showBroker = true,
}: {
  formData: FormData;
  setFormData: (d: FormData) => void;
  brokers?: { id: number; name: string; status: string }[];
  showBroker?: boolean;
}) {
  const set = (patch: Partial<FormData>) => setFormData({ ...formData, ...patch });

  return (
    <div className="space-y-6">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Strategy Name *</Label>
          <Input value={formData.name} onChange={e => set({ name: e.target.value })} placeholder="e.g., SPY Options Momentum" />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Description</Label>
          <Textarea value={formData.description} onChange={e => set({ description: e.target.value })} placeholder="Describe the approach…" rows={2} />
        </div>
        {showBroker && (
          <div className="space-y-2">
            <Label>Broker Connection *</Label>
            <Select value={formData.brokerId} onValueChange={v => set({ brokerId: v })}>
              <SelectTrigger><SelectValue placeholder="Select broker" /></SelectTrigger>
              <SelectContent>
                {brokers?.filter(b => b.status === "connected").map(b => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Asset Type</Label>
          <Select value={formData.assetType} onValueChange={v => set({ assetType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="stocks">Stocks</SelectItem>
              <SelectItem value="options">Options</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="etf">ETFs</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Symbols (comma-separated)</Label>
          <Input value={formData.symbols} onChange={e => set({ symbols: e.target.value })} placeholder="AAPL, MSFT, SPY" />
        </div>
      </div>

      <Separator />

      {/* Risk management */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Risk Management
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Max Position ($)</Label>
            <Input type="number" value={formData.maxPositionSize} onChange={e => set({ maxPositionSize: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Max Daily Loss ($)</Label>
            <Input type="number" value={formData.maxDailyLoss} onChange={e => set({ maxDailyLoss: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Stop Loss (%)</Label>
            <Input type="number" step="0.1" value={formData.stopLossPercent} onChange={e => set({ stopLossPercent: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Take Profit (%)</Label>
            <Input type="number" step="0.1" value={formData.takeProfitPercent} onChange={e => set({ takeProfitPercent: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Rolling Stop (%)</Label>
            <Input type="number" step="0.5" value={formData.rollingStopPercent} onChange={e => set({ rollingStopPercent: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>RSI Overbought</Label>
            <Input type="number" value={formData.rsiOverbought} onChange={e => set({ rsiOverbought: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>RSI Oversold</Label>
            <Input type="number" value={formData.rsiOversold} onChange={e => set({ rsiOversold: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* VIX Volatility Filter */}
      <div>
        <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
          VIX Volatility Filter
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          When VIX is elevated, call entries are blocked and stop losses are tightened to protect capital.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>
              VIX Price Trigger
              <span className="text-muted-foreground ml-1 font-normal">(block calls above $)</span>
            </Label>
            <Input type="number" step="0.5" value={formData.vixPriceThreshold} onChange={e => set({ vixPriceThreshold: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>
              VIX Spike Trigger
              <span className="text-muted-foreground ml-1 font-normal">(block calls above day %)</span>
            </Label>
            <Input type="number" step="0.5" value={formData.vixChangeThreshold} onChange={e => set({ vixChangeThreshold: Number(e.target.value) })} />
          </div>
          <div className="col-span-2 space-y-2">
            <div className="flex justify-between">
              <Label>Stop Loss Clamp During High Vol (%)</Label>
              <span className="text-xs text-orange-400 font-medium">{formData.vixStopClampPercent}%</span>
            </div>
            <Slider
              value={[formData.vixStopClampPercent]}
              min={5} max={50} step={1}
              onValueChange={v => set({ vixStopClampPercent: v[0] })}
              className="[&_[role=slider]]:border-orange-400/80"
            />
            <p className="text-[10px] text-muted-foreground">
              Stop loss is clamped to this % when VIX triggers the high-vol regime (default 15%).
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* AI settings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <BrainCircuit className="w-3.5 h-3.5 text-primary" />
            AI Signal Generation
          </h3>
          <Switch checked={formData.aiEnabled} onCheckedChange={c => set({ aiEnabled: c })} />
        </div>
        {formData.aiEnabled && (
          <div className="space-y-2 bg-muted/30 p-3 rounded-lg">
            <div className="flex justify-between">
              <Label className="text-xs">Minimum Confidence</Label>
              <span className="text-xs text-primary">{Math.round(formData.aiSignalThreshold * 100)}%</span>
            </div>
            <Slider
              value={[formData.aiSignalThreshold]}
              max={1} step={0.05}
              onValueChange={v => set({ aiSignalThreshold: v[0] })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchUserAccess(): Promise<{ hasAccess: boolean; grantType: string | null }> {
  const res = await fetch(`${basePath}/api/user/access`);
  if (!res.ok) throw new Error("Not authenticated");
  return res.json() as Promise<{ hasAccess: boolean; grantType: string | null }>;
}

function GoldenMooseCard() {
  const { isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  const { data: accessData } = useQuery({
    queryKey: ["user-access"],
    queryFn: fetchUserAccess,
    enabled: isSignedIn === true,
    retry: false,
  });

  const hasAccess = isSignedIn && (accessData?.hasAccess ?? false);

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-card to-primary/5 mb-2">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <Crown className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-foreground">Golden Moose Strategy</h3>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">
                  Premium
                </Badge>
                {hasAccess ? (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
                    Unlocked
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    <Lock className="w-2.5 h-2.5 mr-1" />
                    Locked
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Our flagship AI strategy — Claude-powered signals, auto risk management, multi-broker execution.
              </p>
            </div>
          </div>
          {!hasAccess && (
            <Button
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setLocation("/account")}
            >
              {isSignedIn ? (
                <>
                  <Key className="w-3.5 h-3.5" />
                  Unlock
                </>
              ) : (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  Sign In
                </>
              )}
            </Button>
          )}
        </div>
        {!hasAccess && (
          <p className="text-xs text-muted-foreground mt-3 pl-12">
            {isSignedIn
              ? "Subscribe for $10/month or enter an access key in your account settings."
              : "Create a free account to subscribe or enter an access key."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Strategies() {
  const queryClient = useQueryClient();
  const { data: strategies, isLoading } = useListStrategies();
  const { data: brokers } = useListBrokers();

  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const deleteStrategy = useDeleteStrategy();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [addForm, setAddForm] = useState<FormData>(defaultForm);
  const [editForm, setEditForm] = useState<FormData>(defaultForm);

  const handleAdd = () => {
    if (!addForm.name || !addForm.brokerId || !addForm.symbols) {
      toast.error("Please fill all required fields");
      return;
    }
    createStrategy.mutate(
      {
        data: {
          ...addForm,
          brokerId: parseInt(addForm.brokerId),
          symbols: addForm.symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
          toast.success("Strategy created successfully");
          setIsAddOpen(false);
          setAddForm(defaultForm);
        },
        onError: (err: unknown) => toast.error("Failed to create strategy", { description: (err as Error).message })
      }
    );
  };

  const openEdit = (strategy: Strategy) => {
    setEditForm({
      name: strategy.name,
      description: strategy.description ?? "",
      brokerId: String(strategy.brokerId),
      assetType: strategy.assetType,
      symbols: strategy.symbols.join(", "),
      maxPositionSize: strategy.maxPositionSize,
      maxDailyLoss: strategy.maxDailyLoss,
      stopLossPercent: strategy.stopLossPercent,
      takeProfitPercent: strategy.takeProfitPercent,
      rollingStopPercent: strategy.rollingStopPercent ?? 20,
      aiEnabled: strategy.aiEnabled,
      aiSignalThreshold: strategy.aiSignalThreshold,
      rsiOverbought: strategy.rsiOverbought ?? 82,
      rsiOversold: strategy.rsiOversold ?? 18,
      isActive: strategy.isActive,
      vixPriceThreshold: strategy.vixPriceThreshold ?? 23,
      vixChangeThreshold: strategy.vixChangeThreshold ?? 2,
      vixStopClampPercent: strategy.vixStopClampPercent ?? 15,
    });
    setEditingStrategy(strategy);
  };

  const handleEdit = () => {
    if (!editingStrategy) return;
    updateStrategy.mutate(
      {
        id: editingStrategy.id,
        data: {
          name: editForm.name,
          description: editForm.description || null,
          symbols: editForm.symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean),
          isActive: editForm.isActive,
          maxPositionSize: editForm.maxPositionSize,
          maxDailyLoss: editForm.maxDailyLoss,
          stopLossPercent: editForm.stopLossPercent,
          takeProfitPercent: editForm.takeProfitPercent,
          aiEnabled: editForm.aiEnabled,
          aiSignalThreshold: editForm.aiSignalThreshold,
          rsiOverbought: editForm.rsiOverbought,
          rsiOversold: editForm.rsiOversold,
          vixPriceThreshold: editForm.vixPriceThreshold,
          vixChangeThreshold: editForm.vixChangeThreshold,
          vixStopClampPercent: editForm.vixStopClampPercent,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
          toast.success("Strategy updated");
          setEditingStrategy(null);
        },
        onError: (err: unknown) => toast.error("Failed to update strategy", { description: (err as Error).message })
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Are you sure you want to delete this strategy?")) return;
    deleteStrategy.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
          toast.success("Strategy deleted");
        },
        onError: (err: unknown) => toast.error("Failed to delete strategy", { description: (err as Error).message })
      }
    );
  };

  const handleToggleActive = (id: number, currentActive: boolean) => {
    updateStrategy.mutate(
      { id, data: { isActive: !currentActive } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
          toast.success(`Strategy ${!currentActive ? "enabled" : "disabled"}`);
        }
      }
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trading Strategies</h1>
            <p className="text-muted-foreground mt-1">Configure AI logic, risk parameters, and volatility filters.</p>
          </div>

          {/* Create Strategy Dialog */}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Strategy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Trading Strategy</DialogTitle>
              </DialogHeader>
              <div className="py-2">
                <StrategyForm formData={addForm} setFormData={setAddForm} brokers={brokers as { id: number; name: string; status: string }[]} showBroker />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={createStrategy.isPending}>
                  {createStrategy.isPending ? "Creating…" : "Create Strategy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Strategy Dialog */}
        <Dialog open={!!editingStrategy} onOpenChange={open => { if (!open) setEditingStrategy(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Strategy — {editingStrategy?.name}</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <StrategyForm formData={editForm} setFormData={setEditForm} showBroker={false} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingStrategy(null)}>Cancel</Button>
              <Button onClick={handleEdit} disabled={updateStrategy.isPending}>
                {updateStrategy.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <GoldenMooseCard />

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : strategies && strategies.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {(strategies as unknown as Strategy[]).map((strategy) => (
              <Card key={strategy.id} className={!strategy.isActive ? "opacity-75 grayscale-[30%]" : ""}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {strategy.name}
                        {strategy.aiEnabled && (
                          <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                            <BrainCircuit className="w-3 h-3 mr-1" /> AI Driven
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">{strategy.description || "No description provided."}</CardDescription>
                    </div>
                    <Switch checked={strategy.isActive} onCheckedChange={() => handleToggleActive(strategy.id, strategy.isActive)} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Symbol badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="capitalize">{strategy.assetType}</Badge>
                    {strategy.symbols.map(sym => (
                      <Badge key={sym} variant="outline" className="bg-muted">{sym}</Badge>
                    ))}
                  </div>

                  {/* Performance stats */}
                  <div className="grid grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg border">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Win Rate</p>
                      <p className={`font-semibold ${strategy.winRate && strategy.winRate > 0.5 ? "text-emerald-500" : ""}`}>
                        {strategy.winRate ? formatPercent(strategy.winRate) : "—"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Total P&L</p>
                      <p className={`font-semibold ${strategy.totalPnl && strategy.totalPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                        {strategy.totalPnl ? formatCurrency(strategy.totalPnl) : "—"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Trades</p>
                      <p className="font-semibold">{strategy.tradeCount}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Stop Loss</p>
                      <p className="font-semibold text-destructive">{strategy.stopLossPercent}%</p>
                    </div>
                  </div>

                  {/* Risk guardrails */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/30 border rounded-lg p-2.5 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Risk Guardrails</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Take Profit</span>
                          <span className="text-emerald-500 font-medium">+{strategy.takeProfitPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stop Loss</span>
                          <span className="text-destructive font-medium">−{strategy.stopLossPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Rolling Stop</span>
                          <span className="font-medium">−{strategy.rollingStopPercent ?? 20}%</span>
                        </div>
                        {strategy.rsiOverbought && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">RSI Exit</span>
                            <span className="font-medium">&gt;{strategy.rsiOverbought} / &lt;{strategy.rsiOversold}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* VIX Volatility Filter */}
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-2.5 space-y-1.5">
                      <p className="text-[10px] text-orange-400/80 uppercase font-medium flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        VIX Vol Filter
                      </p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Price trigger</span>
                          <span className="font-medium text-orange-400">${strategy.vixPriceThreshold ?? 23}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Spike trigger</span>
                          <span className="font-medium text-orange-400">+{strategy.vixChangeThreshold ?? 2}% day</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">SL clamp</span>
                          <span className="font-medium text-orange-400">{strategy.vixStopClampPercent ?? 15}%</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 pt-0.5 leading-tight">
                          Calls blocked · puts allowed
                        </p>
                      </div>
                    </div>
                  </div>

                  {strategy.aiEnabled && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>AI Signal Threshold: <strong className="text-foreground">{Math.round(strategy.aiSignalThreshold * 100)}%</strong></span>
                    </div>
                  )}

                  <div className="border-t pt-4 mt-2">
                    <DecisionTableEditor strategyId={strategy.id} strategyName={strategy.name} />
                  </div>
                </CardContent>

                <CardFooter className="pt-0 flex gap-2 border-t mt-auto py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(strategy)}
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Edit Strategy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(strategy.id)}
                    disabled={deleteStrategy.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed rounded-xl bg-muted/10">
            <BrainCircuit className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No Strategies Configured</h3>
            <p className="text-muted-foreground mt-1 mb-6 max-w-md mx-auto">
              Create a trading strategy to define your risk limits, asset selection, and AI signal parameters.
            </p>
            <Button onClick={() => setIsAddOpen(true)}>Create Strategy</Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
