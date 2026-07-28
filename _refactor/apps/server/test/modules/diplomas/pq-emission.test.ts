/**
 * issueDiploma — PQ_POLICY hybrid emission (v2.md §V4-1), WITHOUT a database
 * (pattern of `issuance-transactional.test.ts`: fake DB-shaped objects — a
 * thenable mimicking drizzle's query-builder chain). Node's test runner runs
 * EACH test file in its own child process, so overriding `PQ_POLICY` and the
 * root PQ keys on `process.env` here is scoped to this file alone — but only
 * if done BEFORE `config/env.ts` (or anything importing it) is evaluated.
 * Since ESM `import` statements are hoisted above all other code, the
 * server modules under test are loaded via a DYNAMIC `import()` AFTER the
 * env overrides are set, not via a top-level `import`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mlDsaKeygen, mlDsaVerify } from "@certifychain/shared/crypto/ml-dsa";

const pqRoot = mlDsaKeygen();
process.env.PQ_POLICY = "dual-sign";
process.env.CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY = Buffer.from(pqRoot.publicKey).toString("base64");
process.env.CERTIFYCHAIN_ROOT_PQ_PRIVATE_KEY = Buffer.from(pqRoot.secretKey).toString("base64");

// Dynamic import AFTER the env overrides above — config/env.ts must not have
// been evaluated (by this file or an earlier one in THIS process) before now.
const { issueDiploma } = await import("../../../src/modules/diplomas/diplomas.service");
const { keyVault } = await import("../../../src/crypto/envelope");
const { generateEd25519KeyPair, verifyEd25519 } = await import("../../../src/crypto/keys");
const { env } = await import("../../../src/config/env");
const { issueSchoolCertificatePq } = await import("../../../src/crypto/keys");
const schemaMod = await import("../../../src/db/schema");
const { auditLog, diplomas, issuanceLog, students, studentEmailAliases, schools } = schemaMod;
type CreateDiplomaInput = import("@certifychain/contract/schemas").CreateDiplomaInput;
type DB = import("../../../src/db/client").DB;

const SCHOOL_ID = "55555555-5555-4555-8555-555555555555";
const STUDENT_ID = "66666666-6666-4666-8666-666666666666";

const INPUT: CreateDiplomaInput = {
  holderName: "Titulaire PQ",
  holderEmail: "titulaire.pq@example.com",
  programTitle: "Programme Hybride",
  issuedAt: "2026-07-20",
};

function tableName(table: unknown): string {
  if (table === students) return "students";
  if (table === studentEmailAliases) return "student_email_aliases";
  if (table === diplomas) return "diplomas";
  if (table === issuanceLog) return "issuance_log";
  if (table === schools) return "schools";
  if (table === auditLog) return "audit_log";
  return "unknown";
}

/** A real, approved envelope school — no PQ material yet (lazy provisioning). */
function makeSchool(): Record<string, unknown> {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  return {
    id: SCHOOL_ID,
    name: "École PQ Test",
    status: "approved",
    // ensureSchoolPqMaterial signs the PQ certificate's `issuedAt` from
    // `approvedAt` (must mirror the Ed25519 certificate's date) — required.
    approvedAt: new Date("2026-07-01T00:00:00.000Z"),
    publicKey,
    encryptedPrivateKey: keyVault.encrypt(privateKey),
    signerKind: "envelope",
    signerRef: null,
    issuanceFrozenAt: null,
    publicKeyPq: null,
    certificatePq: null,
    signerRefPq: null,
  };
}

