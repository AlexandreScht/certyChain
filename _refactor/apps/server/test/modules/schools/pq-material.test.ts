/**
 * `ensureSchoolPqMaterial` (v2.md §V4-1) — WITHOUT a database (pattern of
 * `issuance-transactional.test.ts`: fake DB-shaped thenables).
 *
 * Covers the three branches: (1) idempotent fast path when the school already
 * carries PQ material; (2) the normal "we win the mint" path; (3) the
 * compare-and-swap "we LOSE a concurrent mint race" path — the one that
 * matters most: two emissions for the same school could otherwise each mint a
 * DIFFERENT ML-DSA-65 key pair, and whichever `UPDATE` lands last would
 * silently strand the other diploma with a `signaturePq` nobody can ever
 * verify again (the school row would certify a different public key than the
 * one that actually signed it). `ensureSchoolPqMaterial` guards this with a
 * conditional `WHERE ... IS NULL` update; the loser must adopt the winner's
 * material instead of trusting its own mint.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mlDsaVerify } from "@certifychain/shared/crypto/ml-dsa";
import type { School } from "../../../src/db/schema";
import { ensureSchoolPqMaterial } from "../../../src/modules/schools/schools.service";
import type { DB } from "../../../src/db/client";

const SCHOOL_ID = "77777777-7777-4777-8777-777777777777";
const APPROVED_AT = new Date("2026-06-01T10:00:00.000Z");

function baseSchool(overrides: Partial<School> = {}): School {
  return {
    id: SCHOOL_ID,
    name: "École Concurrence Test",
    // The PQ certificate's `issuedAt` MUST match the Ed25519 certificate's
    // `certIssuedAt` (derived from `approvedAt` in verify.routes.ts) — see
    // the comment in `ensureSchoolPqMaterial`. A school with no `approvedAt`
    // would make the mint fail closed (tested separately if ever needed).
    approvedAt: APPROVED_AT,
    publicKeyPq: null,
    certificatePq: null,
    signerRefPq: null,
    ...overrides,
  } as School;
}

describe("ensureSchoolPqMaterial — idempotent fast path", () => {
  it("returns the EXISTING material verbatim, without touching the database", async () => {
    const school = baseSchool({
      publicKeyPq: "existing-pub",
      certificatePq: "existing-cert",
      signerRefPq: "existing-ref",
    });
    // A `database` that throws on any call proves the fast path never queries.
    const explodingDb = {
      update: () => {
        throw new Error("must not be called — school already has PQ material");
      },
      select: () => {
        throw new Error("must not be called — school already has PQ material");
      },
    } as unknown as DB;

    const result = await ensureSchoolPqMaterial(school, explodingDb);
    assert.deepEqual(result, {
      ref: "existing-ref",
      publicKeyPq: "existing-pub",
      certificatePq: "existing-cert",
    });
  });
});

describe("ensureSchoolPqMaterial — issuedAt MUST mirror the Ed25519 certificate's date", () => {
  it("signs the PQ certificate with school.approvedAt, NEVER 'today' (else it can never verify)", async () => {
    const mintedAt = new Date(); // "today" at mint time — deliberately far from APPROVED_AT.
    const school = baseSchool(); // approvedAt = 2026-06-01, fixed in the past.
    let signedPayload: Record<string, unknown> | undefined;

    const fakeDb = {
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              signedPayload = v;
              return Promise.resolve([{ id: SCHOOL_ID }]);
            },
          }),
        }),
      }),
    } as unknown as DB;

    await ensureSchoolPqMaterial(school, fakeDb);
    const { certifychainRootPqPublicKeyB64 } = await import("../../../src/crypto/keys");
    const { canonicalize } = await import("../../../src/crypto/hashing");

    // The certificate must verify against APPROVED_AT (what verify.routes.ts
    // will reconstruct as `certIssuedAt`), NOT against `mintedAt` ("today").
    const messageWithApprovedAt = canonicalize({
      schoolId: SCHOOL_ID,
      publicKey: signedPayload?.publicKeyPq,
      name: school.name,
      issuedAt: APPROVED_AT.toISOString().slice(0, 10),
    });
    const messageWithMintDate = canonicalize({
      schoolId: SCHOOL_ID,
      publicKey: signedPayload?.publicKeyPq,
      name: school.name,
      issuedAt: mintedAt.toISOString().slice(0, 10),
    });
    const rootPub = Buffer.from(certifychainRootPqPublicKeyB64(), "base64");
    const certBytes = Buffer.from(signedPayload?.certificatePq as string, "base64");

    assert.equal(mlDsaVerify(rootPub, Buffer.from(messageWithApprovedAt, "utf8"), certBytes), true);
    if (mintedAt.toISOString().slice(0, 10) !== APPROVED_AT.toISOString().slice(0, 10)) {
      assert.equal(mlDsaVerify(rootPub, Buffer.from(messageWithMintDate, "utf8"), certBytes), false);
    }
  });

  it("fails closed if the school has no approvedAt at all (should never happen for an approved school)", async () => {
    const school = baseSchool({ approvedAt: null });
    await assert.rejects(() => ensureSchoolPqMaterial(school, {} as DB));
  });
});

describe("ensureSchoolPqMaterial — mints and wins the compare-and-swap", () => {
  it("mints a fresh key pair and persists it when no one else has", async () => {
    const school = baseSchool();
    let updateSet: Record<string, unknown> | null = null;

    const fakeDb = {
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              updateSet = v;
              return Promise.resolve([{ id: SCHOOL_ID }]); // non-empty ⇒ we won
            },
          }),
        }),
      }),
    } as unknown as DB;

    const result = await ensureSchoolPqMaterial(school, fakeDb);
    assert.ok(updateSet, "the school row was updated");
    assert.equal(result.ref, (updateSet as Record<string, unknown>).signerRefPq);
    assert.equal(result.publicKeyPq, (updateSet as Record<string, unknown>).publicKeyPq);
    assert.equal(result.certificatePq, (updateSet as Record<string, unknown>).certificatePq);
  });
});

describe("ensureSchoolPqMaterial — LOSES the compare-and-swap (concurrent mint)", () => {
  it("discards its own mint and adopts whichever PQ material actually won", async () => {
    const school = baseSchool();
    // Simulates a concurrent caller that already set the school's PQ material
    // between our read and our write.
    const winningMaterial = {
      publicKeyPq: "winner-pub",
      certificatePq: "winner-cert",
      signerRefPq: "winner-ref",
    };

    const fakeDb = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]), // empty ⇒ WE LOST the race
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ ...school, ...winningMaterial }]),
          }),
        }),
      }),
    } as unknown as DB;

    const result = await ensureSchoolPqMaterial(school, fakeDb);

    // MUST adopt the winner's material — NOT the key pair we just minted.
    assert.deepEqual(result, {
      ref: "winner-ref",
      publicKeyPq: "winner-pub",
      certificatePq: "winner-cert",
    });
  });

  it("fails closed (never signs) if the re-read still shows no material at all", async () => {
    const school = baseSchool();
    const fakeDb = {
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => Promise.resolve([]) }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            // Pathological: lost the race, but the re-read ALSO shows nothing.
            limit: () => Promise.resolve([school]),
          }),
        }),
      }),
    } as unknown as DB;

    await assert.rejects(() => ensureSchoolPqMaterial(school, fakeDb));
  });
});

describe("ensureSchoolPqMaterial — the minted certificate actually verifies", () => {
  it("issueSchoolCertificatePq binds a certificate that mlDsaVerify accepts against the root", async () => {
    const school = baseSchool();
    let publicKeyPq: string | undefined;
    let certificatePq: string | undefined;

    const fakeDb = {
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              publicKeyPq = v.publicKeyPq as string;
              certificatePq = v.certificatePq as string;
              return Promise.resolve([{ id: SCHOOL_ID }]);
            },
          }),
        }),
      }),
    } as unknown as DB;

    await ensureSchoolPqMaterial(school, fakeDb);
    assert.ok(publicKeyPq && certificatePq);

    const { certifychainRootPqPublicKeyB64 } = await import("../../../src/crypto/keys");
    const { canonicalize } = await import("../../../src/crypto/hashing");
    // Same `issuedAt` verify.routes.ts would reconstruct: schoolRow.approvedAt,
    // NOT "today" — this is exactly the bug ensureSchoolPqMaterial must avoid.
    const message = canonicalize({
      schoolId: SCHOOL_ID,
      publicKey: publicKeyPq,
      name: school.name,
      issuedAt: APPROVED_AT.toISOString().slice(0, 10),
    });
    const ok = mlDsaVerify(
      Buffer.from(certifychainRootPqPublicKeyB64(), "base64"),
      Buffer.from(message, "utf8"),
      Buffer.from(certificatePq as string, "base64"),
    );
    assert.equal(ok, true);
  });
});
