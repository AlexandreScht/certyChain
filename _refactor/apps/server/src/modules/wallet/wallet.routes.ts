import { zValidator } from "../../lib/validator";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { SHARE_LINK } from "../../config/constants";
import { CreateShareLinkSchema } from "@certifychain/contract/schemas";
import { db } from "../../db/client";
import { diplomas, shareLinks } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { urlToken } from "../../lib/ids";
import { getAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { recordAudit } from "../audit/audit.service";
import {
  getStudentDiploma,
  listStudentDiplomas,
  ownsDiploma,
  toShareLinkDTO,
} from "./wallet.service";

const idParamSchema = z.object({ id: z.string().uuid() });

export const walletRoutes = new Hono<AppEnv>()

  .use("*", requireAuth("student"))

  /** GET /wallet/diplomas — list the student's diplomas, newest first. */
  .get("/diplomas", async (c) => {
  const { sub } = getAuth(c);
  const items = await listStudentDiplomas(sub);
  return c.json(items);
  })

/** GET /wallet/diplomas/:id — a single owned diploma. */
  .get("/diplomas/:id", zValidator("param", idParamSchema), async (c) => {
  const { sub } = getAuth(c);
  const { id } = c.req.valid("param");
  const diploma = await getStudentDiploma(id, sub);
  if (!diploma) throw fail.notFound("Diplôme introuvable");
  return c.json(diploma);
  })

/** GET /wallet/diplomas/:id/shares — share links for an owned diploma. */
  .get("/diplomas/:id/shares", zValidator("param", idParamSchema), async (c) => {
  const { sub } = getAuth(c);
  const { id } = c.req.valid("param");
  if (!(await ownsDiploma(id, sub))) throw fail.notFound("Diplôme introuvable");

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.diplomaId, id))
    .orderBy(asc(shareLinks.createdAt));
  return c.json(rows.map(toShareLinkDTO));
  })

/** POST /wallet/diplomas/:id/share — create a share link for an owned diploma. */
  .post(
  "/diplomas/:id/share",
  csrfProtect(),
  zValidator("param", idParamSchema),
  zValidator("json", CreateShareLinkSchema),
  async (c) => {
    const { sub } = getAuth(c);
    const { id } = c.req.valid("param");
    if (!(await ownsDiploma(id, sub))) throw fail.notFound("Diplôme introuvable");

    const { expiresInDays } = c.req.valid("json");
    const expiresAt =
      expiresInDays == null ? null : new Date(Date.now() + expiresInDays * 86_400_000);

    const [row] = await db
      .insert(shareLinks)
      .values({
        diplomaId: id,
        token: urlToken(SHARE_LINK.TOKEN_BYTES),
        createdByStudentId: sub,
        expiresAt,
      })
      .returning();
    if (!row) throw fail.internal();

    await recordAudit({ type: "share_created", diplomaId: id });
    return c.json(toShareLinkDTO(row), 201);
  },
  )

/** POST /wallet/shares/:token/revoke — revoke an owned share link. */
  .post("/shares/:token/revoke", csrfProtect(), async (c) => {
  const { sub } = getAuth(c);
  const token = c.req.param("token");

  const [link] = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .innerJoin(diplomas, eq(shareLinks.diplomaId, diplomas.id))
    .where(and(eq(shareLinks.token, token), eq(diplomas.studentId, sub)))
    .limit(1);
  if (!link) throw fail.notFound("Lien de partage introuvable");

  await db.update(shareLinks).set({ revoked: true }).where(eq(shareLinks.id, link.id));
  return c.json({ ok: true });
  })
