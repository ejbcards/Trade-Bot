import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetDashboardSummary, useGetBotStatus, useGetRecentActivity, useStartBot, useStopBot, useListBrokers, useListStrategies } from "@workspace/api-client-react";
import { useLivePositions } from "@/hooks/useLivePositions";
import { formatCurrency, formatPercent, formatShortDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Play, Square, TrendingUp, TrendingDown, RefreshCcw, Clock, Wifi, WifiOff, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function formatScheduledTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / (1000 * 60 * 60);

  const timeStr = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (diffH < 1 && diffMs > 0) {
    const mins = Math.round(diffMs / 60000);
    return `in ${mins} min${mins !== 1 ? "s" : ""} (${timeStr} ET)`;
  }
  if (diffH < 24 && diffMs > 0) {
    return `Today ${timeStr} ET`;
  }
  return `${dateStr} ${timeStr} ET`;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: botStatus, isLoading: isLoadingBotStatus } = useGetBotStatus();
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity({ limit: 10 });
  const { positions, isLoading: isLoadingPositions, isConnected, dataSource, lastUpdated, totalLiveUnrealizedPnl } = useLivePositions();

  const startBot = useStartBot();
  const stopBot = useStopBot();

  const { data: brokers } = useListBrokers();
  const { data: strategies } = useListStrategies();

  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [isCycleRunning, setIsCycleRunning] = useState(false);

  const handleRunCycle = async () => {
    setIsCycleRunning(true);
    try {
      const resp = await fetch("/api/bot/run-cycle", { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json() as { error: string };
        toast.error("Cycle failed", { description: err.error });
        return;
      }
      const result = await resp.json() as { cycleComplete: boolean; logs: { level: string; message: string }[] };
      // Surface the most important log line as the toast description
      const keyLog = result.logs.find(l =>
        l.message.includes("TAKE-PROFIT") || l.message.includes("STOP-LOSS") || l.message.includes("FLIP") || l.message.includes("BUY")
      );
      if (keyLog) {
        toast.success("Cycle complete", { description: keyLog.message });
      } else {
        toast.success("Cycle complete", { description: result.logs[0]?.message ?? "No trades this cycle" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bot/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
    } catch (err) {
      toast.error("Cycle error", { description: (err as Error).message });
    } finally {
      setIsCycleRunning(false);
    }
  };

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
        onError: (error: unknown) => {
          toast.error("Failed to start bot", { description: (error as Error).message });
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
      onError: (error: unknown) => {
        toast.error("Failed to stop bot", { description: (error as Error).message });
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <div className="flex items-center gap-3">
            {isLoadingBotStatus ? (
              <Skeleton className="h-10 w-32" />
            ) : botStatus?.isRunning ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleRunCycle}
                  disabled={isCycleRunning}
                  className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                  title="Force an immediate SL/TP + trading cycle"
                >
                  {isCycleRunning
                    ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                    : <Zap className="w-4 h-4 mr-2" />}
                  {isCycleRunning ? "Running…" : "Run Now"}
                </Button>
                <Button variant="destructive" onClick={handleStopBot} disabled={stopBot.isPending} data-testid="button-stop-bot">
                  <Square className="w-4 h-4 mr-2" />
                  Stop Bot
                </Button>
              </>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : summary ? (() => {
          // Live daily P&L = realized closed trades today + live unrealized on open positions
          const liveDailyPnl = summary.dailyRealizedPnl + (totalLiveUnrealizedPnl ?? summary.totalUnrealizedPnl);
          const liveDailyPnlPercent = summary.totalAccountValue > 0 ? (liveDailyPnl / summary.totalAccountValue) * 100 : 0;
          const liveReturn = summary.totalInvested > 0 ? ((totalLiveUnrealizedPnl ?? summary.totalUnrealizedPnl) / summary.totalInvested) * 100 : 0;
          const isLive = totalLiveUnrealizedPnl !== null;

          return (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {/* Account Value */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Account Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-account-value">{formatCurrency(summary.totalAccountValue)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">Buying Power:</span> {formatCurrency(summary.totalBuyingPower)}
                  </div>
                </CardContent>
              </Card>

              {/* Daily P&L — live */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Daily P&L</CardTitle>
                  {liveDailyPnl >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-destructive" />}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${liveDailyPnl >= 0 ? "text-emerald-500" : "text-destructive"}`} data-testid="text-daily-pnl">
                    {liveDailyPnl >= 0 ? "+" : ""}{formatCurrency(liveDailyPnl)}
                  </div>
                  <p className={`text-xs mt-1 flex items-center gap-1 ${liveDailyPnlPercent >= 0 ? "text-emerald-500/80" : "text-destructive/80"}`}>
                    {liveDailyPnlPercent >= 0 ? "+" : ""}{formatPercent(liveDailyPnlPercent)}
                    {isLive && <span className="text-emerald-500/60 ml-1">· live</span>}
                  </p>
                  {summary.dailyRealizedPnl !== 0 && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {formatCurrency(summary.dailyRealizedPnl)} realized · {formatCurrency(totalLiveUnrealizedPnl ?? summary.totalUnrealizedPnl)} unrealized
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Today Invested */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Today Invested</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.totalInvested)}</div>
                  <p className={`text-xs mt-1 ${liveReturn >= 0 ? "text-emerald-500/80" : "text-destructive/80"}`}>
                    {liveReturn >= 0 ? "+" : ""}{formatPercent(liveReturn)} return
                    {isLive && <span className="text-emerald-500/60 ml-1">· live</span>}
                  </p>
                </CardContent>
              </Card>

              {/* Open Positions */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Open Positions</CardTitle>
                  <Badge variant="outline" className="font-normal">{summary.totalOpenPositions} active</Badge>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${(totalLiveUnrealizedPnl ?? summary.totalUnrealizedPnl) >= 0 ? "text-emerald-500" : "text-destructive"}`} data-testid="text-unrealized-pnl">
                    {(totalLiveUnrealizedPnl ?? summary.totalUnrealizedPnl) >= 0 ? "+" : ""}{formatCurrency(totalLiveUnrealizedPnl ?? summary.totalUnrealizedPnl)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Unrealized P&L{isLive && <span className="text-emerald-500/70"> · live</span>}
                  </p>
                </CardContent>
              </Card>

              {/* System Status */}
              <Card className={botStatus?.isRunning ? "border-emerald-500/50 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
                  <div className={`w-2.5 h-2.5 rounded-full ${botStatus?.isRunning ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" : "bg-amber-500"}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{botStatus?.isRunning ? "Running" : "Scheduled"}</div>
                  {botStatus?.isRunning ? (
                    <p className="text-xs text-muted-foreground mt-1">{summary.tradesExecutedToday} trades today</p>
                  ) : (
                    <p className="text-xs text-amber-400/90 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 inline" />
                      Starts {formatScheduledTime(botStatus?.scheduledStartAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })() : null}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Open Positions List */}
          <Card className="col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Open Positions</CardTitle>
                  <CardDescription>Live market overview across all connected brokers</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                      <Wifi className="w-3.5 h-3.5" />
                      <span className="font-medium">LIVE</span>
                      {dataSource && (
                        <span className="text-muted-foreground capitalize">· {dataSource}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <WifiOff className="w-3.5 h-3.5" />
                      <span>Connecting…</span>
                    </div>
                  )}
                  {lastUpdated && (
                    <span className="text-[10px] text-muted-foreground/60">
                      {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingPositions ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : positions && positions.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract</TableHead>
                        <TableHead className="text-right">Strike</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Bought</TableHead>
                        <TableHead className="text-right">Bid / Ask</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Mark</TableHead>
                        <TableHead className="text-right">Unrealized P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.slice(0, 8).map((pos) => {
                        const isOptions = pos.assetType === "options";
                        const isCall = pos.side === "long_call";
                        const isPut = pos.side === "long_put";
                        const tp = pos.takeProfitPercent ?? 100;
                        const targetPrice = pos.entryPrice * (1 + tp / 100);
                        const expiryLabel = pos.expiry
                          ? new Date(pos.expiry).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : null;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const live = (pos as any)._live;

                        return (
                          <TableRow key={pos.id} className={isConnected ? "transition-colors" : ""}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span>{pos.symbol}</span>
                                  {isOptions && (
                                    <Badge
                                      variant="outline"
                                      className={isCall ? "text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0" : "text-rose-400 border-rose-400/30 text-[10px] px-1 py-0"}
                                    >
                                      {isCall ? "CALL" : isPut ? "PUT" : pos.side.toUpperCase()}
                                    </Badge>
                                  )}
                                  {!isOptions && (
                                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0">
                                      {pos.side.toUpperCase()}
                                    </Badge>
                                  )}
                                  {isConnected && live && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  )}
                                </div>
                                {expiryLabel && (
                                  <span className="text-[10px] text-muted-foreground">exp {expiryLabel}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {pos.strike ? `$${pos.strike.toFixed(0)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right">{pos.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              <div className="flex flex-col items-end gap-0.5">
                                <span>{formatCurrency(pos.entryPrice)}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(pos.openedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {live && (live.bid !== null || live.ask !== null) ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-emerald-400">{live.bid !== null ? formatCurrency(live.bid) : "—"}</span>
                                  <span className="text-rose-400">{live.ask !== null ? formatCurrency(live.ask) : "—"}</span>
                                </div>
                              ) : <span className="text-muted-foreground/50 text-xs">no quote</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-amber-400">
                              {formatCurrency(targetPrice)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              <div className="flex flex-col items-end gap-0.5">
                                <span>{pos.currentPrice ? formatCurrency(pos.currentPrice) : "—"}</span>
                                {live && live.change !== 0 && (
                                  <span className={`text-[10px] ${live.change >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                    {live.change >= 0 ? "+" : ""}{live.change.toFixed(2)} ({live.changePercent >= 0 ? "+" : ""}{live.changePercent.toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className={`text-right font-medium ${pos.unrealizedPnl != null && pos.unrealizedPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                              {pos.unrealizedPnl != null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span>{pos.unrealizedPnl >= 0 ? "+" : ""}{formatCurrency(pos.unrealizedPnl)}</span>
                                  {pos.unrealizedPnlPercent != null && (
                                    <span className="text-[10px] opacity-70">
                                      {pos.unrealizedPnlPercent >= 0 ? "+" : ""}{pos.unrealizedPnlPercent.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              ) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
