import { timingSafeEqual } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type {
  CdcEligibleDiplomaDTO,
  CdcExportCountsDTO,
  CdcExportDTO,
  CdcExportDetailDTO,
  CdcExportListDTO,
  CdcIdentityImportResultDTO,
  CdcIdentitySummaryDTO,
  CdcSettingsDTO,
} from "@certifychain/contract/dto";
import type {
  CdcIdentityFormInput,
  CreateCdcExportInput,
  ListCdcExportsQuery,
  UpdateCdcSettingsInput,
} from "@certifychain/contract/schemas";
import { CdcIdentityFormSchema } from "@certifychain/contract/schemas";
import { CDC, CSV_IMPORT } from "../../config/constants";
import { env } from "../../config/env";
import { keyVault, sha256Hex } from "../../crypto";
import { db } from "../../db/client";
import {
  type CdcExport,
  type CdcSettings,
  cdcExportItems,
  cdcExports,
  cdcIdentities,
  cdcSettings,
  diplomas,
  schools,
} from "../../db/schema";
import { AppError, fail } from "../../lib/http-error";
import { uuid } from "../../lib/ids";
import { redactCdcRejectReason } from "../../lib/mask";
import { recordAudit } from "../audit/audit.service";
import { parseCdcCrt } from "./crt-parser";
import { parseCdcIdentityCsv } from "./identity-csv";
import { normalizeNir, validateNir } from "./nir";
import { buildCdcCreationXml, type CdcBatch } from "./xml-builder";

type CompleteCdcSettings = CdcSettings & {
  emitterIdClient: string;
  certificateurIdClient: string;
  contractId: string;
};

interface EncryptedNirEnvelope {
  v: 1;
  diplomaId: string;
  nir: string;
}

interface CdcSchoolContext {
  school: typeof schools.$inferSelect;
  settings: CdcSettings | null;
}

function toSettingsDTO(context: CdcSchoolContext): CdcSettingsDTO {
  const settings = context.settings;
  return {
    enabled: settings?.enabled ?? false,
    certificateurSiret: settings?.certificateurSiret ?? context.school.siret ?? "",
    contactEmail: settings?.contactEmail ?? null,
    emitterIdClient: settings?.emitterIdClient ?? null,
    certificateurIdClient: settings?.certificateurIdClient ?? null,
    contractId: settings?.contractId ?? null,
  };
}

async function loadCdcSchoolContext(schoolId: string): Promise<CdcSchoolContext> {
  const [row] = await db
    .select({ school: schools, settings: cdcSettings })
    .from(schools)
    .leftJoin(cdcSettings, eq(cdcSettings.schoolId, schools.id))
    .where(eq(schools.id, schoolId))
    .limit(1);
  if (!row) throw fail.notFound("Établissement introuvable");
  return row;
}

function assertApproved(context: CdcSchoolContext): void {
  if (context.school.status !== "approved") throw fail.schoolNotApproved();
}

function assertEnabled(context: CdcSchoolContext): asserts context is CdcSchoolContext & {
  settings: CdcSettings;
} {
  assertApproved(context);
  if (!context.settings?.enabled) throw fail.forbidden("Module Accrochage CDC non activé");
}

function requireCompleteSettings(settings: CdcSettings): CompleteCdcSettings {
  if (
    !settings.emitterIdClient ||
    !settings.certificateurIdClient ||
    !settings.contractId
  ) {
    throw fail.validation(
      "Configuration CDC incomplète : renseignez les identifiants émetteur, certificateur et contrat",
    );
  }
  return settings as CompleteCdcSettings;
}

function encryptNir(diplomaId: string, nir: string): string {
  const envelope: EncryptedNirEnvelope = { v: 1, diplomaId, nir };
  return keyVault.encrypt(JSON.stringify(envelope));
}