describe("issueDiploma — PQ_POLICY=dual-sign hybrid emission (sans DB)", () => {
  it("mints the school's PQ material on first use, emits proof_version='v3' with BOTH signatures", async () => {
    assert.equal(env.PQ_POLICY, "dual-sign");
    assert.equal(env.pqEnabled, true);

    const school = makeSchool();
    const inserted: Record<string, unknown>[] = [];
    let schoolPqUpdate: Record<string, unknown> | null = null;

    function selectNode(fromTable: unknown): Record<string, unknown> {
      const node: Record<string, unknown> = {
        from: (t: unknown) => selectNode(t),
        where: () => node,
        limit: () => node,
        then: (resolve: (v: unknown) => void) => {
          if (fromTable === schools) return resolve([{ ...school, ...(schoolPqUpdate ?? {}) }]);
          if (fromTable === issuanceLog) return resolve([{ next: 0 }]);
          return resolve([]); // alias lookup → create branch
        },
      };
      return node;
    }

    const fakeTx = {
      select: () => selectNode(undefined),
      insert: (table: unknown) => ({
        values: (v: Record<string, unknown>) => {
          inserted.push({ table: tableName(table), ...v });
          const rows: Record<string, () => unknown[]> = {
            students: () => [{ id: STUDENT_ID }],
            student_email_aliases: () => [{ id: "alias", claimToken: "tok" }],
            diplomas: () => [{ id: "diploma-pq", createdAt: new Date(), revokedAt: null, revocationReason: null, ...v }],
          };
          const settle = (resolve: (x: unknown) => void) => resolve((rows[tableName(table)] ?? (() => []))());
          return { returning: () => ({ then: settle }), then: settle };
        },
      }),
      execute: async () => [],
    };

    const fakeDb = {
      select: () => selectNode(undefined),
      // Mirrors ensureSchoolPqMaterial's compare-and-swap:
      // update(schools).set({...}).where(...).returning({...}) — a single
      // writer here always "wins" (returning a non-empty array).
      update: (table: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              if (table === schools) schoolPqUpdate = v;
              return Promise.resolve(table === schools ? [{ id: SCHOOL_ID }] : []);
            },
          }),
        }),
      }),
      transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
    };

    const dto = await issueDiploma(SCHOOL_ID, INPUT, { db: fakeDb as unknown as DB });
    assert.ok(dto.id);

    const diplomaInsert = inserted.find((i) => i.table === "diplomas");
    assert.ok(diplomaInsert, "diploma was inserted");
    assert.equal(diplomaInsert?.proofVersion, "v3");
    assert.ok(typeof diplomaInsert?.signature === "string" && (diplomaInsert.signature as string).length > 0);
    assert.ok(
      typeof diplomaInsert?.signaturePq === "string" && (diplomaInsert.signaturePq as string).length > 0,
    );

    // The school's freshly-minted PQ material actually verifies the diploma's
    // ML-DSA-65 signature, AND the school's Ed25519 signature is unaffected.
    assert.ok(schoolPqUpdate, "school row was updated with PQ material");
    const pqUpdate = schoolPqUpdate as Record<string, unknown>;
    const publicKeyPq = Buffer.from(pqUpdate.publicKeyPq as string, "base64");
    const sigPq = Buffer.from(diplomaInsert?.signaturePq as string, "base64");
    const payloadHash = diplomaInsert?.payloadHash as string;
    assert.equal(mlDsaVerify(publicKeyPq, Buffer.from(payloadHash, "hex"), sigPq), true);
    assert.equal(
      verifyEd25519(school.publicKey as string, Buffer.from(payloadHash, "hex"), diplomaInsert?.signature as string),
      true,
    );
  });
});

/**
 * `dual-sign` = « signe les deux, n'exige que Ed25519 » (v2.md §V4-1). It is the
 * ROLLOUT rung: a PQ failure must degrade THIS diploma to v2, never refuse the
 * issuance — otherwise it is as risky as `require` and the three-rung ladder
 * collapses. The gate used to tolerate only the MINT: a school whose PQ material
 * was already provisioned went straight to `signPq`, outside any try/catch, so a
 * signing failure aborted the whole emission — the exact opposite of what the
 * block's own comment claimed.
 *
 * The failure injected here is a real operational scenario, not a contrivance:
 * `schools.signer_ref_pq` holds an AES-256-GCM envelope, and a rotated or
 * truncated `KEY_VAULT_SECRET` makes `keyVault.decrypt` throw inside `signPq`
 * while the school row still looks fully provisioned.
 */
