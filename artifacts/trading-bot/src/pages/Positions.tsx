import { AppLayout } from "@/components/layout/AppLayout";
import { useListPositions, useGetPositionsSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default function Positions() {
  const { data: positions, isLoading: isLoadingPositions } = useListPositions();
  const { data: summary, isLoading: isLoadingSummary } = useGetPositionsSummary();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Open Positions</h1>
          <p className="text-muted-foreground mt-1">Current holdings and unrealized performance.</p>
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
                  <p className="text-sm font-medium text-muted-foreground mb-1">Long / Short Ratio</p>
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
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Entry</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Market Value</TableHead>
                      <TableHead className="text-right">Unrealized P&L</TableHead>
                      <TableHead className="text-right">Return %</TableHead>
                      <TableHead className="hidden md:table-cell text-right">Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((pos) => (
                      <TableRow key={pos.id}>
                        <TableCell className="font-bold">{pos.symbol}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={pos.side === 'long' ? 'text-emerald-500 border-emerald-500/30' : 'text-rose-500 border-rose-500/30'}>
                            {pos.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{pos.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(pos.entryPrice)}</TableCell>
                        <TableCell className="text-right">{pos.currentPrice ? formatCurrency(pos.currentPrice) : "-"}</TableCell>
                        <TableCell className="text-right">{pos.marketValue ? formatCurrency(pos.marketValue) : "-"}</TableCell>
                        <TableCell className={`text-right font-medium ${pos.unrealizedPnl && pos.unrealizedPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {pos.unrealizedPnl ? (pos.unrealizedPnl > 0 ? "+" : "") + formatCurrency(pos.unrealizedPnl) : "-"}
                        </TableCell>
                        <TableCell className={`text-right ${pos.unrealizedPnlPercent && pos.unrealizedPnlPercent >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {pos.unrealizedPnlPercent ? (pos.unrealizedPnlPercent > 0 ? "+" : "") + formatPercent(pos.unrealizedPnlPercent) : "-"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right text-muted-foreground text-xs">
                          {formatDate(pos.openedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
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