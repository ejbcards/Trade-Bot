import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userAccessTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/user/access", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [access] = await db
    .select()
    .from(userAccessTable)
    .where(eq(userAccessTable.userId, userId))
    .limit(1);
  res.json({
    hasAccess: !!access,
    grantType: access?.grantType ?? null,
  });
});

router.post("/user/redeem-key", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { key } = req.body as { key?: string };

  if (!key || typeof key !== "string" || !key.trim()) {
    res.status(400).json({ error: "Key is required" });
    return;
  }

  const rawKeys = process.env.GOLDEN_MOOSE_ACCESS_KEYS ?? "";
  const validKeys = rawKeys.split(",").map((k) => k.trim()).filter(Boolean);

  if (validKeys.length === 0) {
    res.status(400).json({ error: "Access keys are not configured" });
    return;
  }

  if (!validKeys.includes(key.trim())) {
    res.status(400).json({ error: "Invalid access key" });
    return;
  }

  const [existing] = await db
    .select()
    .from(userAccessTable)
    .where(eq(userAccessTable.userId, userId))
    .limit(1);

  if (existing) {
    res.json({ success: true, alreadyGranted: true });
    return;
  }

  await db.insert(userAccessTable).values({
    userId,
    grantType: "access_key",
    keyUsed: key.trim(),
  });

  res.json({ success: true });
});

export default router;
