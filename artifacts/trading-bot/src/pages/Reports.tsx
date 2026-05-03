import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetPerformanceReport, GetPerformanceReportPeriod, useGetPnlChart, useGetWinRateStats, useGetTopSymbols } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/format";
import { BarChart2, TrendingUp, Target, Activity, Trophy } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function Reports() {
  const [period, setPeriod] = useState<GetPerformanceReportPeriod>("monthly");
  
  const { data: report, isLoading: isLoadingReport } = useGetPerformanceReport({ period });
  const { data: pnlChart, isLoading: isLoadingChart } = useGetPnlChart({ period });
  const { data: winRateStats, isLoading: isLoadingWinRate } = useGetWinRateStats({ period });
  const { data: topSymbols, isLoading: isLoadingTopSymbols } = useGetTopSymbols({ period, limit: 5 });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Performance Reports</h1>
            <p className="text-muted-foreground mt-1">Analyze strategy effectiveness and win rates.</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as GetPerformanceReportPeriod)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Today</SelectItem>
              <SelectItem value="weekly">This Week</SelectItem>
              <SelectItem value="monthly">This Month</SelectItem>
              <SelectItem value="quarterly">This Quarter</SelectItem>
              <SelectItem value="annually">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoadingReport ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : report ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
                <TrendingUp className={`w-4 h-4 ${report.totalPnl >= 0 ? 'text-emerald-500' : 'text-destructive'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${report.totalPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {report.totalPnl >= 0 ? "+" : ""}{formatCurrency(report.totalPnl)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Return: {report.totalPnlPercent >= 0 ? "+" : ""}{formatPercent(report.totalPnlPercent)}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
                <Target className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPercent(report.winRate)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {report.winningTrades}W - {report.losingTrades}L
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Profit Factor</CardTitle>
                <Activity className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.profitFactor.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Gross Profit / Gross Loss
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Max Drawdown</CardTitle>
                <BarChart2 className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{formatPercent(report.maxDrawdown)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Peak to trough decline
                </p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle>Cumulative P&L</CardTitle>
              <CardDescription>Performance over time</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingChart ? (
                <Skeleton className="h-[300px] w-full" />
              ) : pnlChart && pnlChart.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pnlChart} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="date" 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return period === "daily" ? `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}` : `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `$${value}`}
                      />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                        itemStyle={{ color: "hsl(var(--primary))" }}
                        formatter={(value: number) => [formatCurrency(value), "Cumulative P&L"]}
                        labelFormatter={(label) => new Date(label).toLocaleString()}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="cumulativePnl" 
                        stroke="hsl(var(--primary))" 
                        fillOpacity={1} 
                        fill="url(#colorPnl)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground border border-dashed rounded-lg">
                  No chart data available for this period
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trade Averages</CardTitle>
              <CardDescription>Metrics per trade</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingReport ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : report ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground text-sm">Average Win</span>
                    <span className="font-semibold text-emerald-500">{formatCurrency(report.avgWin)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground text-sm">Average Loss</span>
                    <span className="font-semibold text-destructive">{formatCurrency(report.avgLoss)}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground text-sm">Best Trade</span>
                    <span className="font-semibold text-emerald-500">{report.bestTrade ? formatCurrency(report.bestTrade) : "-"}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground text-sm">Worst Trade</span>
                    <span className="font-semibold text-destructive">{report.worstTrade ? formatCurrency(report.worstTrade) : "-"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Sharpe Ratio</span>
                    <span className="font-semibold">{report.sharpeRatio?.toFixed(2) || "-"}</span>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Symbols</CardTitle>
              <CardDescription>Most profitable assets traded</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingTopSymbols ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : topSymbols && topSymbols.length > 0 ? (
                <div className="space-y-4">
                  {topSymbols.map((item, i) => (
                    <div key={item.symbol} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground">
                          #{i + 1}
                        </div>
                        <div>
                          <div className="font-bold">{item.symbol}</div>
                          <div className="text-xs text-muted-foreground">{item.tradeCount} trades</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${item.totalPnl >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {item.totalPnl >= 0 ? "+" : ""}{formatCurrency(item.totalPnl)}
                        </div>
                        <div className="text-xs text-muted-foreground">Win Rate: {formatPercent(item.winRate)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-muted/10 rounded border border-dashed">
                  No symbol data
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Win/Loss Distribution</CardTitle>
              <CardDescription>Outcome counts and stats</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingWinRate ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : winRateStats ? (
                <div className="space-y-6">
                  <div className="flex gap-2 h-4 rounded-full overflow-hidden">
                    <div className="bg-emerald-500" style={{ width: `${(winRateStats.wins / Math.max(1, winRateStats.wins + winRateStats.losses + winRateStats.breakeven)) * 100}%` }} />
                    <div className="bg-muted" style={{ width: `${(winRateStats.breakeven / Math.max(1, winRateStats.wins + winRateStats.losses + winRateStats.breakeven)) * 100}%` }} />
                    <div className="bg-rose-500" style={{ width: `${(winRateStats.losses / Math.max(1, winRateStats.wins + winRateStats.losses + winRateStats.breakeven)) * 100}%` }} />
                  </div>
                  <div className="grid grid-cols-3 text-center text-sm">
                    <div>
                      <div className="font-bold text-emerald-500">{winRateStats.wins} Wins</div>
                      <div className="text-xs text-muted-foreground">{formatPercent(winRateStats.wins / Math.max(1, winRateStats.wins + winRateStats.losses + winRateStats.breakeven))}</div>
                    </div>
                    <div>
                      <div className="font-bold text-muted-foreground">{winRateStats.breakeven} Break Evens</div>
                      <div className="text-xs text-muted-foreground">{formatPercent(winRateStats.breakeven / Math.max(1, winRateStats.wins + winRateStats.losses + winRateStats.breakeven))}</div>
                    </div>
                    <div>
                      <div className="font-bold text-destructive">{winRateStats.losses} Losses</div>
                      <div className="text-xs text-muted-foreground">{formatPercent(winRateStats.losses / Math.max(1, winRateStats.wins + winRateStats.losses + winRateStats.breakeven))}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20 text-center">
                      <div className="text-xs text-emerald-500 uppercase tracking-wider mb-1 font-medium">Largest Win</div>
                      <div className="text-xl font-bold text-emerald-500">{formatCurrency(winRateStats.largestWin)}</div>
                    </div>
                    <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20 text-center">
                      <div className="text-xs text-rose-500 uppercase tracking-wider mb-1 font-medium">Largest Loss</div>
                      <div className="text-xl font-bold text-destructive">{formatCurrency(winRateStats.largestLoss)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground bg-muted/10 rounded border border-dashed">
                  No win rate stats
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}