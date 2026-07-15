import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test, type TestContext } from "node:test";

type App = ReturnType<(typeof import("../../../src/app"))["createApp"]>;
type SqlClient = (typeof import("../../../src/db/client"))["sqlClient"];

const schoolIds = {
  disabled: randomUUID(),
  eligible: randomUUID(),
  lifecycle: randomUUID(),
  integrity: randomUUID(),
  other: randomUUID(),
};

const diplomaIds = {
  eligible: randomUUID(),
  noRncp: randomUUID(),
  revoked: randomUUID(),
  inFlight: randomUUID(),
  lifecycle: randomUUID(),
  integrity: randomUUID(),
  other: randomUUID(),
};

const existingExportIds = {
  inFlight: randomUUID(),
  other: randomUUID(),
};

let app: App;
let sqlClient: SqlClient;
let purgeExpiredCdcIdentities: (now?: Date) => Promise<number>;
let integrationReady = false;
let skipReason = "PostgreSQL d'intégration indisponible";
const schoolCookies = new Map<string, string>();

function syntheticNir(stem: string): string {
  const numericStem = stem.replace("2A", "19").replace("2B", "18");
  const key = Number(97n - (BigInt(numericStem) % 97n));
  return stem + String(key).padStart(2, "0");
}

function siret(index: number): string {
  const run = `${Date.now()}${randomInt(1000, 9999)}`.slice(-11);
  return `${index}${run}`.padStart(14, "0").slice(-14);
}

function requireIntegration(t: TestContext): boolean {
  if (integrationReady) return true;
  t.skip(skipReason);
  return false;
}

function authHeaders(schoolId: string, mutate = false): Headers {
  const accessToken = schoolCookies.get(schoolId);
  assert.ok(accessToken, `session absente pour ${schoolId}`);
  const headers = new Headers({ cookie: `cc_at=${accessToken}` });
  if (mutate) {
    headers.append("cookie", "; cc_csrf=cdc-integration-csrf");
    headers.set("x-csrf-token", "cdc-integration-csrf");
  }
  return headers;
}

