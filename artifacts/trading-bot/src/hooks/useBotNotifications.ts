import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

export type BotTradeType =
  | "buy"
  | "sell"
  | "stop_loss"
  | "take_profit"
  | "rolling_stop"
  | "flip_close"
  | "weekend_close";

export interface BotTradeEvent {
  id: string;
  type: BotTradeType;
  direction?: "call" | "put" | "stock";
  symbol: string;
  contract?: string;
  price: number;
  quantity?: number;
  cost?: number;
  pnl?: number;
  reason: string;
  timestamp: string;
}

export interface BotNotification extends BotTradeEvent {
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

function formatToastTitle(event: BotTradeEvent): string {
  const dir = event.direction ? ` ${event.direction.toUpperCase()}` : "";
  switch (event.type) {
    case "buy":         return `📈 BUY${dir} — ${event.symbol}`;
    case "sell":        return `📉 SELL${dir} — ${event.symbol}`;
    case "stop_loss":   return `🛑 STOP-LOSS${dir} — ${event.symbol}`;
    case "take_profit": return `🎯 TAKE-PROFIT${dir} — ${event.symbol}`;
    case "rolling_stop":return `🔄 ROLLING-STOP${dir} — ${event.symbol}`;
    case "flip_close":  return `↩️ DIRECTION FLIP — ${event.symbol}`;
    case "weekend_close": return `🌙 WEEKEND CLOSE — ${event.symbol}`;
  }
}

function formatToastDescription(event: BotTradeEvent): string {
  const parts: string[] = [];
  if (event.contract) parts.push(event.contract);
  if (event.price > 0) parts.push(`@ $${event.price.toFixed(2)}`);
  if (event.pnl !== undefined) {
    const sign = event.pnl >= 0 ? "+" : "";
    parts.push(`P&L: ${sign}$${event.pnl.toFixed(2)}`);
  }
  if (event.cost !== undefined) parts.push(`Cost: $${event.cost.toFixed(2)}`);
  parts.push(event.reason);
  return parts.join(" · ");
}

export function useBotNotifications() {
  const [notifications, setNotifications] = useState<BotNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    const url = "/api/bot/notifications/stream";
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as BotTradeEvent;
        setNotifications((prev) =>
          [{ ...event, read: false }, ...prev].slice(0, MAX_NOTIFICATIONS),
        );

        const isBuy = event.type === "buy";
        const isProfit = event.type === "take_profit" || (event.pnl !== undefined && event.pnl > 0);
        const isLoss = event.type === "stop_loss" || event.type === "rolling_stop" || (event.pnl !== undefined && event.pnl < 0);

        if (isBuy) {
          toast.success(formatToastTitle(event), {
            description: formatToastDescription(event),
            duration: 8000,
          });
        } else if (isProfit) {
          toast.success(formatToastTitle(event), {
            description: formatToastDescription(event),
            duration: 8000,
          });
        } else if (isLoss) {
          toast.error(formatToastTitle(event), {
            description: formatToastDescription(event),
            duration: 8000,
          });
        } else {
          toast(formatToastTitle(event), {
            description: formatToastDescription(event),
            duration: 8000,
          });
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, []);

  return { notifications, unreadCount, markAllRead, clearAll };
}