function decryptNir(diplomaId: string, ciphertext: string | null): string {
  if (!ciphertext) throw fail.conflict("Identité CDC purgée ou incomplète");
  try {
    const parsed = JSON.parse(keyVault.decryptToString(ciphertext)) as Partial<EncryptedNirEnvelope>;
    if (parsed.v !== 1 || parsed.diplomaId !== diplomaId || typeof parsed.nir !== "string") {
      throw new Error("binding mismatch");
    }
    if (!validateNir(parsed.nir).ok) throw new Error("invalid stored NIR");
    return parsed.nir;
  } catch {
    throw fail.conflict("Identité CDC illisible ou incohérente");
  }
}

function isUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: string } | null)?.code;
  const cause = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return direct === "23505" || cause === "23505";
}

export async function getCdcSettings(schoolId: string): Promise<CdcSettingsDTO> {
  return toSettingsDTO(await loadCdcSchoolContext(schoolId));
}

export async function updateCdcSettings(
  schoolId: string,
  input: UpdateCdcSettingsInput,
): Promise<CdcSettingsDTO> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);
    const [context] = await tx
      .select({ school: schools, settings: cdcSettings })
      .from(schools)
      .leftJoin(cdcSettings, eq(cdcSettings.schoolId, schools.id))
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!context) throw fail.notFound("Établissement introuvable");
    assertEnabled(context);

    const [unresolved] = await tx
      .select({ id: cdcExports.id })
      .from(cdcExports)
      .where(
        and(
          eq(cdcExports.schoolId, schoolId),
          inArray(cdcExports.status, ["generated", "submitted"]),
        ),
      )
      .limit(1);
    if (unresolved) {
      throw fail.conflict("La configuration est verrouillée tant qu'un lot CDC est en cours");
    }

    const [updated] = await tx
      .update(cdcSettings)
      .set({
        certificateurSiret: input.certificateurSiret,
        contactEmail: input.contactEmail,
        emitterIdClient: input.emitterIdClient,
        certificateurIdClient: input.certificateurIdClient,
        contractId: input.contractId,
        updatedAt: new Date(),
      })
      .where(and(eq(cdcSettings.schoolId, schoolId), eq(cdcSettings.enabled, true)))
      .returning();
    if (!updated) throw fail.conflict("Configuration CDC indisponible");
    return { context, updated };
  });

  await recordAudit({ type: "cdc_settings_updated", schoolId });
  return toSettingsDTO({ school: result.context.school, settings: result.updated });
}

export async function setCdcModuleEnabled(
  schoolId: string,
  enabled: boolean,
): Promise<CdcSettingsDTO> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);
    const [context] = await tx
      .select({ school: schools, settings: cdcSettings })
      .from(schools)
      .leftJoin(cdcSettings, eq(cdcSettings.schoolId, schools.id))
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!context) throw fail.notFound("Établissement introuvable");

    let purgedIdentities = 0;

    if (enabled) {
      assertApproved(context);
      if (!context.school.siret || !/^\d{14}$/.test(context.school.siret)) {
        throw fail.validation("Un SIRET valide est requis pour activer l'accrochage CDC");
      }
    } else {
      const [unresolved] = await tx
        .select({ id: cdcExports.id })
        .from(cdcExports)
        .where(
          and(
            eq(cdcExports.schoolId, schoolId),
            inArray(cdcExports.status, ["generated", "submitted"]),
          ),
        )
        .limit(1);
      if (unresolved) {
        throw fail.conflict("Impossible de désactiver le module avec un lot CDC en cours");
      }
      const purged = await tx
        .update(cdcIdentities)
        .set({
          nirEncrypted: null,
          birthLastName: null,
          purgeAfter: null,
          purgedAt: new Date(),
        })
        .where(
          and(
            eq(cdcIdentities.schoolId, schoolId),
            or(
              isNotNull(cdcIdentities.nirEncrypted),
              isNotNull(cdcIdentities.birthLastName),
            ),
          ),
        )
        .returning({ id: cdcIdentities.id });
      purgedIdentities = purged.length;
    }

    const certificateurSiret = context.settings?.certificateurSiret ?? context.school.siret;
    if (!certificateurSiret) throw fail.validation("SIRET certificateur manquant");
    const [settings] = await tx
      .insert(cdcSettings)
      .values({ schoolId, enabled, certificateurSiret })
      .onConflictDoUpdate({
        target: cdcSettings.schoolId,
        set: { enabled, updatedAt: new Date() },
      })
      .returning();
    if (!settings) throw fail.internal();
    return { context, settings, purgedIdentities };
  });

  await recordAudit({ type: "cdc_module_toggled", schoolId, metadata: { enabled } });
  if (result.purgedIdentities > 0) {
    await recordAudit({
      type: "cdc_identity_purged",
      schoolId,
      metadata: { count: result.purgedIdentities, reason: "module_disabled" },
    });
  }
  return toSettingsDTO({ school: result.context.school, settings: result.settings });
}