async function requestJson(
  schoolId: string,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<Response> {
  const headers = authHeaders(schoolId, true);
  if (body !== undefined) headers.set("content-type", "application/json");
  return await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function insertSchool(id: string, name: string, schoolSiret: string): Promise<void> {
  await sqlClient`
    insert into schools (id, name, siret, status)
    values (${id}, ${name}, ${schoolSiret}, 'approved')
  `;
}

async function enableCdc(id: string, schoolSiret: string): Promise<void> {
  await sqlClient`
    insert into cdc_settings (
      school_id, enabled, certificateur_siret, emitter_id_client,
      certificateur_id_client, contract_id
    ) values (${id}, true, ${schoolSiret}, 'EMIT0001', 'CERT0001', 'CONTRACT-TEST')
  `;
}

async function insertDiploma(
  id: string,
  schoolId: string,
  options: { rncp?: string | null; status?: "active" | "revoked" } = {},
): Promise<void> {
  await sqlClient`
    insert into diplomas (
      id, school_id, holder_name, holder_email, program_title, rncp, issued_at,
      payload_hash, signature, encrypted_holder_secret, status
    ) values (
      ${id}, ${schoolId}, 'Titulaire Test', ${`${id}@example.test`},
      'Certification Test', ${options.rncp === undefined ? "RNCP12345" : options.rncp},
      '2026-06-30', ${"a".repeat(64)}, 'test-signature', 'test-holder-secret',
      ${options.status ?? "active"}
    )
  `;
}

async function cleanup(): Promise<void> {
  if (!sqlClient) return;
  for (const schoolId of Object.values(schoolIds)) {
    await sqlClient`delete from audit_log where school_id = ${schoolId}`;
    await sqlClient`
      delete from cdc_export_items
      where export_id in (select id from cdc_exports where school_id = ${schoolId})
    `;
    await sqlClient`delete from cdc_exports where school_id = ${schoolId}`;
    await sqlClient`delete from cdc_identities where school_id = ${schoolId}`;
    await sqlClient`delete from diplomas where school_id = ${schoolId}`;
    await sqlClient`delete from cdc_settings where school_id = ${schoolId}`;
    await sqlClient`delete from schools where id = ${schoolId}`;
  }
}

before(async () => {
  ({ sqlClient } = await import("../../../src/db/client"));
  try {
    const [schema] = await sqlClient<
      { cdcSettings: string | null; cdcExports: string | null }[]
    >`select to_regclass('public.cdc_settings')::text as "cdcSettings",
             to_regclass('public.cdc_exports')::text as "cdcExports"`;
    if (!schema?.cdcSettings || !schema.cdcExports) {
      skipReason = "migrations CDC 0011/0013 absentes de PostgreSQL";
      return;
    }
  } catch (error) {
    skipReason = `PostgreSQL d'intégration indisponible: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return;
  }

  integrationReady = true;
  await cleanup();

  const sirets = [0, 1, 2, 3, 4].map((index) => siret(index + 1));
  await insertSchool(schoolIds.disabled, "CDC désactivé", sirets[0]!);
  await insertSchool(schoolIds.eligible, "CDC éligibilité", sirets[1]!);
  await insertSchool(schoolIds.lifecycle, "CDC cycle", sirets[2]!);
  await insertSchool(schoolIds.integrity, "CDC intégrité", sirets[3]!);
  await insertSchool(schoolIds.other, "CDC autre tenant", sirets[4]!);
  await enableCdc(schoolIds.eligible, sirets[1]!);
  await enableCdc(schoolIds.lifecycle, sirets[2]!);
  await enableCdc(schoolIds.integrity, sirets[3]!);
  await enableCdc(schoolIds.other, sirets[4]!);

  await insertDiploma(diplomaIds.eligible, schoolIds.eligible);
  await insertDiploma(diplomaIds.noRncp, schoolIds.eligible, { rncp: null });
  await insertDiploma(diplomaIds.revoked, schoolIds.eligible, { status: "revoked" });
  await insertDiploma(diplomaIds.inFlight, schoolIds.eligible);
  await insertDiploma(diplomaIds.lifecycle, schoolIds.lifecycle);
  await insertDiploma(diplomaIds.integrity, schoolIds.integrity);
  await insertDiploma(diplomaIds.other, schoolIds.other);

  for (const [exportId, schoolId, diplomaId] of [
    [existingExportIds.inFlight, schoolIds.eligible, diplomaIds.inFlight],
    [existingExportIds.other, schoolIds.other, diplomaIds.other],
  ] as const) {
    await sqlClient`
      insert into cdc_exports (
        id, school_id, status, file_name, file_sha256, emitter_id_client,
        certificateur_id_client, contract_id, generated_at
      ) values (
        ${exportId}, ${schoolId}, 'generated', 'fixture.xml', ${"0".repeat(64)},
        'EMIT0001', 'CERT0001', 'CONTRACT-TEST', now()
      )
    `;
    await sqlClient`
      insert into cdc_export_items (id, export_id, diploma_id, status)
      values (${randomUUID()}, ${exportId}, ${diplomaId}, 'pending')
    `;
  }

  const { signAccessToken } = await import("../../../src/lib/tokens");
  for (const schoolId of Object.values(schoolIds)) {
    schoolCookies.set(
      schoolId,
      await signAccessToken({
        sub: randomUUID(),
        role: "school_admin",
        email: `admin-${schoolId}@example.test`,
        schoolId,
      }),
    );
  }

  ({ purgeExpiredCdcIdentities } = await import(
    "../../../src/modules/accrochage/accrochage.service"
  ));
  const { createApp } = await import("../../../src/app");
  app = createApp();
});

after(async () => {
  try {
    if (integrationReady) await cleanup();
  } finally {
    if (sqlClient) await sqlClient.end({ timeout: 1 });
  }
});

test("CDC HTTP: feature-off, éligibilité et cloisonnement tenant", async (t) => {
  if (!requireIntegration(t)) return;

  const disabled = await app.request("/cdc/eligible", {
    headers: authHeaders(schoolIds.disabled),
  });
  assert.equal(disabled.status, 403);

  const eligible = await app.request("/cdc/eligible", {
    headers: authHeaders(schoolIds.eligible),
  });
  assert.equal(eligible.status, 200);
  const items = await json<Array<{ id: string }>>(eligible);
  assert.deepEqual(items.map((item) => item.id), [diplomaIds.eligible]);
  assert.ok(!items.some((item) => item.id === diplomaIds.other), "aucun diplôme d'un autre tenant");
  assert.ok(!items.some((item) => item.id === diplomaIds.noRncp), "RNCP nul exclu");
  assert.ok(!items.some((item) => item.id === diplomaIds.revoked), "diplôme révoqué exclu");
  assert.ok(!items.some((item) => item.id === diplomaIds.inFlight), "diplôme en vol exclu");

  const foreignIdentity = await requestJson(
    schoolIds.eligible,
    "/cdc/identities",
    "POST",
    {
      diplomaId: diplomaIds.other,
      nir: syntheticNir("1800175123456"),
      birthLastName: "INTERDIT",
      obtentionMethod: "PAR_ADMISSION",
    },
  );
  assert.equal(foreignIdentity.status, 404);

  const foreignExport = await requestJson(schoolIds.eligible, "/cdc/exports", "POST", {
    diplomaIds: [diplomaIds.other],
  });
  assert.equal(foreignExport.status, 422);

  const foreignDetail = await app.request(`/cdc/exports/${existingExportIds.other}`, {
    headers: authHeaders(schoolIds.eligible),
  });
  assert.equal(foreignDetail.status, 404);
});

test("CDC HTTP: submitted ne peut plus être annulé, CRT accepté puis purge", async (t) => {
  if (!requireIntegration(t)) return;

  const identity = await requestJson(schoolIds.lifecycle, "/cdc/identities", "POST", {
    diplomaId: diplomaIds.lifecycle,
    nir: syntheticNir("1800175123456"),
    birthLastName: "DUPONT",
    obtentionMethod: "PAR_ADMISSION",
  });
  assert.equal(identity.status, 201);

  const created = await requestJson(schoolIds.lifecycle, "/cdc/exports", "POST", {
    diplomaIds: [diplomaIds.lifecycle],
  });
  assert.equal(created.status, 201);
  const batch = await json<{ id: string; status: string; fileSha256: string }>(created);
  assert.equal(batch.status, "generated");
  assert.match(batch.fileSha256, /^[0-9a-f]{64}$/);

  const submitted = await requestJson(
    schoolIds.lifecycle,
    `/cdc/exports/${batch.id}/submitted`,
    "POST",
  );
  assert.equal(submitted.status, 200);

  const cancelled = await requestJson(
    schoolIds.lifecycle,
    `/cdc/exports/${batch.id}/cancel`,
    "POST",
  );
  assert.equal(cancelled.status, 409, "transition submitted -> cancelled interdite");

  const [item] = await sqlClient<{ id: string }[]>`
    select id from cdc_export_items where export_id = ${batch.id}
  `;
  assert.ok(item);
  const crt = `<accuse><passagesOK><passage><idTechnique>${item.id}</idTechnique></passage></passagesOK></accuse>`;
  const ingested = await requestJson(
    schoolIds.lifecycle,
    `/cdc/exports/${batch.id}/crt`,
    "POST",
    { content: crt },
  );
  assert.equal(ingested.status, 200);
  assert.equal((await json<{ status: string }>(ingested)).status, "accepted");

  await sqlClient`
    update cdc_identities set purge_after = now() - interval '1 second'
    where diploma_id = ${diplomaIds.lifecycle}
  `;
  assert.equal(await purgeExpiredCdcIdentities(new Date()), 1);
  const [purged] = await sqlClient<
    { nirEncrypted: string | null; birthLastName: string | null; purgedAt: Date | null }[]
  >`select nir_encrypted as "nirEncrypted", birth_last_name as "birthLastName",
           purged_at as "purgedAt"
    from cdc_identities where diploma_id = ${diplomaIds.lifecycle}`;
  assert.ok(purged?.purgedAt);
  assert.equal(purged.nirEncrypted, null);
  assert.equal(purged.birthLastName, null);
});

test("CDC HTTP: une identité modifiée après génération déclenche le conflit de hash", async (t) => {
  if (!requireIntegration(t)) return;

  const identity = await requestJson(schoolIds.integrity, "/cdc/identities", "POST", {
    diplomaId: diplomaIds.integrity,
    nir: syntheticNir("180012A123456"),
    birthLastName: "MARTIN",
    obtentionMethod: "PAR_SCORING",
  });
  assert.equal(identity.status, 201);

  const created = await requestJson(schoolIds.integrity, "/cdc/exports", "POST", {
    diplomaIds: [diplomaIds.integrity],
  });
  assert.equal(created.status, 201);
  const { id } = await json<{ id: string }>(created);

  // Simule une corruption/modification hors service : la route d'upsert normale
  // refuse déjà toute identité engagée dans un lot.
  await sqlClient`
    update cdc_identities set birth_last_name = 'MARTIN-MODIFIE'
    where diploma_id = ${diplomaIds.integrity}
  `;
  const download = await app.request(`/cdc/exports/${id}/file`, {
    headers: authHeaders(schoolIds.integrity),
  });
  assert.equal(download.status, 409);
  const error = await json<{ error: { code: string; message: string } }>(download);
  assert.equal(error.error.code, "conflict");
  assert.match(error.error.message, /contenu du lot a changé/i);
});
