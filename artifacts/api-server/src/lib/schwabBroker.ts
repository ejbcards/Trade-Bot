import { db, brokersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const SCHWAB_TRADER_BASE = "https://api.schwabapi.com/trader/v1";

export const SCHWAB_BROKER_TYPE = "schwab";

// ─── OAuth helpers ─────────────────────────────────────────────────────────

export function getSchwabAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SCHWAB_APP_KEY ?? "",
    redirect_uri: redirectUri,
    scope: "readonly,PlaceTrades",
  });
  return `https://api.schwabapi.com/v1/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const clientId = process.env.SCHWAB_APP_KEY ?? "";
  const clientSecret = process.env.SCHWAB_APP_SECRET ?? "";
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const resp = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    logger.error({ status: resp.status, body: text }, "Schwab token exchange failed");
    return null;
  }

  const data = await resp.json() as { access_token: string; refresh_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshSchwabToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const clientId = process.env.SCHWAB_APP_KEY ?? "";
  const clientSecret = process.env.SCHWAB_APP_SECRET ?? "";
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    logger.error({ status: resp.status, body: text }, "Schwab token refresh failed");
    return null;
  }

  const data = await resp.json() as { access_token: string; refresh_token: string };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

// ─── Ensure Schwab broker record ──────────────────────────────────────────

export async function ensureSchwabBroker(): Promise<number> {
  const [existing] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.brokerType, SCHWAB_BROKER_TYPE));
  if (existing) return existing.id;

  const [created] = await db
    .insert(brokersTable)
    .values({
      name: "Charles Schwab",
      brokerType: SCHWAB_BROKER_TYPE,
      status: "pending_auth",
      isActive: false,
    })
    .returning();

  logger.info({ brokerId: created.id }, "Schwab broker record created — awaiting OAuth");
  return created.id;
}

// ─── Fetch account hash (required for order endpoints) ──────────────────

export async function getSchwabAccountHash(accessToken: string): Promise<string | null> {
  const resp = await fetch(`${SCHWAB_TRADER_BASE}/accounts/accountNumbers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    logger.error({ status: resp.status }, "Failed to fetch Schwab account numbers");
    return null;
  }
  const accounts = await resp.json() as Array<{ accountNumber: string; hashValue: string }>;
  const accountNumber = process.env.SCHWAB_ACCOUNT_NUMBER;
  if (accountNumber) {
    const match = accounts.find((a) => a.accountNumber === accountNumber);
    if (match) return match.hashValue;
  }
  return accounts[0]?.hashValue ?? null;
}

// ─── Place a real options order ──────────────────────────────────────────

export async function placeSchwabOptionsOrder(opts: {
  accessToken: string;
  accountHash: string;
  contractSymbol: string;
  instruction: "BUY_TO_OPEN" | "SELL_TO_CLOSE";
  quantity: number;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const body = {
    orderType: "MARKET",
    session: "NORMAL",
    duration: "DAY",
    orderStrategyType: "SINGLE",
    orderLegCollection: [
      {
        instruction: opts.instruction,
        quantity: opts.quantity,
        instrument: {
          symbol: opts.contractSymbol,
          assetType: "OPTION",
        },
      },
    ],
  };

  const resp = await fetch(
    `${SCHWAB_TRADER_BASE}/accounts/${opts.accountHash}/orders`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    logger.error({ status: resp.status, body: text, contract: opts.contractSymbol }, "Schwab order failed");
    return { success: false, error: text };
  }

  const location = resp.headers.get("location") ?? "";
  const orderId = location.split("/").pop() ?? undefined;
  logger.info({ orderId, contract: opts.contractSymbol, instruction: opts.instruction }, "Schwab order placed");
  return { success: true, orderId };
}

// ─── Get a fresh access token for a broker record ────────────────────────

export async function getValidAccessToken(brokerId: number): Promise<string | null> {
  const [broker] = await db.select().from(brokersTable).where(eq(brokersTable.id, brokerId));
  if (!broker?.refreshToken) return null;

  const tokens = await refreshSchwabToken(broker.refreshToken);
  if (!tokens) return null;

  await db
    .update(brokersTable)
    .set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
    .where(eq(brokersTable.id, brokerId));

  return tokens.accessToken;
}
