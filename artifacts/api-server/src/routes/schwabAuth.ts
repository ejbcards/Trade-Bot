import { Router, type IRouter } from "express";
import { db, brokersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getSchwabAuthUrl,
  exchangeCodeForTokens,
  ensureSchwabBroker,
  getSchwabAccountHash,
  SCHWAB_BROKER_TYPE,
} from "../lib/schwabBroker";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function getRedirectUri(req: Parameters<typeof router.get>[1] extends (req: infer R, ...rest: unknown[]) => void ? R : never): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").filter(Boolean);
  const host = domains[0] ?? req.get("host") ?? "localhost";
  const proto = host.includes("replit") ? "https" : "http";
  return `${proto}://${host}/api/schwab/callback`;
}

router.get("/schwab/auth-url", async (req, res): Promise<void> => {
  await ensureSchwabBroker();
  const redirectUri = getRedirectUri(req);
  const url = getSchwabAuthUrl(redirectUri);
  logger.info({ redirectUri }, "Schwab auth URL requested");
  res.json({ authUrl: url, redirectUri, instructions: "Open the authUrl in your browser, log in to Schwab, approve access, and you will be redirected back automatically." });
});

router.get("/schwab/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("<h2>Missing authorization code from Schwab.</h2>");
    return;
  }

  const redirectUri = getRedirectUri(req);
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  if (!tokens) {
    res.status(500).send("<h2>Failed to exchange code for tokens. Check server logs.</h2>");
    return;
  }

  const brokerId = await ensureSchwabBroker();
  const accountHash = await getSchwabAccountHash(tokens.accessToken);

  await db
    .update(brokersTable)
    .set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accountId: accountHash ?? undefined,
      status: "connected",
      isActive: true,
    })
    .where(eq(brokersTable.brokerType, SCHWAB_BROKER_TYPE));

  logger.info({ brokerId, accountHash }, "Schwab broker connected via OAuth");

  res.send(`
    <html><body style="font-family:sans-serif;padding:2rem;background:#2d2d2d;color:#f0f0f0;">
      <h2 style="color:#c9a227">✅ GoldenMoose — Schwab Connected!</h2>
      <p>Your Charles Schwab account has been linked successfully.</p>
      <p>Account hash: <code>${accountHash ?? "N/A"}</code></p>
      <p>You can close this tab and return to the dashboard.</p>
    </body></html>
  `);
});

router.get("/schwab/status", async (_req, res): Promise<void> => {
  const [broker] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.brokerType, SCHWAB_BROKER_TYPE));

  if (!broker) {
    res.json({ connected: false, status: "not_configured" });
    return;
  }

  res.json({
    connected: broker.status === "connected",
    status: broker.status,
    hasRefreshToken: !!broker.refreshToken,
    hasAccountId: !!broker.accountId,
    accountId: broker.accountId,
    brokerId: broker.id,
  });
});

export default router;
