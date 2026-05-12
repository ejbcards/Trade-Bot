import { EventEmitter } from "events";
import { randomUUID } from "crypto";

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

class BotEventEmitter extends EventEmitter {}

export const botEventEmitter = new BotEventEmitter();
botEventEmitter.setMaxListeners(200);

export function emitBotTrade(event: Omit<BotTradeEvent, "id" | "timestamp">): void {
  const full: BotTradeEvent = {
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  botEventEmitter.emit("trade", full);
}
