import { AppLayout } from "@/components/layout/AppLayout";
import { useGetPositionsSummary } from "@workspace/api-client-react";
import { useLivePositions } from "@/hooks/useLivePositions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";

export default function Positions() {
  const { positions, isLoading: isLoadingPositions, isConnected, dataSource, lastUpdated, getLive } = useLivePositions();
  const { data: summary, isLoading: isLoadingSummary } = useGetPositionsSummary();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Open Positions</h1>
            <p className="text-muted-foreground mt-1">Current holdings and unrealized performance.</p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected ? (
              <div className="flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3.5 h-3.5" />
                <span className="font-medium">Live · {dataSource ?? "yahoo"}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-full px-3 py-1.5">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Connecting…</span>
              </div>
            )}
            {lastUpdated && (
              <span className="text-xs text-muted-foreground/60">
                Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
              </span>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          {isLoadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : summary ? (
            <>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Market Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(summary.totalMarketValue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Unrealized P&L</p>
                  <p className={`text-2xl font-bold ${summary.totalUnrealizedPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {summary.totalUnrealizedPnl >= 0 ? "+" : ""}{formatCurrency(summary.totalUnrealizedPnl)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Return</p>
                  <p className={`text-2xl font-bold ${summary.totalUnrealizedPnlPercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                    {summary.totalUnrealizedPnlPercent >= 0 ? "+" : ""}{formatPercent(summary.totalUnrealizedPnlPercent)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Long / Short</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">{summary.longPositions} Long</Badge>
                    <Badge variant="outline" className="text-rose-500 border-rose-500/30">{summary.shortPositions} Short</Badge>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Positions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingPositions ? (
              <div className="space-y-4">
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
                      <TableHead className="text-right">Strike / Exp</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Bid</TableHead>
                      <TableHead className="text-right">Ask</TableHead>
                      <TableHead className="text-right">Mark</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="text-right">Mkt Value</TableHead>
                      <TableHead className="text-right">Unrealized P&L</TableHead>
                      <TableHead className="text-right">Return %</TableHead>
                      <TableHead className="hidden md:table-cell text-right">Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((pos) => {
                      const live = getLive(pos.id);
                      const isCall = pos.side === "long_call";
                      const isPut = pos.side === "long_put";
                      const expiryLabel = pos.expiry
                        ? new Date(pos.expiry).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : null;

                      return (
                        <TableRow key={pos.id} className="transition-colors">
                          <TableCell className="font-bold">
                            <div className="flex items-center gap-1.5">
                              <span>{pos.symbol}</span>
                              {pos.assetType === "options" ? (
                                <Badge
                                  variant="outline"
                                  className={isCall ? "text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0" : "text-rose-400 border-rose-400/30 text-[10px] px-1 py-0"}
                                >
                                  {isCall ? "CALL" : isPut ? "PUT" : pos.side.toUpperCase()}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px] px-1 py-0">
                                  {pos.side.toUpperCase()}
                                </Badge>
                              )}
                              {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <div className="flex flex-col items-end gap-0.5">
                              <span>{pos.strike ? `$${pos.strike.toFixed(0)}` : "—"}</span>
                              {expiryLabel && <span className="text-[10px] text-muted-foreground">{expiryLabel}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{pos.quantity}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(pos.entryPrice)}</TableCell>
                          <TableCell className="text-right font-mono text-emerald-400">
                            {live?.bid != null ? formatCurrency(live.bid) : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-rose-400">
                            {live?.ask != null ? formatCurrency(live.ask) : <span className="text-muted-foreground/50">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {pos.currentPrice ? formatCurrency(pos.currentPrice) : "—"}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm ${live && live.change >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {live ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <span>{live.change >= 0 ? "+" : ""}{live.change.toFixed(2)}</span>
                                <span className="text-[10px] opacity-80">{live.changePercent >= 0 ? "+" : ""}{live.changePercent.toFixed(1)}%</span>
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right">{pos.marketValue ? formatCurrency(pos.marketValue) : "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${pos.unrealizedPnl != null && pos.unrealizedPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {pos.unrealizedPnl != null ? (pos.unrealizedPnl >= 0 ? "+" : "") + formatCurrency(pos.unrealizedPnl) : "—"}
                          </TableCell>
                          <TableCell className={`text-right ${pos.unrealizedPnlPercent != null && pos.unrealizedPnlPercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {pos.unrealizedPnlPercent != null ? (pos.unrealizedPnlPercent >= 0 ? "+" : "") + formatPercent(pos.unrealizedPnlPercent) : "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right text-muted-foreground text-xs">
                            {formatDate(pos.openedAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                You currently have no open positions.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
