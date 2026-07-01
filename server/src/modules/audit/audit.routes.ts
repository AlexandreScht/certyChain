import { Hono } from "hono";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { getAuth, requireAuth } from "../../middleware/auth";
import { listSchoolAudit } from "./audit.service";

export const auditRoutes = new Hono<AppEnv>();

/** GET /audit — recent audit trail for the authenticated school. */
auditRoutes.get("/", requireAuth("school_admin"), async (c) => {
  const auth = getAuth(c);
  if (!auth.schoolId) throw fail.forbidden();
  const items = await listSchoolAudit(auth.schoolId, 100);
  return c.json({ items });
});