export async function listCdcEligibleDiplomas(
  schoolId: string,
): Promise<CdcEligibleDiplomaDTO[]> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);

  const rows = await db
    .select({
      id: diplomas.id,
      holderName: diplomas.holderName,
      programTitle: diplomas.programTitle,
      rncp: diplomas.rncp,
      issuedAt: diplomas.issuedAt,
      nirEncrypted: cdcIdentities.nirEncrypted,
      birthLastName: cdcIdentities.birthLastName,
      purgedAt: cdcIdentities.purgedAt,
      liveItemId: cdcExportItems.id,
    })
    .from(diplomas)
    .leftJoin(cdcIdentities, eq(cdcIdentities.diplomaId, diplomas.id))
    .leftJoin(
      cdcExportItems,
      and(eq(cdcExportItems.diplomaId, diplomas.id), ne(cdcExportItems.status, "rejected")),
    )
    .where(
      and(
        eq(diplomas.schoolId, schoolId),
        eq(diplomas.status, "active"),
        isNotNull(diplomas.rncp),
        sql`${diplomas.rncp} ~ '^RNCP[0-9]+$'`,
        isNull(cdcExportItems.id),
      ),
    )
    .orderBy(desc(diplomas.issuedAt), asc(diplomas.id));

  return rows.flatMap((row) =>
    row.rncp
      ? [
          {
            id: row.id,
            holderName: row.holderName,
            programTitle: row.programTitle,
            rncp: row.rncp,
            issuedAt: row.issuedAt,
            identityComplete: Boolean(
              row.nirEncrypted && row.birthLastName && !row.purgedAt,
            ),
            inFlight: false,
          },
        ]
      : [],
  );
}

async function saveCdcIdentity(
  schoolId: string,
  input: CdcIdentityFormInput,
  source: "csv" | "form",
): Promise<CdcIdentitySummaryDTO> {
  const normalizedNir = normalizeNir(input.nir);
  const validation = validateNir(normalizedNir);
  if (!validation.ok) throw fail.validation(validation.reason);
  if (!/^[12]\d{4}(?:2[AB]|\d{2})\d{6}$/.test(normalizedNir.slice(0, 13))) {
    throw fail.validation("Le NIR n'est pas compatible avec le schéma CDC courant");
  }

  const diplomaId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);
    const [context] = await tx
      .select({ school: schools, settings: cdcSettings })
      .from(schools)
      .leftJoin(cdcSettings, eq(cdcSettings.schoolId, schools.id))
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!context) throw fail.notFound("Établissement introuvable");
    assertEnabled(context);

    const [diploma] = await tx
      .select({ id: diplomas.id, status: diplomas.status, rncp: diplomas.rncp })
      .from(diplomas)
      .where(and(eq(diplomas.id, input.diplomaId), eq(diplomas.schoolId, schoolId)))
      .limit(1);
    if (!diploma || diploma.status !== "active" || !diploma.rncp) {
      throw fail.notFound("Diplôme introuvable");
    }

    const [liveItem] = await tx
      .select({ id: cdcExportItems.id })
      .from(cdcExportItems)
      .where(
        and(
          eq(cdcExportItems.diplomaId, diploma.id),
          ne(cdcExportItems.status, "rejected"),
        ),
      )
      .limit(1);
    if (liveItem) throw fail.conflict("Cette identité appartient déjà à un lot CDC");

    const nirEncrypted = encryptNir(diploma.id, normalizedNir);
    await tx
      .insert(cdcIdentities)
      .values({
        diplomaId: diploma.id,
        schoolId,
        nirEncrypted,
        birthLastName: input.birthLastName.trim(),
        obtentionMethod: input.obtentionMethod,
        source,
      })
      .onConflictDoUpdate({
        target: cdcIdentities.diplomaId,
        set: {
          schoolId,
          nirEncrypted,
          birthLastName: input.birthLastName.trim(),
          obtentionMethod: input.obtentionMethod,
          source,
          purgeAfter: null,
          purgedAt: null,
        },
      });
    return diploma.id;
  });

  await recordAudit({
    type: "cdc_identity_upserted",
    schoolId,
    diplomaId,
    metadata: { source },
  });
  return { diplomaId, identityComplete: true, obtentionMethod: input.obtentionMethod };
}