describe("issueDiploma — dual-sign tolerates a PQ SIGNING failure (v2.md §V4-1)", () => {
  /** Fully provisioned school whose PQ envelope can no longer be decrypted. */
  function makeSchoolWithUnusablePqKey(): Record<string, unknown> {
    const { publicKey: publicKeyPq } = mlDsaKeygen();
    const publicKeyPqB64 = Buffer.from(publicKeyPq).toString("base64");
    return {
      ...makeSchool(),
      publicKeyPq: publicKeyPqB64,
      certificatePq: issueSchoolCertificatePq({
        schoolId: SCHOOL_ID,
        publicKey: publicKeyPqB64,
        name: "École PQ Test",
        issuedAt: "2026-07-01",
      }),
      // Not a "v1.iv.tag.ct" envelope → keyVault.decrypt throws in signPq.
      signerRefPq: "corrupted-envelope",
    };
  }

  it("emits v2 with an audited `pq_degraded` trace instead of failing the issuance", async () => {
    const school = makeSchoolWithUnusablePqKey();
    const inserted: Record<string, unknown>[] = [];

    function selectNode(fromTable: unknown): Record<string, unknown> {
      const node: Record<string, unknown> = {
        from: (t: unknown) => selectNode(t),
        where: () => node,
        limit: () => node,
        then: (resolve: (v: unknown) => void) => {
          if (fromTable === schools) return resolve([school]);
          if (fromTable === issuanceLog) return resolve([{ next: 0 }]);
          return resolve([]);
        },
      };
      return node;
    }

    const insertNode = (table: unknown) => ({
      values: (v: Record<string, unknown>) => {
        inserted.push({ table: tableName(table), ...v });
        const rows: Record<string, () => unknown[]> = {
          students: () => [{ id: STUDENT_ID }],
          student_email_aliases: () => [{ id: "alias", claimToken: "tok" }],
          diplomas: () => [
            { id: "diploma-degraded", createdAt: new Date(), revokedAt: null, revocationReason: null, ...v },
          ],
        };
        const settle = (resolve: (x: unknown) => void) => resolve((rows[tableName(table)] ?? (() => []))());
        return { returning: () => ({ then: settle }), then: settle };
      },
    });

    const fakeTx = {
      select: () => selectNode(undefined),
      insert: insertNode,
      execute: async () => [],
    };

    const fakeDb = {
      select: () => selectNode(undefined),
      // `recordAudit` writes the degradation through the INJECTED db.
      insert: insertNode,
      update: () => {
        throw new Error("the school is already provisioned — no mint expected");
      },
      transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
    };

    // Before the fix this rejected outright, taking the whole issuance with it.
    const dto = await issueDiploma(SCHOOL_ID, INPUT, { db: fakeDb as unknown as DB });
    assert.ok(dto.id);

    const diplomaInsert = inserted.find((i) => i.table === "diplomas");
    assert.ok(diplomaInsert, "the diploma was still issued");
    assert.equal(diplomaInsert?.proofVersion, "v2", "degraded to v2, not left as a v3 without PQ");
    assert.equal(diplomaInsert?.signaturePq, null);

    // The Ed25519 signature must cover the hash actually persisted: the v3
    // payload hash commits to `v: "sd-v3"`, so the emission has to be rebuilt.
    const payloadHash = diplomaInsert?.payloadHash as string;
    assert.equal(
      verifyEd25519(school.publicKey as string, Buffer.from(payloadHash, "hex"), diplomaInsert?.signature as string),
      true,
      "the persisted Ed25519 signature must match the persisted v2 payload hash",
    );

    // …and the irreversible degradation left a durable trace (v2.md §V4-0):
    // a rotating log line cannot answer "which diplomas went out unprotected".
    const audit = inserted.find((i) => i.table === "audit_log" && i.type === "pq_degraded");
    assert.ok(audit, "the degradation was journaled in the audit table");
    assert.equal(audit?.diplomaId, dto.id);
    assert.equal(audit?.schoolId, SCHOOL_ID);
    const metadata = audit?.metadata as Record<string, unknown>;
    assert.equal(metadata.policy, "dual-sign");
    assert.equal(metadata.stage, "sign", "the SIGNING stage is what failed here");
    assert.equal(metadata.emittedProofVersion, "v2");
    assert.match(String(metadata.error), /ciphertext/i);
  });
});
