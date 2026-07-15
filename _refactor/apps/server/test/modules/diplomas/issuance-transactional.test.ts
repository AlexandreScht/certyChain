/**
 * Issuance transactionality (v2.md §V3-7) WITHOUT a database. The transaction
 * runner of `issueDiploma` is the injected seam (`deps.db`, default = real db). A
 * fake tx records the operations and THROWS on the `issuance_log` insert; the test
 * asserts the error propagates and that the diploma insert lived in the SAME
 * transaction — so a log failure abandons the diploma with the rollback (design D2:
 * "échec du log ⇒ le diplôme n'existe pas").
 *
 * Everything before the transaction is REAL (signer resolution, Ed25519 signing,
 * SD-v2 emission) using a genuine envelope-encrypted key, so only the DB is faked.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CreateDiplomaInput } from "@certifychain/contract/schemas";
import { keyVault } from "../../../src/crypto/envelope";
import { generateEd25519KeyPair } from "../../../src/crypto/keys";
import type { DB } from "../../../src/db/client";
import { diplomas, issuanceLog, students, studentEmailAliases } from "../../../src/db/schema";
import { issueDiploma } from "../../../src/modules/diplomas/diplomas.service";

const SCHOOL_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";

const INPUT: CreateDiplomaInput = {
  holderName: "Titulaire Tx",
  holderEmail: "titulaire.tx@example.com",
  programTitle: "Programme Transactionnel",
  issuedAt: "2026-07-15",
};

function tableName(table: unknown): string {
  if (table === students) return "students";
  if (table === studentEmailAliases) return "student_email_aliases";
  if (table === diplomas) return "diplomas";
  if (table === issuanceLog) return "issuance_log";
  return "unknown";
}

/** A real, approved envelope school so the pre-transaction signing path works. */
function makeSchool(): Record<string, unknown> {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  return {
    id: SCHOOL_ID,
    name: "École Tx Test",
    status: "approved",
    publicKey,
    encryptedPrivateKey: keyVault.encrypt(privateKey),
    signerKind: "envelope",
    signerRef: null,
    issuanceFrozenAt: null,
  };
}

describe("issueDiploma — transactionnalité du journal (sans DB)", () => {
  it("rolls the diploma back when the issuance_log insert fails (same transaction)", async () => {
    const school = makeSchool();
    const calls: string[] = [];

    /** Thenable node that resolves an array based on which table `.from()` saw. */
    function selectNode(): Record<string, unknown> {
      let table: unknown;
      const node: Record<string, unknown> = {
        from: (t: unknown) => {
          table = t;
          return node;
        },
        where: () => node,
        limit: () => node,
        innerJoin: () => node,
        orderBy: () => node,
        offset: () => node,
        then: (resolve: (v: unknown) => void) =>
          // MAX(leaf_index) query → [{ next }]; the alias lookup → [] (create branch).
          resolve(table === issuanceLog ? [{ next: 0 }] : []),
      };
      return node;
    }

    function insertNode(table: unknown): Record<string, unknown> {
      return {
        values: () => {
          calls.push(`insert:${tableName(table)}`);
          const failLog = table === issuanceLog;
          const rows = (): unknown[] => {
            if (table === students) return [{ id: STUDENT_ID }];
            if (table === studentEmailAliases) return [{ id: "alias", claimToken: "tok" }];
            if (table === diplomas) return [{ id: "diploma" }];
            return [];
          };
          const settle = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            failLog ? reject(new Error("forced issuance_log insert failure")) : resolve(rows());
          return {
            returning: () => ({ then: settle }),
            then: settle, // log insert is awaited WITHOUT .returning()
          };
        },
      };
    }

    const fakeTx = {
      select: () => selectNode(),
      insert: (table: unknown) => insertNode(table),
      execute: async () => {
        calls.push("execute");
        return [];
      },
    };

    const fakeDb = {
      // Pre-transaction school lookup resolves the real envelope school.
      select: () => ({
        from: () => ({ where: () => ({ limit: () => ({ then: (r: (v: unknown) => void) => r([school]) }) }) }),
      }),
      transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx),
    };

    await assert.rejects(
      () => issueDiploma(SCHOOL_ID, INPUT, { db: fakeDb as unknown as DB }),
      /issuance_log insert failure/,
    );

    // The diploma AND the log insert were both attempted, in that order, inside the
    // one transaction — so the failed log insert rolls the diploma back with it.
    assert.ok(calls.includes("insert:diplomas"), "diploma insert attempted");
    assert.ok(calls.includes("insert:issuance_log"), "issuance_log insert attempted");
    assert.ok(
      calls.indexOf("insert:diplomas") < calls.indexOf("insert:issuance_log"),
      "diploma insert precedes the log insert in the same tx",
    );
    // The retry-on-unique-violation path is NOT taken (the failure is not 23505).
    assert.equal(calls.filter((c) => c === "insert:diplomas").length, 1);
  });
});
