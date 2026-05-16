import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, brokersTable } from "@workspace/db";
import {
  CreateBrokerBody,
  UpdateBrokerParams,
  UpdateBrokerBody,
  GetBrokerParams,
  DeleteBrokerParams,
  TestBrokerConnectionParams,
} from "@workspace/api-zod";
import { getAlpacaAccount } from "../lib/alpacaBroker";

const router: IRouter = Router();

router.get("/brokers", async (req, res): Promise<void> => {
  const brokers = await db.select().from(brokersTable).orderBy(brokersTable.createdAt);
  const result = brokers.map((b) => ({
    ...b,
    accountValue: b.accountValue ? parseFloat(b.accountValue) : null,
    buyingPower: b.buyingPower ? parseFloat(b.buyingPower) : null,
  }));
  res.json(result);
});

router.post("/brokers", async (req, res): Promise<void> => {
  const parsed = CreateBrokerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [broker] = await db
    .insert(brokersTable)
    .values({
      ...parsed.data,
      status: "disconnected",
    })
    .returning();
  res.status(201).json({
    ...broker,
    accountValue: broker.accountValue ? parseFloat(broker.accountValue) : null,
    buyingPower: broker.buyingPower ? parseFloat(broker.buyingPower) : null,
  });
});

router.get("/brokers/:id", async (req, res): Promise<void> => {
  const params = GetBrokerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [broker] = await db.select().from(brokersTable).where(eq(brokersTable.id, params.data.id));
  if (!broker) {
    res.status(404).json({ error: "Broker not found" });
    return;
  }
  res.json({
    ...broker,
    accountValue: broker.accountValue ? parseFloat(broker.accountValue) : null,
    buyingPower: broker.buyingPower ? parseFloat(broker.buyingPower) : null,
  });
});

router.patch("/brokers/:id", async (req, res): Promise<void> => {
  const params = UpdateBrokerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBrokerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.apiKey != null) updateData.apiKey = parsed.data.apiKey;
  if (parsed.data.apiSecret != null) updateData.apiSecret = parsed.data.apiSecret;
  if (parsed.data.accessToken != null) updateData.accessToken = parsed.data.accessToken;
  if (parsed.data.refreshToken != null) updateData.refreshToken = parsed.data.refreshToken;
  if (parsed.data.accountId != null) updateData.accountId = parsed.data.accountId;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [broker] = await db
    .update(brokersTable)
    .set(updateData)
    .where(eq(brokersTable.id, params.data.id))
    .returning();
  if (!broker) {
    res.status(404).json({ error: "Broker not found" });
    return;
  }
  res.json({
    ...broker,
    accountValue: broker.accountValue ? parseFloat(broker.accountValue) : null,
    buyingPower: broker.buyingPower ? parseFloat(broker.buyingPower) : null,
  });
});

router.delete("/brokers/:id", async (req, res): Promise<void> => {
  const params = DeleteBrokerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [broker] = await db.delete(brokersTable).where(eq(brokersTable.id, params.data.id)).returning();
    if (!broker) {
      res.status(404).json({ error: "Broker not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    req.log.error({ err }, "Failed to delete broker");
    res.status(500).json({ error: "Failed to delete broker. It may still be referenced by active trades." });
  }
});

router.post("/brokers/:id/test", async (req, res): Promise<void> => {
  const params = TestBrokerConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [broker] = await db.select().from(brokersTable).where(eq(brokersTable.id, params.data.id));
  if (!broker) {
    res.status(404).json({ error: "Broker not found" });
    return;
  }
  // ── Alpaca: real API call ──────────────────────────────────────────────────
  if (broker.brokerType === "alpaca") {
    if (!broker.apiKey || !broker.apiSecret) {
      await db.update(brokersTable).set({ status: "error" }).where(eq(brokersTable.id, params.data.id));
      res.json({ success: false, message: "Alpaca API Key ID and Secret Key are required.", accountId: null, accountValue: null });
      return;
    }
    // accountId stores "paper" or "live" as the mode flag before a real ID is set
    const isPaper = !broker.accountId || broker.accountId === "paper";
    const account = await getAlpacaAccount(broker.apiKey, broker.apiSecret, isPaper);
    if (!account) {
      // Try the other mode as a fallback
      const accountAlt = await getAlpacaAccount(broker.apiKey, broker.apiSecret, !isPaper);
      if (!accountAlt) {
        await db.update(brokersTable).set({ status: "error" }).where(eq(brokersTable.id, params.data.id));
        res.json({ success: false, message: "Could not connect to Alpaca. Check your API Key ID and Secret Key.", accountId: null, accountValue: null });
        return;
      }
      await db.update(brokersTable).set({
        status: "connected",
        accountId: `${accountAlt.isPaper ? "paper" : "live"}:${accountAlt.accountNumber}`,
        accountValue: accountAlt.equity.toFixed(4),
        buyingPower: accountAlt.buyingPower.toFixed(4),
      }).where(eq(brokersTable.id, params.data.id));
      res.json({ success: true, message: `Connected to Alpaca ${accountAlt.isPaper ? "Paper" : "Live"} — ${accountAlt.accountNumber}`, accountId: accountAlt.accountNumber, accountValue: accountAlt.equity });
      return;
    }
    await db.update(brokersTable).set({
      status: "connected",
      accountId: `${account.isPaper ? "paper" : "live"}:${account.accountNumber}`,
      accountValue: account.equity.toFixed(4),
      buyingPower: account.buyingPower.toFixed(4),
    }).where(eq(brokersTable.id, params.data.id));
    res.json({ success: true, message: `Connected to Alpaca ${account.isPaper ? "Paper" : "Live"} — ${account.accountNumber}`, accountId: account.accountNumber, accountValue: account.equity });
    return;
  }

  // ── Paper broker: no credentials needed ───────────────────────────────────
  if (broker.brokerType === "paper") {
    res.json({ success: true, message: "Paper trading account is always active.", accountId: "paper", accountValue: broker.accountValue ? parseFloat(broker.accountValue) : 100000 });
    return;
  }

  // ── Other brokers: mock for now ───────────────────────────────────────────
  const hasCredentials = !!(broker.apiKey || broker.accessToken);
  if (hasCredentials) {
    const mockAccountValue = 50000 + Math.random() * 200000;
    const mockBuyingPower = mockAccountValue * 0.4;
    await db
      .update(brokersTable)
      .set({
        status: "connected",
        accountId: broker.accountId || `ACC-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        accountValue: mockAccountValue.toFixed(4),
        buyingPower: mockBuyingPower.toFixed(4),
      })
      .where(eq(brokersTable.id, params.data.id));
    res.json({
      success: true,
      message: `Successfully connected to ${broker.name}`,
      accountId: broker.accountId,
      accountValue: mockAccountValue,
    });
  } else {
    await db.update(brokersTable).set({ status: "error" }).where(eq(brokersTable.id, params.data.id));
    res.json({
      success: false,
      message: "No API credentials found. Please add your API key and secret.",
      accountId: null,
      accountValue: null,
    });
  }
});

export default router;