export async function upsertCdcIdentity(
  schoolId: string,
  input: CdcIdentityFormInput,
): Promise<CdcIdentitySummaryDTO> {
  return saveCdcIdentity(schoolId, input, "form");
}

export async function importCdcIdentities(
  schoolId: string,
  source: string,
): Promise<CdcIdentityImportResultDTO> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  const rows = parseCdcIdentityCsv(source);
  if (rows.length === 0) throw fail.validation("CSV vide ou sans données");
  if (rows.length > CSV_IMPORT.MAX_ROWS) {
    throw fail.payloadTooLarge(`Trop de lignes. Maximum ${CSV_IMPORT.MAX_ROWS} par import.`);
  }

  const result: CdcIdentityImportResultDTO = { imported: 0, errors: [] };
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 2;
    try {
      if (!row) throw fail.validation("Ligne vide");
      let diplomaId = row.diplomaId;
      if (diplomaId) {
        if (!z.string().uuid().safeParse(diplomaId).success) throw fail.notFound();
      } else if (row.externalId) {
        const matches = await db
          .select({ id: diplomas.id })
          .from(diplomas)
          .where(
            and(
              eq(diplomas.schoolId, schoolId),
              eq(diplomas.externalId, row.externalId),
            ),
          )
          .limit(2);
        if (matches.length !== 1) throw fail.notFound();
        diplomaId = matches[0]?.id;
      }
      if (!diplomaId) throw fail.notFound();

      const parsed = CdcIdentityFormSchema.safeParse({
        diplomaId,
        nir: row.nir,
        birthLastName: row.birthLastName,
        obtentionMethod: row.obtentionMethod,
      });
      if (!parsed.success) {
        throw fail.validation(parsed.error.issues.map((issue) => issue.message).join("; "));
      }
      await saveCdcIdentity(schoolId, parsed.data, "csv");
      result.imported += 1;
    } catch (error) {
      const message =
        error instanceof AppError && error.code !== "not_found"
          ? error.message
          : "Diplôme introuvable ou données invalides";
      result.errors.push({ line, message });
    }
  }
  return result;
}

export async function deleteCdcIdentity(
  schoolId: string,
  diplomaId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);
    const [context] = await tx
      .select({ school: schools, settings: cdcSettings })
      .from(schools)
      .leftJoin(cdcSettings, eq(cdcSettings.schoolId, schools.id))
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!context) throw fail.notFound("Établissement introuvable");
    assertEnabled(context);

    const [liveItem] = await tx
      .select({ id: cdcExportItems.id })
      .from(cdcExportItems)
      .innerJoin(cdcExports, eq(cdcExports.id, cdcExportItems.exportId))
      .where(
        and(
          eq(cdcExportItems.diplomaId, diplomaId),
          eq(cdcExports.schoolId, schoolId),
          ne(cdcExportItems.status, "rejected"),
        ),
      )
      .limit(1);
    if (liveItem) throw fail.conflict("Cette identité appartient déjà à un lot CDC");

    const [deleted] = await tx
      .delete(cdcIdentities)
      .where(and(eq(cdcIdentities.diplomaId, diplomaId), eq(cdcIdentities.schoolId, schoolId)))
      .returning({ id: cdcIdentities.id });
    if (!deleted) throw fail.notFound("Identité CDC introuvable");
  });
  await recordAudit({ type: "cdc_identity_deleted", schoolId, diplomaId });
}

