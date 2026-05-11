import { Router } from "express";
import { botEventEmitter, type BotTradeEvent } from "../lib/botEvents";

const router = Router();

router.get("/bot/notifications/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const onTrade = (event: BotTradeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  botEventEmitter.on("trade", onTrade);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25_000);

  req.on("close", () => {
    botEventEmitter.off("trade", onTrade);
    clearInterval(heartbeat);
  });
});

export default router;
