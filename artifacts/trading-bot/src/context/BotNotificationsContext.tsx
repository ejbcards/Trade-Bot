import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";

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

interface BotNotificationsContextValue {
  notifications: BotNotification[];
  unreadCount: number;
  lastUnread: BotNotification | null;
  markAllRead: () => void;
  clearAll: () => void;
}

const BotNotificationsContext = createContext<BotNotificationsContextValue>({
  notifications: [],
  unreadCount: 0,
  lastUnread: null,
  markAllRead: () => {},
  clearAll: () => {},
});

const MAX_NOTIFICATIONS = 50;

export function BotNotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<BotNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const lastUnread = notifications.find((n) => !n.read) ?? null;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/bot/notifications/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as BotTradeEvent;
        setNotifications((prev) =>
          [{ ...event, read: false }, ...prev].slice(0, MAX_NOTIFICATIONS),
        );
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

  return (
    <BotNotificationsContext.Provider
      value={{ notifications, unreadCount, lastUnread, markAllRead, clearAll }}
    >
      {children}
    </BotNotificationsContext.Provider>
  );
}

export function useBotNotificationsContext() {
  return useContext(BotNotificationsContext);
}