function batchFileName(settings: CompleteCdcSettings, generatedAt: Date, exportId: string): string {
  const timestamp = generatedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `CDC_${settings.certificateurIdClient}_${timestamp}_${exportId}.xml`;
}

async function buildBatchInsideTransaction(
  schoolId: string,
  input: CreateCdcExportInput,
): Promise<{ exportId: string; xml: string; fileName: string; fileSha256: string; generatedAt: Date }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);

    const [context] = await tx
      .select({ school: schools, settings: cdcSettings })
      .from(schools)
      .leftJoin(cdcSettings, eq(cdcSettings.schoolId, schools.id))
      .where(eq(schools.id, schoolId))
      .limit(1);
    if (!context) throw fail.notFound("Établissement introuvable");
    assertEnabled(context);
    const settings = requireCompleteSettings(context.settings);

    const rows = await tx
      .select({
        diplomaId: diplomas.id,
        status: diplomas.status,
        rncp: diplomas.rncp,
        issuedAt: diplomas.issuedAt,
        identityId: cdcIdentities.id,
        nirEncrypted: cdcIdentities.nirEncrypted,
        birthLastName: cdcIdentities.birthLastName,
        obtentionMethod: cdcIdentities.obtentionMethod,
        liveItemId: cdcExportItems.id,
      })
      .from(diplomas)
      .leftJoin(cdcIdentities, eq(cdcIdentities.diplomaId, diplomas.id))
      .leftJoin(
        cdcExportItems,
        and(eq(cdcExportItems.diplomaId, diplomas.id), ne(cdcExportItems.status, "rejected")),
      )
      .where(and(eq(diplomas.schoolId, schoolId), inArray(diplomas.id, input.diplomaIds)));

    const byId = new Map(rows.map((row) => [row.diplomaId, row]));
    const errors: Array<{ diplomaId: string; message: string }> = [];
    for (const diplomaId of input.diplomaIds) {
      const row = byId.get(diplomaId);
      if (!row) errors.push({ diplomaId, message: "Diplôme introuvable" });
      else if (row.status !== "active") errors.push({ diplomaId, message: "Diplôme révoqué" });
      else if (!row.rncp || !/^RNCP\d+$/.test(row.rncp)) {
        errors.push({ diplomaId, message: "Code RNCP absent ou invalide" });
      } else if (row.liveItemId) errors.push({ diplomaId, message: "Diplôme déjà en cours" });
      else if (!row.identityId || !row.nirEncrypted || !row.birthLastName) {
        errors.push({ diplomaId, message: "Identité CDC incomplète" });
      }
    }
    if (errors.length > 0) throw fail.validation("Certains diplômes ne sont pas éligibles", errors);

    const exportId = uuid();
    const generatedAt = new Date();
    const items: CdcBatch["items"] = input.diplomaIds.map((diplomaId) => {
      const row = byId.get(diplomaId);
      if (!row?.rncp || !row.birthLastName || !row.nirEncrypted || !row.obtentionMethod) {
        throw fail.validation("Identité CDC incomplète");
      }
      return {
        itemId: uuid(),
        diplomaId,
        rncp: row.rncp,
        issuedAt: row.issuedAt,
        nir: decryptNir(diplomaId, row.nirEncrypted),
        birthLastName: row.birthLastName,
        obtentionMethod: row.obtentionMethod,
      };
    });
    const xml = buildCdcCreationXml({
      exportId,
      generatedAt,
      emitterIdClient: settings.emitterIdClient,
      certificateurIdClient: settings.certificateurIdClient,
      contractId: settings.contractId,
      items,
    });
    const fileName = batchFileName(settings, generatedAt, exportId);
    const fileSha256 = sha256Hex(Buffer.from(xml, "utf8"));

    await tx.insert(cdcExports).values({
      id: exportId,
      schoolId,
      status: "generated",
      fileName,
      fileSha256,
      emitterIdClient: settings.emitterIdClient,
      certificateurIdClient: settings.certificateurIdClient,
      contractId: settings.contractId,
      generatedAt,
    });
    await tx.insert(cdcExportItems).values(
      items.map((item) => ({
        id: item.itemId,
        exportId,
        diplomaId: item.diplomaId,
        status: "pending" as const,
      })),
    );
    return { exportId, xml, fileName, fileSha256, generatedAt };
  });
}

