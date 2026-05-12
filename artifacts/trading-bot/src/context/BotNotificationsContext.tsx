import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";

export type BotTradeType =
  | "buy"
  | "sell"
  | "stop_loss"
  | "take_profit"
  | "rolling_stop"
  | "flip_close"
  | "weekend_close"
  | "recap";

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
  content?: string;
  timestamp: string;
}

export interface BotNotification extends BotTradeEvent {
  read: boolean;
}

interface BotNotificationsContextValue {
  notifications: BotNotification[];
  unreadCount: number;
  lastUnread: BotNotification | null;
  lastUnreadRecap: BotNotification | null;
  markAllRead: () => void;
  markRecapRead: () => void;
  clearAll: () => void;
}

const BotNotificationsContext = createContext<BotNotificationsContextValue>({
  notifications: [],
  unreadCount: 0,
  lastUnread: null,
  lastUnreadRecap: null,
  markAllRead: () => {},
  markRecapRead: () => {},
  clearAll: () => {},
});

const MAX_NOTIFICATIONS = 50;

export function BotNotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<BotNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const unreadCount = notifications.filter((n) => !n.read && n.type !== "recap").length;
  const lastUnread = notifications.find((n) => !n.read && n.type !== "recap") ?? null;
  const lastUnreadRecap = notifications.find((n) => !n.read && n.type === "recap") ?? null;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.type !== "recap" ? { ...n, read: true } : n)));
  }, []);

  const markRecapRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.type === "recap" ? { ...n, read: true } : n)));
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
      value={{ notifications, unreadCount, lastUnread, lastUnreadRecap, markAllRead, markRecapRead, clearAll }}
    >
      {children}
    </BotNotificationsContext.Provider>
  );
}

export function useBotNotificationsContext() {
  return useContext(BotNotificationsContext);
}
