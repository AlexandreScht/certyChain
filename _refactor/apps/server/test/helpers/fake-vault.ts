/**
 * In-memory HashiCorp Vault Transit test double.
 *
 * Implements the three endpoints `KmsSigner` speaks to — `POST keys/{name}`,
 * `GET keys/{name}`, `POST sign/{name}` — with real `node:crypto` Ed25519 keys and
 * responses shaped exactly like Vault's. Injected as `fetchImpl`, it exercises the
 * REAL client (no mocking of the class) end-to-end without a network or a running
 * Vault. It also enforces the `X-Vault-Token` header so the auth path is covered.
 */
import { createPrivateKey, generateKeyPairSync, sign as nodeSign } from "node:crypto";

export interface FakeVaultKey {
  privateKeyPem: string; // PKCS8 PEM
  rawPublicKey: Buffer; // 32-byte raw Ed25519 public key
}

export interface FakeVaultTransit {
  fetchImpl: typeof globalThis.fetch;
  keys: Map<string, FakeVaultKey>;
}

export function createFakeVaultTransit(
  options: { token?: string; mount?: string } = {},
): FakeVaultTransit {
  const token = options.token ?? "test-vault-token";
  const mount = options.mount ?? "transit";
  const keys = new Map<string, FakeVaultKey>();

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? {});

    // Vault refuses any request lacking a valid token (403 permission denied).
    if (headers.get("X-Vault-Token") !== token) {
      return json(403, { errors: ["permission denied"] });
    }

    const { pathname } = new URL(url);
    const prefix = `/v1/${mount}/`;
    if (!pathname.startsWith(prefix)) return json(404, { errors: ["unsupported path"] });
    const rest = pathname.slice(prefix.length);

    // POST keys/{name} — provision an Ed25519 key (idempotent; Vault answers 204).
    if (method === "POST" && rest.startsWith("keys/")) {
      const name = rest.slice("keys/".length);
      if (!keys.has(name)) {
        const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
          publicKeyEncoding: { type: "spki", format: "der" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        keys.set(name, {
          privateKeyPem: privateKey,
          rawPublicKey: Buffer.from(publicKey.subarray(-32)),
        });
      }
      return new Response(null, { status: 204 });
    }

    // GET keys/{name} — read the public half in Vault's `data.keys["1"]` shape.
    if (method === "GET" && rest.startsWith("keys/")) {
      const key = keys.get(rest.slice("keys/".length));
      if (!key) return json(404, { errors: [] });
      return json(200, {
        data: {
          type: "ed25519",
          keys: { "1": { name: "ed25519", public_key: key.rawPublicKey.toString("base64") } },
        },
      });
    }

    // POST sign/{name} — sign the raw input bytes (Ed25519 is pure, no prehash).
    if (method === "POST" && rest.startsWith("sign/")) {
      const key = keys.get(rest.slice("sign/".length));
      if (!key) return json(404, { errors: ["encryption key not found"] });
      const body = init?.body ? (JSON.parse(String(init.body)) as { input?: string }) : {};
      const data = Buffer.from(body.input ?? "", "base64");
      const sig = nodeSign(null, data, createPrivateKey(key.privateKeyPem)).toString("base64");
      return json(200, { data: { signature: `vault:v1:${sig}`, key_version: 1 } });
    }

    return json(404, { errors: ["unsupported operation"] });
  };

  return { fetchImpl, keys };
}