export async function createCdcExport(
  schoolId: string,
  input: CreateCdcExportInput,
): Promise<CdcExportDetailDTO> {
  let created: Awaited<ReturnType<typeof buildBatchInsideTransaction>>;
  try {
    created = await buildBatchInsideTransaction(schoolId, input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw fail.conflict("Un lot CDC est déjà généré ou un diplôme est déjà engagé");
    }
    throw error;
  }
  await recordAudit({
    type: "cdc_export_generated",
    schoolId,
    metadata: { exportId: created.exportId, count: input.diplomaIds.length },
  });
  return getCdcExportDetail(schoolId, created.exportId);
}

async function exportCounts(exportId: string): Promise<CdcExportCountsDTO> {
  const [row] = await db
    .select({
      total: count(),
      accepted: count(sql`case when ${cdcExportItems.status} = 'accepted' then 1 end`),
      rejected: count(sql`case when ${cdcExportItems.status} = 'rejected' then 1 end`),
      pending: count(sql`case when ${cdcExportItems.status} = 'pending' then 1 end`),
    })
    .from(cdcExportItems)
    .where(eq(cdcExportItems.exportId, exportId));
  return {
    total: row?.total ?? 0,
    accepted: row?.accepted ?? 0,
    rejected: row?.rejected ?? 0,
    pending: row?.pending ?? 0,
  };
}

async function toExportDTO(row: CdcExport): Promise<CdcExportDTO> {
  return {
    id: row.id,
    status: row.status,
    fileName: row.fileName,
    fileSha256: row.fileSha256,
    generatedAt: row.generatedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    counts: await exportCounts(row.id),
  };
}

