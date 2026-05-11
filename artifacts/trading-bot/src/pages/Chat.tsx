import { AppLayout } from "@/components/layout/AppLayout";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Trash2,
  Plus,
  Send,
  Loader2,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertTriangle,
  ShieldAlert,
  Zap,
  Target,
  ArrowLeftRight,
} from "lucide-react";
import { useBotNotificationsContext, type BotTradeEvent } from "@/context/BotNotificationsContext";
import {
  useListAnthropicConversations,
  useCreateAnthropicConversation,
  useDeleteAnthropicConversation,
  useGetAnthropicConversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListAnthropicConversationsQueryKey } from "@workspace/api-client-react";
import type { AnthropicMessage } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLogTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });
}

// ---- Types for the context panel ----
interface BotContextData {
  botRunning: boolean;
  marketSnapshot: {
    spyPrice: number | null;
    spyChange: number | null;
    rsi: number | null;
    trend: string | null;
    maCondition: string | null;
    vixPrice: number | null;
    vixDayChange: number | null;
    isHighVolatility: boolean;
    fetchedAt: string;
  };
  pendingSignal: {
    direction: string;
    reason: string;
    blockedBy: string | null;
  };
  recentLogs: Array<{
    level: string;
    message: string;
    action: string | null;
    symbol: string | null;
    createdAt: string;
  }>;
  openPositionCount: number;
}

// ---- Trade alert card (proactive bot notification) ----
function buildAlertNarrative(alert: BotTradeEvent): string {
  const dir = alert.direction && alert.direction !== "stock"
    ? `SPY ${alert.direction.toUpperCase()} option`
    : `${alert.symbol} position`;

  switch (alert.type) {
    case "buy": {
      const qty = alert.quantity ? `${alert.quantity}x ` : "";
      const contract = alert.contract ? ` (${alert.contract})` : "";
      const cost = alert.cost ? ` · total cost $${alert.cost.toFixed(2)}` : "";
      return `I just entered a ${dir}${contract} — ${qty}@ $${alert.price.toFixed(2)}${cost}.\n\nWhy I entered: ${alert.reason}`;
    }
    case "take_profit": {
      const pnl = alert.pnl !== undefined ? ` Realized P&L: +$${alert.pnl.toFixed(2)}.` : "";
      return `I took profit on a ${dir} @ $${alert.price.toFixed(2)}.${pnl}\n\nTrigger: ${alert.reason}`;
    }
    case "stop_loss": {
      const pnl = alert.pnl !== undefined ? ` Realized P&L: ${alert.pnl >= 0 ? "+" : ""}$${alert.pnl.toFixed(2)}.` : "";
      return `Stop-loss hit on my ${dir} @ $${alert.price.toFixed(2)}.${pnl}\n\nReason: ${alert.reason}`;
    }
    case "rolling_stop": {
      const pnl = alert.pnl !== undefined ? ` Realized P&L: ${alert.pnl >= 0 ? "+" : ""}$${alert.pnl.toFixed(2)}.` : "";
      return `Rolling stop triggered on my ${dir} @ $${alert.price.toFixed(2)}.${pnl}\n\nReason: ${alert.reason}`;
    }
    case "sell": {
      const pnl = alert.pnl !== undefined ? ` Realized P&L: ${alert.pnl >= 0 ? "+" : ""}$${alert.pnl.toFixed(2)}.` : "";
      return `I exited my ${dir} @ $${alert.price.toFixed(2)}.${pnl}\n\nReason: ${alert.reason}`;
    }
    case "flip_close": {
      const pnl = alert.pnl !== undefined ? ` P&L: ${alert.pnl >= 0 ? "+" : ""}$${alert.pnl.toFixed(2)}.` : "";
      return `Direction flip — I closed my ${dir} @ $${alert.price.toFixed(2)}.${pnl}\n\nReason: ${alert.reason}`;
    }
    case "weekend_close": {
      const pnl = alert.pnl !== undefined ? ` P&L: ${alert.pnl >= 0 ? "+" : ""}$${alert.pnl.toFixed(2)}.` : "";
      return `Weekend close — flattened my ${dir} @ $${alert.price.toFixed(2)} to avoid overnight/weekend risk.${pnl}`;
    }
  }
}

