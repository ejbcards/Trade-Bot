import { Link, useLocation } from "wouter";
import { LayoutDashboard, Wallet, PieChart, ActivitySquare, BarChart2, BrainCircuit, MessageCircle, Bell, TrendingUp, TrendingDown, AlertTriangle, Target, ArrowLeftRight, Moon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import logoUrl from "/logo.png";
import { useState, useEffect } from "react";
import { useBotNotifications, type BotNotification, type BotTradeType } from "@/hooks/useBotNotifications";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Brokers", href: "/brokers", icon: Wallet },
  { name: "Strategies", href: "/strategies", icon: BrainCircuit },
  { name: "Positions", href: "/positions", icon: PieChart },
  { name: "Trades", href: "/trades", icon: ActivitySquare },
  { name: "Reports", href: "/reports", icon: BarChart2 },
  { name: "Talk to Moose", href: "/chat", icon: MessageCircle },
];

function tradeIcon(type: BotTradeType) {
  switch (type) {
    case "buy":           return <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />;
    case "take_profit":   return <Target className="w-4 h-4 text-emerald-400 shrink-0" />;
    case "sell":          return <TrendingDown className="w-4 h-4 text-slate-400 shrink-0" />;
    case "stop_loss":     return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
    case "rolling_stop":  return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    case "flip_close":    return <ArrowLeftRight className="w-4 h-4 text-sky-400 shrink-0" />;
    case "weekend_close": return <Moon className="w-4 h-4 text-indigo-400 shrink-0" />;
  }
}

function tradeTitle(n: BotNotification): string {
  const dir = n.direction && n.direction !== "stock" ? ` ${n.direction.toUpperCase()}` : "";
  switch (n.type) {
    case "buy":           return `BUY${dir} — ${n.symbol}`;
    case "sell":          return `SELL${dir} — ${n.symbol}`;
    case "stop_loss":     return `STOP-LOSS${dir} — ${n.symbol}`;
    case "take_profit":   return `TAKE-PROFIT${dir} — ${n.symbol}`;
    case "rolling_stop":  return `ROLLING-STOP${dir} — ${n.symbol}`;
    case "flip_close":    return `FLIP${dir} — ${n.symbol}`;
    case "weekend_close": return `WEEKEND CLOSE — ${n.symbol}`;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function NotificationItem({ n }: { n: BotNotification }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceUpdate((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const pnlColor =
    n.pnl === undefined ? "" : n.pnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className={cn("px-3 py-2.5 border-b border-border/40 last:border-0", !n.read && "bg-primary/5")}>
      <div className="flex items-start gap-2">
        {tradeIcon(n.type)}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-foreground truncate">{tradeTitle(n)}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(n.timestamp)}</span>
          </div>
          {n.contract && (
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.contract} @ ${n.price.toFixed(2)}</div>
          )}
          {n.pnl !== undefined && (
            <div className={cn("text-[11px] font-medium mt-0.5", pnlColor)}>
              P&L: {n.pnl >= 0 ? "+" : ""}${n.pnl.toFixed(2)}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug line-clamp-2">{n.reason}</div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { notifications, unreadCount, markAllRead, clearAll } = useBotNotifications();
  const [open, setOpen] = useState(false);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && unreadCount > 0) {
      setTimeout(markAllRead, 1500);
    }
  };

  return (
    <aside className="w-64 border-r bg-sidebar flex flex-col h-full flex-shrink-0">
      <div className="h-16 flex items-center px-6 border-b">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight" style={{ color: "hsl(43 55% 52%)" }}>
          <img src={logoUrl} alt="GoldenMoose" className="w-8 h-8 object-contain" />
          <span>GoldenMoose</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                data-testid={`nav-${item.name.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group font-medium text-sm",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "w-5 h-5",
                    isActive ? "text-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                  )}
                />
                {item.name}
              </div>
            </Link>
          );
        })}

        <Popover open={open} onOpenChange={handleOpen}>
          <PopoverTrigger asChild>
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group font-medium text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground mt-1"
            >
              <div className="relative">
                <Bell className="w-5 h-5 text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
              <span>Bot Alerts</span>
              {unreadCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-red-400">{unreadCount} new</span>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={8}
            className="w-80 p-0 shadow-2xl border-border/60"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">Bot Alerts</span>
              <div className="flex items-center gap-1">
                {notifications.length > 0 && (
                  <>
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={markAllRead}>
                      Mark read
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={clearAll}>
                      <X className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground leading-relaxed">
                <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No alerts yet.
                <br />
                The bot will notify you here when it buys or sells.
              </div>
            ) : (
              <ScrollArea className="max-h-[420px]">
                {notifications.map((n) => (
                  <NotificationItem key={n.id} n={n} />
                ))}
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>
      </nav>

      <div className="p-4 border-t text-xs text-muted-foreground">
        <div>System Status: <span className="text-emerald-500 font-semibold">Online</span></div>
        <div className="mt-1">Version: 2.1.0</div>
      </div>
    </aside>
  );
}
