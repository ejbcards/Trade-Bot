import { useState, useEffect, useRef } from "react";
import { useListPositions } from "@workspace/api-client-react";

export interface LivePriceUpdate {
  id: number;
  contractSymbol: string | null;
  currentPrice: number;
  bid: number;
  ask: number;
  mark: number;
  change: number;
  changePercent: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  source: "schwab" | "yahoo";
}

export interface LiveStreamEvent {
  updates: LivePriceUpdate[];
  timestamp: string;
  source: "schwab" | "yahoo" | "mixed";
}

export function useLivePositions() {
  const { data: initialPositions, isLoading } = useListPositions();
  const [liveUpdates, setLiveUpdates] = useState<Record<number, LivePriceUpdate>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [dataSource, setDataSource] = useState<"schwab" | "yahoo" | "mixed" | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const connect = () => {
      const es = new EventSource("/api/positions/live");
      esRef.current = es;

      es.addEventListener("open", () => setIsConnected(true));

      es.addEventListener("prices", (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as LiveStreamEvent;
          const map: Record<number, LivePriceUpdate> = {};
          for (const u of payload.updates) map[u.id] = u;
          setLiveUpdates(map);
          setLastUpdated(new Date(payload.timestamp));
          setDataSource(payload.source);
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("error", () => {
        setIsConnected(false);
        es.close();
        // Reconnect after 5 seconds
        setTimeout(connect, 5000);
      });
    };

    connect();

    return () => {
      esRef.current?.close();
    };
  }, []);

  // Merge live updates into base positions
  const positions = (initialPositions ?? []).map((pos) => {
    const live = liveUpdates[pos.id];
    if (!live) return pos;
    return {
      ...pos,
      currentPrice: live.mark > 0 ? live.mark : pos.currentPrice,
      marketValue: live.marketValue,
      unrealizedPnl: live.unrealizedPnl,
      unrealizedPnlPercent: live.unrealizedPnlPercent,
      _live: live,
    };
  });

  // Live-accurate totals — always prefer stream values over stale DB aggregates
  const hasLiveData = Object.keys(liveUpdates).length > 0;
  const totalLiveUnrealizedPnl = hasLiveData
    ? positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)
    : null;
  const totalLiveMarketValue = hasLiveData
    ? positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0)
    : null;

  return {
    positions,
    isLoading,
    isConnected,
    dataSource,
    lastUpdated,
    totalLiveUnrealizedPnl,
    totalLiveMarketValue,
    getLive: (posId: number) => liveUpdates[posId] ?? null,
  };
}