function TradeAlertCard({ alert }: { alert: BotTradeEvent }) {
  const isPositive = alert.type === "buy" || alert.type === "take_profit";
  const isNegative = alert.type === "stop_loss" || alert.type === "rolling_stop";

  const icon = isPositive ? (
    alert.type === "take_profit"
      ? <Target className="w-3.5 h-3.5 text-emerald-400" />
      : <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
  ) : alert.type === "flip_close" ? (
    <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
  ) : (
    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
  );

  const label = {
    buy: "Trade Executed",
    sell: "Position Closed",
    stop_loss: "Stop-Loss Hit",
    take_profit: "Take-Profit Hit",
    rolling_stop: "Rolling Stop Hit",
    flip_close: "Direction Flip",
    weekend_close: "Weekend Close",
  }[alert.type];

  return (
    <div className="flex gap-3 mb-4 justify-start">
      <img src="/logo.png" alt="Moose" className="w-8 h-8 object-contain flex-shrink-0" />
      <div
        className={cn(
          "max-w-[78%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm border",
          isPositive
            ? "bg-emerald-500/8 border-emerald-500/25 text-foreground"
            : isNegative
              ? "bg-red-500/8 border-red-500/25 text-foreground"
              : "bg-sky-500/8 border-sky-500/25 text-foreground",
        )}
      >
        <div className="flex items-center gap-1.5 mb-2">
          {icon}
          <span className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{buildAlertNarrative(alert)}</p>
        <p className="text-[10px] mt-2 opacity-40">{formatTime(alert.timestamp)}</p>
      </div>
    </div>
  );
}

// ---- MessageBubble ----
function MessageBubble({
  msg,
  streaming,
}: {
  msg: AnthropicMessage | { role: string; content: string; id: number; conversationId: number; createdAt: string };
  streaming?: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3 mb-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <img src="/logo.png" alt="Moose" className="w-8 h-8 object-contain flex-shrink-0" />
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {streaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-current opacity-70 animate-pulse rounded-sm" />
        )}
        <p className={cn("text-[10px] mt-1 opacity-50", isUser ? "text-right" : "text-left")}>
          {formatTime(msg.createdAt)}
        </p>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0 text-xs font-bold text-foreground">
          You
        </div>
      )}
    </div>
  );
}

// ---- Signal badge ----
function SignalBadge({ direction }: { direction: string }) {
  const d = direction.toLowerCase();
  if (d.startsWith("call")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <TrendingUp className="w-2.5 h-2.5" /> CALL
      </span>
    );
  }
  if (d.startsWith("put")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
        <TrendingDown className="w-2.5 h-2.5" /> PUT
      </span>
    );
  }
  if (d.startsWith("blocked")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
        <ShieldAlert className="w-2.5 h-2.5" /> BLOCKED
      </span>
    );
  }
  if (d.startsWith("unavailable")) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
        <Minus className="w-2.5 h-2.5" /> N/A
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
      <Minus className="w-2.5 h-2.5" /> HOLD
    </span>
  );
}

// ---- RSI mini gauge ----
function RsiGauge({ rsi }: { rsi: number }) {
  const pct = Math.min(100, Math.max(0, rsi));
  const color =
    rsi >= 70 ? "#f87171" : rsi <= 30 ? "#34d399" : "#facc15";
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color }}>
        {rsi.toFixed(0)}
      </span>
    </div>
  );
}

