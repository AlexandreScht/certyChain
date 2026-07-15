import { Hono, type Context, type MiddlewareHandler } from "hono";
import { z } from "zod";
import {
  CdcCrtUploadSchema,
  CdcIdentityFormSchema,
  CreateCdcExportSchema,
  ListCdcExportsQuerySchema,
  UpdateCdcSettingsSchema,
} from "@certifychain/contract/schemas";
import { RATE_LIMIT } from "../../config/constants";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { zValidator } from "../../lib/validator";
import { getAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { enforceRateLimit } from "../../middleware/rate-limit";
import {
  cancelCdcExport,
  createCdcExport,
  deleteCdcIdentity,
  generateCdcExportFile,
  getCdcExportDetail,
  getCdcSettings,
  importCdcIdentities,
  ingestCdcCrt,
  listCdcEligibleDiplomas,
  listCdcExports,
  markCdcExportSubmitted,
  updateCdcSettings,
  upsertCdcIdentity,
} from "./accrochage.service";

const diplomaIdParam = z.object({ diplomaId: z.string().uuid() });
const exportIdParam = z.object({ id: z.string().uuid() });

function schoolIdFromSession(c: Context<AppEnv>): string {
  const schoolId = getAuth(c).schoolId;
  if (!schoolId) throw fail.forbidden();
  return schoolId;
}

function schoolRateLimit(
  key: string,
  budget: { max: number; windowSec: number },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    enforceRateLimit(c, {
      key,
      identifier: schoolIdFromSession(c),
      ...budget,
    });
    await next();
  };
}

const identityImportRateLimit = schoolRateLimit(
  "cdc_identity_import",
  RATE_LIMIT.CDC_IDENTITY_IMPORT,
);
const crtIngestRateLimit = schoolRateLimit(
  "cdc_crt_ingest",
  RATE_LIMIT.CDC_CRT_INGEST,
);

export const accrochageRoutes = new Hono<AppEnv>()
  .get("/settings", requireAuth("school_admin"), async (c) =>
    c.json(await getCdcSettings(schoolIdFromSession(c))),
  )
  .put(
    "/settings",
    requireAuth("school_admin"),
    csrfProtect(),
    zValidator("json", UpdateCdcSettingsSchema),
    async (c) =>
      c.json(
        await updateCdcSettings(schoolIdFromSession(c), c.req.valid("json")),
      ),
  )
  .get("/eligible", requireAuth("school_admin"), async (c) =>
    c.json(await listCdcEligibleDiplomas(schoolIdFromSession(c))),
  )
  .post(
    "/identities",
    requireAuth("school_admin"),
    csrfProtect(),
    zValidator("json", CdcIdentityFormSchema),
    async (c) =>
      c.json(
        await upsertCdcIdentity(schoolIdFromSession(c), c.req.valid("json")),
        201,
      ),
  )
  .post(
    "/identities/import",
    requireAuth("school_admin"),
    csrfProtect(),
    identityImportRateLimit,
    async (c) => {
      const schoolId = schoolIdFromSession(c);
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw fail.validation("Fichier CSV manquant ou invalide");
      return c.json(await importCdcIdentities(schoolId, await file.text()));
    },
  )
  .delete(
    "/identities/:diplomaId",
    requireAuth("school_admin"),
    csrfProtect(),
    zValidator("param", diplomaIdParam),
    async (c) => {
      await deleteCdcIdentity(
        schoolIdFromSession(c),
        c.req.valid("param").diplomaId,
      );
      return c.json({ ok: true });
    },
  )
  .post(
    "/exports",
    requireAuth("school_admin"),
    csrfProtect(),
    zValidator("json", CreateCdcExportSchema),
    async (c) => {
      const schoolId = schoolIdFromSession(c);
      enforceRateLimit(c, {
        key: "cdc_generate",
        identifier: schoolId,
        ...RATE_LIMIT.CDC_GENERATE,
      });
      return c.json(await createCdcExport(schoolId, c.req.valid("json")), 201);
    },
  )
  .get(
    "/exports",
    requireAuth("school_admin"),
    zValidator("query", ListCdcExportsQuerySchema),
    async (c) =>
      c.json(
        await listCdcExports(schoolIdFromSession(c), c.req.valid("query")),
      ),
  )
  .get(
    "/exports/:id",
    requireAuth("school_admin"),
    zValidator("param", exportIdParam),
    async (c) =>
      c.json(
        await getCdcExportDetail(
          schoolIdFromSession(c),
          c.req.valid("param").id,
        ),
      ),
  )
  .get(
    "/exports/:id/file",
    requireAuth("school_admin"),
    zValidator("param", exportIdParam),
    async (c) => {
      const file = await generateCdcExportFile(
        schoolIdFromSession(c),
        c.req.valid("param").id,
      );
      c.header("Cache-Control", "no-store");
      c.header("Content-Type", "application/xml; charset=utf-8");
      c.header("Content-Disposition", `attachment; filename="${file.fileName}"`);
      c.header("X-Content-SHA256", file.sha256);
      return c.body(file.xml);
    },
  )
  .post(
    "/exports/:id/submitted",
    requireAuth("school_admin"),
    csrfProtect(),
    zValidator("param", exportIdParam),
    async (c) =>
      c.json(
        await markCdcExportSubmitted(
          schoolIdFromSession(c),
          c.req.valid("param").id,
        ),
      ),
  )
  .post(
    "/exports/:id/crt",
    requireAuth("school_admin"),
    csrfProtect(),
    crtIngestRateLimit,
    zValidator("param", exportIdParam),
    zValidator("json", CdcCrtUploadSchema),
    async (c) => {
      const schoolId = schoolIdFromSession(c);
      return c.json(
        await ingestCdcCrt(
          schoolId,
          c.req.valid("param").id,
          c.req.valid("json").content,
        ),
      );
    },
  )
  .post(
    "/exports/:id/cancel",
    requireAuth("school_admin"),
    csrfProtect(),
    zValidator("param", exportIdParam),
    async (c) =>
      c.json(
        await cancelCdcExport(
          schoolIdFromSession(c),
          c.req.valid("param").id,
        ),
      ),
  );
