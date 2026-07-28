/**
 * `modules/wallet/wallet.service.ts` — pagination (R4, audit 2026-07-28) and
 * `lib/cleanup.ts#purgeExpired`'s new share-link purge, exercised against a
 * REAL PostgreSQL (same `requireIntegration`/`before` connectivity-check
 * pattern as `test/modules/accrochage/service.test.ts` — skips cleanly, same
 * reason string, when no integration DB is reachable).
 */
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test, type TestContext } from "node:test";

type SqlClient = (typeof import("../../../src/db/client"))["sqlClient"];
type WalletService = typeof import("../../../src/modules/wallet/wallet.service");
type CleanupLib = typeof import("../../../src/lib/cleanup");

const schoolId = randomUUID();
const studentId = randomUUID();
const diplomaId = randomUUID();

let sqlClient: SqlClient;
let listShareLinksForDiploma: WalletService["listShareLinksForDiploma"];
let purgeExpired: CleanupLib["purgeExpired"];
let integrationReady = false;
let skipReason = "PostgreSQL d'intégration indisponible";

function requireIntegration(t: TestContext): boolean {
  if (integrationReady) return true;
  t.skip(skipReason);
  return false;
}

function siret(): string {
  const run = `${Date.now()}${randomInt(1000, 9999)}`.slice(-11);
  return `9${run}`.padStart(14, "0").slice(-14);
}

async function insertShareLink(
  token: string,
  opts: { revoked?: boolean; expiresAt?: Date | null; createdAt?: Date } = {},
): Promise<void> {
  const expiresAtIso = opts.expiresAt ? opts.expiresAt.toISOString() : null;
  const createdAtIso = (opts.createdAt ?? new Date()).toISOString();
  await sqlClient`
    insert into share_links (diploma_id, token, revoked, expires_at, created_at)
    values (
      ${diplomaId}, ${token}, ${opts.revoked ?? false}, ${expiresAtIso},
      ${createdAtIso}
    )
  `;
}

async function cleanup(): Promise<void> {
  if (!sqlClient) return;
  await sqlClient`delete from share_links where diploma_id = ${diplomaId}`;
  await sqlClient`delete from diplomas where id = ${diplomaId}`;
  await sqlClient`delete from students where id = ${studentId}`;
  await sqlClient`delete from schools where id = ${schoolId}`;
}

before(async () => {
  ({ sqlClient } = await import("../../../src/db/client"));
  try {
    const [schema] = await sqlClient<{ shareLinks: string | null }[]>`
      select to_regclass('public.share_links')::text as "shareLinks"
    `;
    if (!schema?.shareLinks) {
      skipReason = "table share_links absente de PostgreSQL";
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

  await sqlClient`
    insert into schools (id, name, siret, status)
    values (${schoolId}, 'École Wallet Test', ${siret()}, 'approved')
  `;
  await sqlClient`insert into students (id) values (${studentId})`;
  await sqlClient`
    insert into diplomas (
      id, school_id, student_id, holder_name, holder_email, program_title, rncp,
      issued_at, payload_hash, signature, encrypted_holder_secret, status
    ) values (
      ${diplomaId}, ${schoolId}, ${studentId}, 'Titulaire Test',
      'titulaire@example.test', 'Certification Test', 'RNCP12345', '2026-06-30',
      ${"a".repeat(64)}, 'test-signature', 'test-holder-secret', 'active'
    )
  `;

  ({ listShareLinksForDiploma } = await import("../../../src/modules/wallet/wallet.service"));
  ({ purgeExpired } = await import("../../../src/lib/cleanup"));
});

after(async () => {
  try {
    if (integrationReady) await cleanup();
  } finally {
    if (sqlClient) await sqlClient.end({ timeout: 1 });
  }
});

test("listShareLinksForDiploma — pagination: total reflects all rows, page slices, order unchanged (oldest first)", async (t) => {
  if (!requireIntegration(t)) return;

  const now = Date.now();
  // 3 links, ascending creation order, distinct tokens.
  await insertShareLink(`page-a-${randomUUID()}`, { createdAt: new Date(now - 3000) });
  await insertShareLink(`page-b-${randomUUID()}`, { createdAt: new Date(now - 2000) });
  await insertShareLink(`page-c-${randomUUID()}`, { createdAt: new Date(now - 1000) });

  const full = await listShareLinksForDiploma(diplomaId, { page: 1, pageSize: 20 });
  assert.equal(full.total, 3);
  assert.equal(full.items.length, 3);
  assert.ok(full.items[0]!.createdAt <= full.items[1]!.createdAt);
  assert.ok(full.items[1]!.createdAt <= full.items[2]!.createdAt);

  const firstPage = await listShareLinksForDiploma(diplomaId, { page: 1, pageSize: 2 });
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.items.length, 2);
  assert.equal(firstPage.page, 1);
  assert.equal(firstPage.pageSize, 2);

  const secondPage = await listShareLinksForDiploma(diplomaId, { page: 2, pageSize: 2 });
  assert.equal(secondPage.total, 3);
  assert.equal(secondPage.items.length, 1);
  // No overlap between the two pages.
  assert.ok(!firstPage.items.some((i) => i.token === secondPage.items[0]!.token));
});

test("purgeExpired — deletes revoked and past-expiry share links, keeps active ones", async (t) => {
  if (!requireIntegration(t)) return;
  await sqlClient`delete from share_links where diploma_id = ${diplomaId}`;

  const revokedToken = `purge-revoked-${randomUUID()}`;
  const expiredToken = `purge-expired-${randomUUID()}`;
  const activeToken = `purge-active-${randomUUID()}`;
  const futureToken = `purge-future-${randomUUID()}`;

  await insertShareLink(revokedToken, { revoked: true });
  await insertShareLink(expiredToken, { expiresAt: new Date(Date.now() - 60_000) });
  await insertShareLink(activeToken); // permanent, not revoked
  await insertShareLink(futureToken, { expiresAt: new Date(Date.now() + 3_600_000) });

  await purgeExpired();

  const remaining = await sqlClient<{ token: string }[]>`
    select token from share_links where diploma_id = ${diplomaId}
  `;
  const remainingTokens = remaining.map((r) => r.token).sort();
  assert.deepEqual(remainingTokens, [activeToken, futureToken].sort());
});
