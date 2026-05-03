import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListTrades } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Trades() {
  const { data: trades, isLoading } = useListTrades({ limit: 50 });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trade History</h1>
            <p className="text-muted-foreground mt-1">Review past executions and AI signals.</p>
          </div>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Recent Executions</CardTitle>
            <CardDescription>Showing last 50 completed and open trades</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : trades && trades.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Exit</TableHead>
                      <TableHead className="text-right">Realized P&L</TableHead>
                      <TableHead className="text-center">Signal</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(trade.closedAt || trade.openedAt)}
                        </TableCell>
                        <TableCell className="font-bold">{trade.symbol}</TableCell>
                        <TableCell>
                          <span className={`uppercase font-medium text-xs ${trade.side.includes('buy') ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {trade.side.replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{trade.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(trade.entryPrice)}</TableCell>
                        <TableCell className="text-right">{trade.exitPrice ? formatCurrency(trade.exitPrice) : "-"}</TableCell>
                        <TableCell className={`text-right font-medium ${trade.realizedPnl && trade.realizedPnl >= 0 ? "text-emerald-500" : trade.realizedPnl && trade.realizedPnl < 0 ? "text-destructive" : ""}`}>
                          {trade.realizedPnl ? (
                            <>
                              <div>{(trade.realizedPnl > 0 ? "+" : "") + formatCurrency(trade.realizedPnl)}</div>
                              {trade.realizedPnlPercent && (
                                <div className="text-[10px] opacity-70">
                                  {(trade.realizedPnlPercent > 0 ? "+" : "") + formatPercent(trade.realizedPnlPercent)}
                                </div>
                              )}
                            </>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {trade.aiSignal ? (
                            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-[10px] whitespace-nowrap">
                              <BrainCircuit className="w-3 h-3 mr-1" />
                              {trade.aiSignal.toUpperCase()} ({trade.aiConfidence ? formatPercent(trade.aiConfidence*100) : '-'})
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Manual</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={trade.status === 'closed' ? "bg-muted text-muted-foreground" : "border-emerald-500/50 text-emerald-500"}>
                            {trade.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                No trading history found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}