import { zValidator } from "../../lib/validator";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiError } from "@certifychain/contract/errors";
import type { DiplomaDTO, DiplomaListDTO, ImportResultDTO } from "@certifychain/contract/dto";
import {
  CreateDiplomaSchema,
  CsvDiplomaRowSchema,
  ListDiplomasQuerySchema,
  RevokeDiplomaSchema,
} from "@certifychain/contract/schemas";
import { CSV_IMPORT } from "../../config/constants";
import { db } from "../../db/client";
import { diplomas, schools } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { getAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { recordAudit } from "../audit/audit.service";
import { issueDiploma, toDiplomaDTO } from "./diplomas.service";

/** Resolves the authenticated school admin's schoolId (guaranteed present). */
function requireSchoolId(c: Context<AppEnv>): string {
  const auth = getAuth(c);
  if (!auth.schoolId) throw fail.forbidden();
  return auth.schoolId;
}

const idParamSchema = z.object({ id: z.string().uuid() });

export const diplomasRoutes = new Hono<AppEnv>()

  /* ── 1) POST / — issue a single diploma ─────────────────────────────────── */
  .post(
  "/",
  requireAuth("school_admin"),
  csrfProtect(),
  zValidator("json", CreateDiplomaSchema),
  async (c) => {
    const schoolId = requireSchoolId(c);
    const input = c.req.valid("json");
    const dto = await issueDiploma(schoolId, input);
    return c.json(dto, 201);
  },
  )

/* ── 2) GET / — list/filter/paginate the school's diplomas ──────────────── */
  .get(
  "/",
  requireAuth("school_admin"),
  zValidator("query", ListDiplomasQuerySchema),
  async (c) => {
    const schoolId = requireSchoolId(c);
    const { status, year, q, page, pageSize } = c.req.valid("query");

    const conditions = [eq(diplomas.schoolId, schoolId)];
    if (status) conditions.push(eq(diplomas.status, status));
    if (year !== undefined) {
      conditions.push(sql`extract(year from ${diplomas.issuedAt})::int = ${year}`);
    }
    if (q) {
      const like = `%${q}%`;
      const search = or(ilike(diplomas.holderName, like), ilike(diplomas.programTitle, like));
      if (search) conditions.push(search);
    }
    const where = and(...conditions);

    const [school] = await db
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!school) throw fail.notFound();

    const [totalRow] = await db.select({ value: count() }).from(diplomas).where(where);
    const total = totalRow?.value ?? 0;

    const rows = await db
      .select()
      .from(diplomas)
      .where(where)
      .orderBy(desc(diplomas.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: DiplomaDTO[] = rows.map((row) => toDiplomaDTO(row, school.name));
    const body: DiplomaListDTO = { items, total, page, pageSize };
    return c.json(body);
  },
  )

/* ── 3) POST /:id/revoke — revoke a diploma ─────────────────────────────── */
  .post(
  "/:id/revoke",
  requireAuth("school_admin"),
  csrfProtect(),
  zValidator("param", idParamSchema),
  zValidator("json", RevokeDiplomaSchema),
  async (c) => {
    const schoolId = requireSchoolId(c);
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");

    const [existing] = await db.select().from(diplomas).where(eq(diplomas.id, id)).limit(1);
    if (!existing || existing.schoolId !== schoolId) throw fail.notFound();
    if (existing.status === "revoked") throw fail.conflict("Diplôme déjà révoqué");

    // A rejected/revoked school keeps read access to its own data but must not be
    // able to mutate it — its short-lived access token can still be live for a few
    // minutes after revocation (auth/refresh gating + revokeSchool close renewal).
    const [school] = await db
      .select({ name: schools.name, status: schools.status })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (school?.status === "rejected" || school?.status === "revoked") {
      throw fail.schoolNotApproved();
    }

    const [updated] = await db
      .update(diplomas)
      .set({ status: "revoked", revokedAt: new Date(), revocationReason: reason ?? null })
      .where(and(eq(diplomas.id, id), eq(diplomas.schoolId, schoolId)))
      .returning();
    if (!updated) throw fail.notFound();

    await recordAudit({
      type: "revocation",
      schoolId,
      diplomaId: id,
      metadata: reason ? { reason } : undefined,
    });

    return c.json(toDiplomaDTO(updated, school?.name ?? ""));
  },
  )

/* ── 4) POST /import — bulk CSV import (5 MB cap on this route only) ─────── */
  .post(
  "/import",
  requireAuth("school_admin"),
  csrfProtect(),
  bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: (c) => {
      const body: ApiError = {
        error: { code: "payload_too_large", message: "Fichier CSV trop volumineux (max 5 Mo)" },
      };
      return c.json(body, 413);
    },
  }),
  async (c) => {
    const schoolId = requireSchoolId(c);

    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw fail.validation("Champ « file » manquant ou invalide");

    const content = await file.text();
    const records = parseCsv(content);
    if (records.length === 0) throw fail.validation("CSV vide ou sans données");
    if (records.length > CSV_IMPORT.MAX_ROWS) {
      throw fail.payloadTooLarge(
        `Trop de lignes (${records.length}). Maximum ${CSV_IMPORT.MAX_ROWS} par import.`,
      );
    }

    const result: ImportResultDTO = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < records.length; i += 1) {
      // CSV data row number for the user (1 = header, so first data row = 2).
      const rowNumber = i + 2;
      const parsed = CsvDiplomaRowSchema.safeParse(records[i]);
      if (!parsed.success) {
        result.skipped += 1;
        const message = parsed.error.issues
          .map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`)
          .join("; ");
        result.errors.push({ row: rowNumber, message });
        continue;
      }
      try {
        await issueDiploma(schoolId, parsed.data);
        result.imported += 1;
      } catch (e) {
        result.skipped += 1;
        const message = e instanceof Error ? e.message : "Échec de l'émission";
        result.errors.push({ row: rowNumber, message });
      }
    }

    return c.json(result);
  },
  )

/* ── CSV parser (self-contained, RFC-4180 subset) ───────────────────────── */

const CSV_HEADERS = [
  "holderName",
  "holderEmail",
  "programTitle",
  "mention",
  "issuedAt",
  "externalId",
  // Appended last so existing 6-column CSVs keep mapping correctly.
  "rncp",
] as const;

/**
 * Parses CSV text into an array of objects keyed by CSV_HEADERS, mapping each
 * column positionally. Supports CRLF/LF line endings, commas inside double-quoted
 * fields, and escaped double quotes (""). The first non-empty line is the header.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows = tokenizeCsv(text).filter(
    (cells) => cells.length > 1 || (cells[0] ?? "").trim() !== "",
  );
  if (rows.length < 2) return [];

  const [, ...dataRows] = rows; // header consumed but mapped positionally
  return dataRows.map((cells) => {
    const record: Record<string, string> = {};
    CSV_HEADERS.forEach((key, idx) => {
      const raw = cells[idx];
      const value = (raw ?? "").trim();
      if (value !== "") record[key] = value;
    });
    return record;
  });
}

/** Splits CSV text into rows of string cells, honouring quotes and escapes. */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore — handled by the following \n (or EOF)
    } else {
      field += ch;
    }
  }

  // Flush trailing field/row (file may not end with a newline).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
