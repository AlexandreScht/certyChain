import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { logger, redactLogValue, runWithRequestId } from "../../src/lib/logger";

/** Captures every `process.stdout`/`stderr` write made during `fn()`, parsed as JSON lines. */
async function captureLogLines(t: import("node:test").TestContext, fn: () => Promise<void> | void): Promise<Record<string, unknown>[]> {
  const lines: string[] = [];
  const record = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  t.mock.method(process.stdout, "write", record);
  t.mock.method(process.stderr, "write", record);
  await fn();
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

const REDACTED = "[redacted]";

describe("redactLogValue", () => {
  it("redacts CDC identity fields in camelCase and snake_case recursively", () => {
    const input = {
      nested: {
        // Redaction does not need a structurally valid NIR: never put a plausible
        // real-world identifier in a source fixture.
        nir: "synthetic-nir-value",
        nirEncrypted: "v1.camel",
        nir_encrypted: "v1.snake",
        birthLastName: "DUPONT",
        birth_last_name: "MARTIN",
        firstNames: "Alice Jeanne",
        first_names: "Bob Jules",
        birthDate: "1984-12-01",
        birth_date: "1985-01-02",
      },
    };

    const output = redactLogValue(input) as {
      nested: Record<string, unknown>;
    };

    for (const key of Object.keys(input.nested)) {
      assert.equal(output.nested[key], REDACTED, key);
    }
    // Redaction returns a copy and never overwrites application data.
    assert.equal(input.nested.nir, "synthetic-nir-value");
  });

  it("redacts OAuth/OID4VCI secrets for protocol, camel and snake spellings", () => {
    const output = redactLogValue({
      "pre-authorized_code": "protocol-code",
      preAuthCode: "camel-code",
      pre_auth_code_hash: "hash",
      txCode: "12345",
      tx_code: "67890",
      accessToken: "jwt.camel",
      access_token: "jwt.snake",
      proof: "proof.jwt",
      proofs: { jwt: ["proof.jwt.2"] },
      offerPayload: { grants: "secret" },
      offer_payload_encrypted: "v1.offer",
    }) as Record<string, unknown>;

    for (const key of Object.keys(output)) {
      assert.equal(output[key], REDACTED, key);
    }
  });

  it("redacts private key/JWK variants while preserving safe public fields", () => {
    const output = redactLogValue({
      privateKey: "pem",
      private_key_encrypted: "v1.key",
      encryptedPrivateKey: "v1.legacy",
      privateJwk: { d: "secret" },
      private_jwk: { d: "secret-2" },
      publicJwk: { kty: "EC", crv: "P-256", x: "public-x", y: "public-y" },
      count: 2,
    }) as Record<string, unknown>;

    assert.equal(output.privateKey, REDACTED);
    assert.equal(output.private_key_encrypted, REDACTED);
    assert.equal(output.encryptedPrivateKey, REDACTED);
    assert.equal(output.privateJwk, REDACTED);
    assert.equal(output.private_jwk, REDACTED);
    assert.deepEqual(output.publicJwk, {
      kty: "EC",
      crv: "P-256",
      x: "public-x",
      y: "public-y",
    });
    assert.equal(output.count, 2);
  });

  it("handles arrays, cycles and excessive depth without exposing raw objects", () => {
    const circular: Record<string, unknown> = { safe: true };
    circular.self = circular;

    let deep: Record<string, unknown> = { nir: "must-not-leak" };
    for (let i = 0; i < 12; i += 1) deep = { child: deep };

    const output = redactLogValue({ items: [{ tx_code: "12345" }], circular, deep });
    const serialized = JSON.stringify(output);

    assert.doesNotMatch(serialized, /12345|must-not-leak/);
    assert.match(serialized, /\[redacted\]/);
    assert.match(serialized, /\[circular\]/);
    assert.match(serialized, /\[truncated\]/);
  });
});

/**
 * Request-id propagation (🟢, docs/architecture.md §12.2). `LOG_LEVEL`
 * gating with a NON-default value needs its own isolated process (piège
 * n°11 — env frozen at first import), see `logger-log-level.test.ts`; this
 * ambient process's default (`LOG_LEVEL` unset, `NODE_ENV` not "production")
 * resolves to "debug", so every level below is actually emitted.
 */
describe("logger — propagation du request-id (AsyncLocalStorage)", () => {
  it("un appel logger.* fait DANS runWithRequestId porte le champ `id`, MÊME sans le passer explicitement", async (t) => {
    const lines = await captureLogLines(t, async () => {
      await runWithRequestId("req-abc-123", async () => {
        logger.info("some.event", { extra: "value" });
      });
    });

    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.id, "req-abc-123");
    assert.equal(lines[0]?.extra, "value");
  });

  it("survit à un `await` intercalé (asynchrone, pas juste synchrone)", async (t) => {
    // Micro-tâche (pas un vrai timer) : suffit à prouver que l'ALS traverse un
    // VRAI point de suspension async/await, sans laisser le runner de tests
    // intercaler sa propre sortie stdout pendant la fenêtre de mock (un vrai
    // `setTimeout` cède la main à la boucle d'évènements — donc potentiellement
    // au reporter TAP du runner lui-même, qui écrit sur CE MÊME stdout mocké).
    const lines = await captureLogLines(t, async () => {
      await runWithRequestId("req-async-456", async () => {
        await Promise.resolve();
        logger.warn("after.await");
      });
    });

    assert.equal(lines[0]?.id, "req-async-456");
  });

  it("un champ `id` EXPLICITE (les 2 sites d'appel existants) reste prioritaire sur l'auto-remplissage", async (t) => {
    const lines = await captureLogLines(t, async () => {
      await runWithRequestId("ambient-id", async () => {
        logger.error("http.unhandled", { id: "explicit-id-from-caller" });
      });
    });

    assert.equal(lines[0]?.id, "explicit-id-from-caller");
  });

  it("hors de tout runWithRequestId : aucun champ `id` n'est ajouté (pas de contexte ambiant)", async (t) => {
    const lines = await captureLogLines(t, () => {
      logger.info("no.request.context");
    });

    assert.equal(lines[0]?.id, undefined);
  });

  it("deux requêtes concurrentes ne mélangent JAMAIS leur id (isolation par contexte async)", async (t) => {
    // Interleaving via des micro-tâches (`Promise.resolve()`), pas de vrais
    // timers — même motif que le test précédent (évite de laisser le runner
    // de tests intercaler sa propre sortie stdout pendant la fenêtre de mock).
    const lines = await captureLogLines(t, async () => {
      await Promise.all([
        runWithRequestId("req-A", async () => {
          await Promise.resolve();
          await Promise.resolve();
          logger.info("concurrent.event", { who: "A" });
        }),
        runWithRequestId("req-B", async () => {
          await Promise.resolve();
          logger.info("concurrent.event", { who: "B" });
        }),
      ]);
    });

    const byWho = Object.fromEntries(lines.map((l) => [l.who as string, l.id]));
    assert.equal(byWho.A, "req-A");
    assert.equal(byWho.B, "req-B");
  });
});