// ---- Log entry row ----
function LogEntry({ log }: { log: BotContextData["recentLogs"][0] }) {
  const msg = log.message;
  const isError = log.level === "error";
  const isWarn = log.level === "warn";
  const isBuy = msg.toUpperCase().includes("[BUY]");
  const isSell = msg.toUpperCase().includes("[SELL]") || msg.toUpperCase().includes("TAKE-PROFIT") || msg.toUpperCase().includes("STOP-LOSS");
  const isHold = msg.toUpperCase().includes("[HOLD]") || msg.toUpperCase().includes("[SKIP]");
  const isVol = msg.toUpperCase().includes("VOL-REGIME") || msg.toUpperCase().includes("VOL-FILTER") || msg.toUpperCase().includes("VIX");

  const dotColor = isError
    ? "bg-red-500"
    : isWarn
      ? "bg-amber-400"
      : isBuy
        ? "bg-emerald-400"
        : isSell
          ? "bg-red-400"
          : isVol
            ? "bg-orange-400"
            : isHold
              ? "bg-slate-400"
              : "bg-blue-400";

  return (
    <div className="flex gap-1.5 py-1 border-b border-border/40 last:border-0">
      <div className="flex flex-col items-center pt-1 flex-shrink-0">
        <div className={cn("w-1.5 h-1.5 rounded-full mt-0.5", dotColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground tabular-nums mb-0.5">
          {formatLogTime(log.createdAt)} ET
          {log.symbol && (
            <span className="ml-1 font-bold text-foreground/70">{log.symbol}</span>
          )}
        </p>
        <p className="text-[11px] text-foreground/80 break-words leading-tight">{msg}</p>
      </div>
    </div>
  );
}

// ---- Live Intelligence Panel ----
function LiveIntelPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<BotContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);

  const fetchContext = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${BASE}/api/bot/context`);
      if (res.ok) {
        const json = (await res.json()) as BotContextData;
        setData(json);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchContext(false);
    const interval = setInterval(() => void fetchContext(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchContext]);

  const snap = data?.marketSnapshot;
  const signal = data?.pendingSignal;

  return (
    <div className="w-64 flex-shrink-0 border-l flex flex-col bg-background h-full">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold">Live Intelligence</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => void fetchContext(true)}
            title="Refresh"
          >
            <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
          </button>
          <button
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Close panel"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : !data ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              Unable to load context
            </p>
          ) : (
            <>
              {/* Bot status */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Bot</span>
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    data.botRunning
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {data.botRunning ? "● RUNNING" : "○ STOPPED"}
                </span>
              </div>

              {/* Pending Signal */}
              <div className="rounded-lg border bg-card p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Pending Signal</span>
                  {signal && <SignalBadge direction={signal.direction} />}
                </div>
                {signal && (
                  <p className="text-[10px] text-muted-foreground leading-snug">{signal.reason}</p>
                )}
              </div>

              {/* SPY Snapshot */}
              <div className="rounded-lg border bg-card p-2.5 space-y-2">
                <div className="flex items-center gap-1 mb-1">
                  <Activity className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">SPY Analysis</span>
                </div>
                {snap?.spyPrice != null ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold tabular-nums">${snap.spyPrice.toFixed(2)}</span>
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          snap.spyChange != null && snap.spyChange >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {snap.spyChange != null
                          ? `${snap.spyChange >= 0 ? "+" : ""}${snap.spyChange.toFixed(2)}%`
                          : ""}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">RSI (14)</span>
                      </div>
                      {snap.rsi != null && <RsiGauge rsi={snap.rsi} />}
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      <div className="text-[10px] text-muted-foreground">Trend</div>
                      <div className="text-[10px] text-right font-medium capitalize">{snap.trend ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">50d MA</div>
                      <div className="text-[10px] text-right font-medium capitalize">{snap.maCondition ?? "—"}</div>
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-muted-foreground">Market data unavailable</p>
                )}
              </div>

              {/* VIX / Vol Regime */}
              <div
                className={cn(
                  "rounded-lg border p-2.5 space-y-1.5",
                  snap?.isHighVolatility
                    ? "bg-amber-500/8 border-amber-500/25"
                    : "bg-card",
                )}
              >
                <div className="flex items-center gap-1">
                  {snap?.isHighVolatility ? (
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                  ) : (
                    <ShieldAlert className="w-3 h-3 text-muted-foreground" />
                  )}
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Vol Regime</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tabular-nums">
                    {snap?.vixPrice != null ? `VIX ${snap.vixPrice.toFixed(2)}` : "VIX —"}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      snap?.isHighVolatility
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-emerald-500/15 text-emerald-400",
                    )}
                  >
                    {snap?.isHighVolatility ? "HIGH VOL" : "NORMAL"}
                  </span>
                </div>
                {snap?.vixDayChange != null && (
                  <p className="text-[10px] text-muted-foreground">
                    {snap.vixDayChange >= 0 ? "+" : ""}{snap.vixDayChange.toFixed(2)}% today
                    {snap.isHighVolatility && " — CALLs blocked"}
                  </p>
                )}
              </div>

              {/* Open positions count */}
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] text-muted-foreground">Open positions</span>
                <span className="text-[10px] font-bold">{data.openPositionCount}</span>
              </div>

              {/* Decision Logs */}
              <div className="rounded-lg border bg-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-muted/50 transition-colors"
                  onClick={() => setLogsExpanded((v) => !v)}
                >
                  <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                    Decision Log ({data.recentLogs.length})
                  </span>
                  {logsExpanded ? (
                    <ChevronUp className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
                {logsExpanded && (
                  <div className="px-2.5 pb-2 max-h-64 overflow-y-auto">
                    {data.recentLogs.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground py-2 text-center">
                        No decision logs today yet
                      </p>
                    ) : (
                      data.recentLogs.map((log, i) => (
                        <LogEntry key={i} log={log} />
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Fetched at */}
              {snap?.fetchedAt && (
                <p className="text-[9px] text-muted-foreground/50 text-center">
                  Updated {formatLogTime(snap.fetchedAt)} ET
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---- Main Chat component ----
export default function Chat() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [showIntel, setShowIntel] = useState(true);
  const [tradeAlerts, setTradeAlerts] = useState<BotTradeEvent[]>([]);
  const seenIdsRef = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { notifications, markAllRead } = useBotNotificationsContext();

  // Mark all existing notifications as read and seen when entering chat
  useEffect(() => {
    notifications.forEach((n) => seenIdsRef.current.add(n.id));
    markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inject new trade events as alert cards in the feed
  useEffect(() => {
    const newAlerts: BotTradeEvent[] = [];
    for (const n of notifications) {
      if (!seenIdsRef.current.has(n.id)) {
        seenIdsRef.current.add(n.id);
        newAlerts.push(n);
      }
    }
    if (newAlerts.length > 0) {
      const sorted = [...newAlerts].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      setTradeAlerts((prev) => [...prev, ...sorted]);
      scrollToBottom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  const { data: convos = [], isLoading: loadingConvos } = useListAnthropicConversations();
  const { data: activeConvo, isLoading: loadingConvo } = useGetAnthropicConversation(
    activeId ?? 0,
    {
      query: {
        queryKey: [`/api/anthropic/conversations/${activeId ?? 0}`],
        enabled: activeId !== null,
      },
    },
  );

  const createConvo = useCreateAnthropicConversation({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
        setActiveId(data.id);
      },
    },
  });

  const deleteConvo = useDeleteAnthropicConversation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
        setActiveId(null);
      },
    },
  });

  const messages = activeConvo?.messages ?? [];

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingContent, activeId, scrollToBottom]);

  const handleNewChat = () => {
    const title = `Chat ${new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
    createConvo.mutate({ data: { title } });
  };

  const handleSend = async () => {
    if (!input.trim() || !activeId || streaming) return;
    const content = input.trim();
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    const userMsg: AnthropicMessage = {
      id: Date.now(),
      conversationId: activeId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    qc.setQueryData(
      [`/api/anthropic/conversations/${activeId}`],
      (old: typeof activeConvo) =>
        old ? { ...old, messages: [...(old.messages ?? []), userMsg] } : old,
    );

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`${BASE}/api/anthropic/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as {
              type: string;
              text?: string;
              content?: string;
              error?: string;
            };
            if (parsed.type === "delta" && parsed.text) {
              assembled += parsed.text;
              setStreamingContent(assembled);
              scrollToBottom();
            } else if (parsed.type === "done") {
              setStreamingContent("");
              await qc.invalidateQueries({
                queryKey: [`/api/anthropic/conversations/${activeId}`],
              });
            } else if (parsed.type === "error") {
              console.error("Stream error:", parsed.error);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error(err);
      }
    } finally {
      setStreaming(false);
      setStreamingContent("");
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <AppLayout fullHeight>
      <div className="flex h-full">
        {/* Conversation sidebar */}
        <div className="w-64 border-r bg-sidebar flex flex-col flex-shrink-0">
          <div className="p-3 border-b">
            <Button
              className="w-full gap-2"
              size="sm"
              onClick={handleNewChat}
              disabled={createConvo.isPending}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loadingConvos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : convos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8 px-2">
                  No conversations yet. Start a new chat!
                </p>
              ) : (
                convos.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors",
                      activeId === c.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                    onClick={() => setActiveId(c.id)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    <span className="flex-1 truncate text-xs">{c.title}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConvo.mutate({ id: c.id });
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeId === null ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-8">
              <img src="/logo.png" alt="Moose" className="w-20 h-20 object-contain drop-shadow-lg" />
              <div>
                <h2 className="text-2xl font-bold mb-2">Talk to the Moose</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Ask about your portfolio, positions, P&L, or get trading
                  insights. The Moose has live market data and knows exactly
                  what the bot is seeing right now.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {[
                  "How are my positions doing today?",
                  "What's my daily P&L so far?",
                  "Is the bot running? What's it doing?",
                  "What signal is the bot seeing right now?",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    className="text-left text-sm px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors flex items-center justify-between gap-2 group"
                    onClick={async () => {
                      const title = `Chat ${new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`;
                      const convo = await new Promise<{ id: number }>((resolve) => {
                        createConvo.mutate({ data: { title } }, { onSuccess: resolve });
                      });
                      setActiveId(convo.id);
                      setInput(prompt);
                    }}
                  >
                    <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                      {prompt}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
              <Button onClick={handleNewChat} disabled={createConvo.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                Start a New Chat
              </Button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="h-14 border-b flex items-center px-4 gap-3 flex-shrink-0">
                <img src="/logo.png" alt="Moose" className="w-7 h-7 object-contain flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-none">
                    {convos.find((c) => c.id === activeId)?.title ?? "The Moose"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Live market data · Bot reasoning · Real-time signals
                  </p>
                </div>
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                    showIntel
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/15"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setShowIntel((v) => !v)}
                  title="Toggle Live Intelligence panel"
                >
                  <Zap className="w-3 h-3" />
                  Intel
                </button>
              </div>

              {/* Messages + Intel panel side by side */}
              <div className="flex flex-1 min-h-0">
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Messages */}
                  <ScrollArea className="flex-1">
                    <div className="p-4">
                      {loadingConvo ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : messages.length === 0 && tradeAlerts.length === 0 && !streaming ? (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                          Send a message to start the conversation.
                        </div>
                      ) : (
                        <>
                          {messages.map((m) => (
                            <MessageBubble key={m.id} msg={m} />
                          ))}
                          {tradeAlerts.map((a) => (
                            <TradeAlertCard key={a.id} alert={a} />
                          ))}
                          {streaming && streamingContent && (
                            <MessageBubble
                              msg={{
                                id: -1,
                                conversationId: activeId,
                                role: "assistant",
                                content: streamingContent,
                                createdAt: new Date().toISOString(),
                              }}
                              streaming
                            />
                          )}
                          {streaming && !streamingContent && (
                            <div className="flex gap-3 mb-4">
                              <img src="/logo.png" alt="Moose" className="w-8 h-8 object-contain flex-shrink-0" />
                              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                              </div>
                            </div>
                          )}
                          <div ref={bottomRef} />
                        </>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <div className="border-t p-4 flex-shrink-0">
                    <div className="flex gap-2">
                      <Input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask the Moose anything…"
                        disabled={streaming}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => void handleSend()}
                        disabled={!input.trim() || streaming}
                        size="icon"
                      >
                        {streaming ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">
                      Live market data, bot signals, and decision logs are injected into every response.
                    </p>
                  </div>
                </div>

                {/* Live Intelligence panel */}
                {showIntel && <LiveIntelPanel onClose={() => setShowIntel(false)} />}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