export async function listCdcExports(
  schoolId: string,
  query: ListCdcExportsQuery,
): Promise<CdcExportListDTO> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  const [totalRow] = await db
    .select({ value: count() })
    .from(cdcExports)
    .where(eq(cdcExports.schoolId, schoolId));
  const rows = await db
    .select()
    .from(cdcExports)
    .where(eq(cdcExports.schoolId, schoolId))
    .orderBy(desc(cdcExports.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  return {
    items: await Promise.all(rows.map(toExportDTO)),
    total: totalRow?.value ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getCdcExportDetail(
  schoolId: string,
  exportId: string,
): Promise<CdcExportDetailDTO> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  const [batch] = await db
    .select()
    .from(cdcExports)
    .where(and(eq(cdcExports.id, exportId), eq(cdcExports.schoolId, schoolId)))
    .limit(1);
  if (!batch) throw fail.notFound("Lot CDC introuvable");
  const storedItems = await db
    .select({
      diplomaId: diplomas.id,
      holderName: diplomas.holderName,
      programTitle: diplomas.programTitle,
      status: cdcExportItems.status,
      rejectCode: cdcExportItems.rejectCode,
      rejectReason: cdcExportItems.rejectReason,
    })
    .from(cdcExportItems)
    .innerJoin(diplomas, eq(diplomas.id, cdcExportItems.diplomaId))
    .where(eq(cdcExportItems.exportId, exportId))
    .orderBy(asc(diplomas.holderName), asc(diplomas.id));
  // Defense-in-depth for rows created before reject reasons were minimized on
  // ingestion: a NIR-shaped value never crosses the API boundary.
  const items = storedItems.map((item) => ({
    ...item,
    rejectReason: item.rejectReason
      ? redactCdcRejectReason(item.rejectReason)
      : null,
  }));
  return { ...(await toExportDTO(batch)), items };
}

export async function generateCdcExportFile(
  schoolId: string,
  exportId: string,
): Promise<{ xml: string; fileName: string; sha256: string }> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  const [batch] = await db
    .select()
    .from(cdcExports)
    .where(and(eq(cdcExports.id, exportId), eq(cdcExports.schoolId, schoolId)))
    .limit(1);
  if (!batch || batch.status === "cancelled") throw fail.notFound("Lot CDC introuvable");

  const rows = await db
    .select({
      itemId: cdcExportItems.id,
      diplomaId: diplomas.id,
      rncp: diplomas.rncp,
      issuedAt: diplomas.issuedAt,
      nirEncrypted: cdcIdentities.nirEncrypted,
      birthLastName: cdcIdentities.birthLastName,
      obtentionMethod: cdcIdentities.obtentionMethod,
    })
    .from(cdcExportItems)
    .innerJoin(diplomas, eq(diplomas.id, cdcExportItems.diplomaId))
    .leftJoin(cdcIdentities, eq(cdcIdentities.diplomaId, diplomas.id))
    .where(eq(cdcExportItems.exportId, exportId));
  if (rows.length === 0) throw fail.conflict("Le lot CDC ne contient plus de diplômes");

  const xml = buildCdcCreationXml({
    exportId: batch.id,
    generatedAt: batch.generatedAt,
    emitterIdClient: batch.emitterIdClient,
    certificateurIdClient: batch.certificateurIdClient,
    contractId: batch.contractId,
    items: rows.map((row) => {
      if (!row.rncp || !row.nirEncrypted || !row.birthLastName || !row.obtentionMethod) {
        throw fail.conflict("Une identité du lot a été purgée ou modifiée");
      }
      return {
        itemId: row.itemId,
        diplomaId: row.diplomaId,
        rncp: row.rncp,
        issuedAt: row.issuedAt,
        nir: decryptNir(row.diplomaId, row.nirEncrypted),
        birthLastName: row.birthLastName,
        obtentionMethod: row.obtentionMethod,
      };
    }),
  });
  const sha256 = sha256Hex(Buffer.from(xml, "utf8"));
  const expected = Buffer.from(batch.fileSha256, "hex");
  const actual = Buffer.from(sha256, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw fail.conflict("Le contenu du lot a changé ; générez un nouveau lot CDC");
  }
  await recordAudit({
    type: "cdc_export_downloaded",
    schoolId,
    metadata: { exportId },
  });
  return { xml, fileName: batch.fileName, sha256 };
}

export async function markCdcExportSubmitted(
  schoolId: string,
  exportId: string,
): Promise<CdcExportDetailDTO> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  const [updated] = await db
    .update(cdcExports)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(
      and(
        eq(cdcExports.id, exportId),
        eq(cdcExports.schoolId, schoolId),
        eq(cdcExports.status, "generated"),
      ),
    )
    .returning({ id: cdcExports.id });
  if (!updated) throw fail.conflict("Seul un lot généré peut être marqué comme déposé");
  await recordAudit({ type: "cdc_export_submitted", schoolId, metadata: { exportId } });
  return getCdcExportDetail(schoolId, exportId);
}

export async function cancelCdcExport(
  schoolId: string,
  exportId: string,
): Promise<CdcExportDetailDTO> {
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);
    const [updated] = await tx
      .update(cdcExports)
      .set({ status: "cancelled", resolvedAt: new Date() })
      .where(
        and(
          eq(cdcExports.id, exportId),
          eq(cdcExports.schoolId, schoolId),
          eq(cdcExports.status, "generated"),
        ),
      )
      .returning({ id: cdcExports.id });
    if (!updated) throw fail.conflict("Seul un lot généré peut être annulé");
    await tx.delete(cdcExportItems).where(eq(cdcExportItems.exportId, exportId));
  });
  return getCdcExportDetail(schoolId, exportId);
}

