import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListStrategies, useCreateStrategy, useDeleteStrategy, useUpdateStrategy, useListBrokers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/format";
import { BrainCircuit, Settings2, Plus, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

export default function Strategies() {
  const queryClient = useQueryClient();
  const { data: strategies, isLoading } = useListStrategies();
  const { data: brokers } = useListBrokers();

  const createStrategy = useCreateStrategy();
  const updateStrategy = useUpdateStrategy();
  const deleteStrategy = useDeleteStrategy();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    brokerId: "",
    assetType: "stocks",
    symbols: "",
    maxPositionSize: 1000,
    maxDailyLoss: 500,
    stopLossPercent: 2,
    takeProfitPercent: 5,
    aiEnabled: true,
    aiSignalThreshold: 0.7,
    isActive: true
  });

  const handleAdd = () => {
    if (!formData.name || !formData.brokerId || !formData.symbols) {
      toast.error("Please fill all required fields");
      return;
    }

    createStrategy.mutate(
      {
        data: {
          ...formData,
          brokerId: parseInt(formData.brokerId),
          symbols: formData.symbols.split(",").map(s => s.trim().toUpperCase()).filter(s => s),
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
          toast.success("Strategy created successfully");
          setIsAddOpen(false);
          setFormData({
            name: "",
            description: "",
            brokerId: "",
            assetType: "stocks",
            symbols: "",
            maxPositionSize: 1000,
            maxDailyLoss: 500,
            stopLossPercent: 2,
            takeProfitPercent: 5,
            aiEnabled: true,
            aiSignalThreshold: 0.7,
            isActive: true
          });
        },
        onError: (err: any) => toast.error("Failed to create strategy", { description: err.message })
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
        onError: (err: any) => toast.error("Failed to delete strategy", { description: err.message })
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
            <p className="text-muted-foreground mt-1">Configure AI logic and risk parameters.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Strategy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Trading Strategy</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-6 py-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Strategy Name</Label>
                    <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g., Tech Momentum" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Describe the strategy approach..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Broker Connection</Label>
                    <Select value={formData.brokerId} onValueChange={v => setFormData({...formData, brokerId: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select broker" />
                      </SelectTrigger>
                      <SelectContent>
                        {brokers?.filter(b => b.status === "connected").map(b => (
                          <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Asset Type</Label>
                    <Select value={formData.assetType} onValueChange={v => setFormData({...formData, assetType: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stocks">Stocks</SelectItem>
                        <SelectItem value="options">Options</SelectItem>
                        <SelectItem value="crypto">Crypto</SelectItem>
                        <SelectItem value="etf">ETFs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Symbols (comma-separated)</Label>
                    <Input value={formData.symbols} onChange={e => setFormData({...formData, symbols: e.target.value})} placeholder="AAPL, MSFT, GOOGL" />
                  </div>
                </div>

                <div className="space-y-4 border-l pl-6">
                  <h3 className="font-medium text-sm">Risk Management</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Position Size ($)</Label>
                      <Input type="number" value={formData.maxPositionSize} onChange={e => setFormData({...formData, maxPositionSize: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Daily Loss ($)</Label>
                      <Input type="number" value={formData.maxDailyLoss} onChange={e => setFormData({...formData, maxDailyLoss: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Stop Loss (%)</Label>
                      <Input type="number" step="0.1" value={formData.stopLossPercent} onChange={e => setFormData({...formData, stopLossPercent: Number(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Take Profit (%)</Label>
                      <Input type="number" step="0.1" value={formData.takeProfitPercent} onChange={e => setFormData({...formData, takeProfitPercent: Number(e.target.value)})} />
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-primary" />
                        <Label className="font-medium">AI Signal Generation</Label>
                      </div>
                      <Switch checked={formData.aiEnabled} onCheckedChange={c => setFormData({...formData, aiEnabled: c})} />
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
                          onValueChange={v => setFormData({...formData, aiSignalThreshold: v[0]})} 
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={createStrategy.isPending}>
                  {createStrategy.isPending ? "Creating..." : "Create Strategy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : strategies && strategies.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            {strategies.map((strategy) => (
              <Card key={strategy.id} className={!strategy.isActive ? "opacity-75 grayscale-[30%]" : ""}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {strategy.name}
                        {strategy.aiEnabled && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30"><BrainCircuit className="w-3 h-3 mr-1"/> AI Driven</Badge>}
                      </CardTitle>
                      <CardDescription className="mt-1">{strategy.description || "No description provided."}</CardDescription>
                    </div>
                    <Switch checked={strategy.isActive} onCheckedChange={() => handleToggleActive(strategy.id, strategy.isActive)} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">{strategy.assetType}</Badge>
                    {strategy.symbols.map(sym => (
                      <Badge key={sym} variant="outline" className="bg-muted">{sym}</Badge>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg border">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Win Rate</p>
                      <p className={`font-semibold ${strategy.winRate && strategy.winRate > 0.5 ? 'text-emerald-500' : ''}`}>
                        {strategy.winRate ? formatPercent(strategy.winRate) : '-'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Total P&L</p>
                      <p className={`font-semibold ${strategy.totalPnl && strategy.totalPnl >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        {strategy.totalPnl ? formatCurrency(strategy.totalPnl) : '-'}
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

                  {strategy.aiEnabled && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>AI Signal Threshold: <strong className="text-foreground">{Math.round(strategy.aiSignalThreshold * 100)}%</strong></span>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-0 flex gap-2 border-t mt-auto py-3">
                  <Button variant="outline" size="sm" className="flex-1" disabled>
                    <Settings2 className="w-4 h-4 mr-2" />
                    Edit Strategy
                  </Button>
                  <Button variant="outline" size="sm" className="px-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(strategy.id)} disabled={deleteStrategy.isPending}>
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