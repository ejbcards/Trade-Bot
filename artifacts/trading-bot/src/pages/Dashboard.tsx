import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetDashboardSummary, useGetBotStatus, useGetRecentActivity, useListPositions, useStartBot, useStopBot, useListBrokers, useListStrategies } from "@workspace/api-client-react";
import { formatCurrency, formatPercent, formatShortDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Play, Square, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: botStatus, isLoading: isLoadingBotStatus } = useGetBotStatus();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity({ limit: 10 });
  const { data: positions, isLoading: isLoadingPositions } = useListPositions();
  
  const startBot = useStartBot();
  const stopBot = useStopBot();
  
  const { data: brokers } = useListBrokers();
  const { data: strategies } = useListStrategies();

  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");

  const handleStartBot = () => {
    if (!selectedBroker || !selectedStrategy) return;
    startBot.mutate(
      { data: { brokerId: parseInt(selectedBroker), strategyId: parseInt(selectedStrategy) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
          toast.success("Bot started successfully");
          setIsStartDialogOpen(false);
        },
        onError: (error: any) => {
          toast.error("Failed to start bot", { description: error.message });
        }
      }
    );
  };

  const handleStopBot = () => {
    stopBot.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
        toast.success("Bot stopped successfully");
      },
      onError: (error: any) => {
        toast.error("Failed to stop bot", { description: error.message });
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <div className="flex items-center gap-4">
            {isLoadingBotStatus ? (
              <Skeleton className="h-10 w-32" />
            ) : botStatus?.isRunning ? (
              <Button variant="destructive" onClick={handleStopBot} disabled={stopBot.isPending} data-testid="button-stop-bot">
                <Square className="w-4 h-4 mr-2" />
                Stop Bot
              </Button>
            ) : (
              <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-start-bot">
                    <Play className="w-4 h-4 mr-2" />
                    Start Bot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start Trading Bot</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Select Broker</Label>
                      <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose broker..." />
                        </SelectTrigger>
                        <SelectContent>
                          {brokers?.filter(b => b.status === 'connected').map(b => (
                            <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Select Strategy</Label>
                      <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose strategy..." />
                        </SelectTrigger>
                        <SelectContent>
                          {strategies?.filter(s => s.isActive).map(s => (
                            <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button 
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" 
                      onClick={handleStartBot}
                      disabled={!selectedBroker || !selectedStrategy || startBot.isPending}
                      data-testid="button-confirm-start"
                    >
                      {startBot.isPending ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                      Launch
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Top Summary Cards */}
        {isLoadingSummary ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Account Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-account-value">{formatCurrency(summary.totalAccountValue)}</div>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Buying Power:</span> {formatCurrency(summary.totalBuyingPower)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Daily P&L</CardTitle>
                {summary.dailyPnl >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-destructive" />}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.dailyPnl >= 0 ? "text-emerald-500" : "text-destructive"}`} data-testid="text-daily-pnl">
                  {summary.dailyPnl >= 0 ? "+" : ""}{formatCurrency(summary.dailyPnl)}
                </div>
                <p className={`text-xs mt-1 ${summary.dailyPnlPercent >= 0 ? "text-emerald-500/80" : "text-destructive/80"}`}>
                  {summary.dailyPnlPercent >= 0 ? "+" : ""}{formatPercent(summary.dailyPnlPercent)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Open Positions</CardTitle>
                <Badge variant="outline" className="font-normal">{summary.totalOpenPositions} active</Badge>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.totalUnrealizedPnl >= 0 ? "text-emerald-500" : "text-destructive"}`} data-testid="text-unrealized-pnl">
                  {summary.totalUnrealizedPnl >= 0 ? "+" : ""}{formatCurrency(summary.totalUnrealizedPnl)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Unrealized P&L</p>
              </CardContent>
            </Card>
            <Card className={botStatus?.isRunning ? "border-emerald-500/50 bg-emerald-500/5" : ""}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
                <div className={`w-2.5 h-2.5 rounded-full ${botStatus?.isRunning ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" : "bg-destructive"}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{botStatus?.isRunning ? "Running" : "Idle"}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.tradesExecutedToday} trades executed today
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Open Positions List */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Open Positions</CardTitle>
              <CardDescription>Live market overview across all connected brokers</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPositions ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : positions && positions.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unrealized P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.slice(0, 5).map((pos) => (
                        <TableRow key={pos.id}>
                          <TableCell className="font-medium">{pos.symbol}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={pos.side === 'long' ? 'text-emerald-500 border-emerald-500/30' : 'text-rose-500 border-rose-500/30'}>
                              {pos.side.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{pos.quantity}</TableCell>
                          <TableCell className={`text-right font-medium ${pos.unrealizedPnl && pos.unrealizedPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {pos.unrealizedPnl ? formatCurrency(pos.unrealizedPnl) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                  No open positions
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Activity Feed
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingActivity ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : activity && activity.length > 0 ? (
                <div className="space-y-4">
                  {activity.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 text-sm">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-primary flex-shrink-0" />
                      <div>
                        <div className="font-medium">
                          {item.title}
                          {item.symbol && <span className="ml-1 text-primary">{item.symbol}</span>}
                        </div>
                        <div className="text-muted-foreground text-xs">{item.description}</div>
                        <div className="text-muted-foreground/60 text-[10px] mt-0.5">{formatShortDate(item.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No recent activity
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