export async function ingestCdcCrt(
  schoolId: string,
  exportId: string,
  source: string,
): Promise<CdcExportDetailDTO> {
  const parsed = parseCdcCrt(source);
  const context = await loadCdcSchoolContext(schoolId);
  assertEnabled(context);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${schoolId}))`);
    const [batch] = await tx
      .select({ id: cdcExports.id })
      .from(cdcExports)
      .where(
        and(
          eq(cdcExports.id, exportId),
          eq(cdcExports.schoolId, schoolId),
          eq(cdcExports.status, "submitted"),
        ),
      )
      .limit(1);
    if (!batch) throw fail.conflict("Le compte rendu exige un lot au statut déposé");

    const items = await tx
      .select({ id: cdcExportItems.id, diplomaId: cdcExportItems.diplomaId })
      .from(cdcExportItems)
      .where(eq(cdcExportItems.exportId, exportId));
    const known = new Map(items.map((item) => [item.id, item]));
    if (parsed.length !== items.length || parsed.some((result) => !known.has(result.idTechnique))) {
      throw fail.validation("Le compte rendu ne correspond pas exactement aux passages du lot");
    }

    const acceptedDiplomaIds: string[] = [];
    for (const result of parsed) {
      const item = known.get(result.idTechnique);
      if (!item) throw fail.validation("Référence CDC inconnue");
      await tx
        .update(cdcExportItems)
        .set({
          status: result.accepted ? "accepted" : "rejected",
          rejectCode: result.accepted ? null : result.code ?? null,
          rejectReason:
            result.accepted || !result.reason
              ? null
              : redactCdcRejectReason(result.reason),
        })
        .where(
          and(eq(cdcExportItems.id, item.id), eq(cdcExportItems.exportId, exportId)),
        );
      if (result.accepted) acceptedDiplomaIds.push(item.diplomaId);
    }

    const rejectedCount = parsed.length - acceptedDiplomaIds.length;
    const status =
      rejectedCount === 0
        ? "accepted"
        : acceptedDiplomaIds.length === 0
          ? "rejected"
          : "partially_rejected";
    await tx
      .update(cdcExports)
      .set({ status, resolvedAt: new Date() })
      .where(and(eq(cdcExports.id, exportId), eq(cdcExports.status, "submitted")));

    if (acceptedDiplomaIds.length > 0) {
      const purgeAfter = new Date(Date.now() + env.CDC_RETENTION_DAYS * 86_400_000);
      await tx
        .update(cdcIdentities)
        .set({ purgeAfter })
        .where(
          and(
            eq(cdcIdentities.schoolId, schoolId),
            inArray(cdcIdentities.diplomaId, acceptedDiplomaIds),
          ),
        );
    }
  });

  await recordAudit({
    type: "cdc_crt_ingested",
    schoolId,
    metadata: { exportId, count: parsed.length },
  });
  return getCdcExportDetail(schoolId, exportId);
}

export async function purgeExpiredCdcIdentities(now = new Date()): Promise<number> {
  const purged = await db
    .update(cdcIdentities)
    .set({ nirEncrypted: null, birthLastName: null, purgedAt: now })
    .where(
      and(
        lt(cdcIdentities.purgeAfter, now),
        isNull(cdcIdentities.purgedAt),
        isNotNull(cdcIdentities.nirEncrypted),
      ),
    )
    .returning({ schoolId: cdcIdentities.schoolId });

  const perSchool = new Map<string, number>();
  for (const row of purged) perSchool.set(row.schoolId, (perSchool.get(row.schoolId) ?? 0) + 1);
  await Promise.all(
    [...perSchool.entries()].map(([schoolId, value]) =>
      recordAudit({ type: "cdc_identity_purged", schoolId, metadata: { count: value } }),
    ),
  );
  return purged.length;
}

/**
 * Rejection text is CDC-controlled free text. Even after identifier redaction
 * on ingestion, retain it only for the same operational window as CDC identity
 * data; the non-sensitive reject code remains available for traceability.
 */
export async function purgeExpiredCdcRejectReasons(now = new Date()): Promise<number> {
  const cutoff = new Date(
    now.getTime() - env.CDC_RETENTION_DAYS * 86_400_000,
  );
  const expiredExports = db
    .select({ id: cdcExports.id })
    .from(cdcExports)
    .where(
      and(
        isNotNull(cdcExports.resolvedAt),
        lt(cdcExports.resolvedAt, cutoff),
      ),
    );
  const purged = await db
    .update(cdcExportItems)
    .set({ rejectReason: null })
    .where(
      and(
        isNotNull(cdcExportItems.rejectReason),
        inArray(cdcExportItems.exportId, expiredExports),
      ),
    )
    .returning({ id: cdcExportItems.id });
  return purged.length;
}
