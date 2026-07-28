import { mlDsaKeygen, mlDsaSign } from "@certifychain/shared/crypto/ml-dsa";
import { env } from "../config/env";
import { keyVault } from "./envelope";
import { generateEd25519KeyPair, signEd25519 } from "./keys";

/**
 * Signer — the seam that keeps school PRIVATE keys out of every caller (v2.md §V2-1).
 *
 * Before this seam, `schools.service` / `diplomas.service` decrypted the PKCS8 PEM
 * and signed inline, so a plaintext private key crossed module boundaries. Here the
 * key material never leaves the module: a caller only ever holds an OPAQUE `ref`
 * (an envelope-encrypted blob, or a KMS key name) and calls `sign(ref, bytes)`.
 *
 * Two backends coexist PER SCHOOL (`schools.signer_kind`), never globally — so a
 * future switch to a KMS only affects schools approved AFTER the switch and needs
 * no data migration:
 *   - `EnvelopeSigner` — behaviour identical to before (AES-256-GCM blob at rest);
 *   - `KmsSigner` — HashiCorp Vault Transit (Ed25519), keys never leave the vault.
 */
export type SignerKind = "envelope" | "kms";

export interface Signer {
  readonly kind: SignerKind;
  /** Creates the school's key pair. Returns the public key (SPKI PEM) plus an opaque
   *  reference (encrypted PKCS8 blob for envelope; Vault Transit key name for kms) —
   *  stored verbatim in `schools.signer_ref`. */
  createSchoolKey(schoolId: string): Promise<{ publicKeyPem: string; ref: string }>;
  /** Signs raw bytes. The private key NEVER reaches the caller. */
  sign(ref: string, data: Buffer): Promise<string>; // base64
}

/* ── EnvelopeSigner (default) — AES-256-GCM blob at rest, unchanged behaviour ── */

class EnvelopeSigner implements Signer {
  readonly kind = "envelope" as const;

  async createSchoolKey(_schoolId: string): Promise<{ publicKeyPem: string; ref: string }> {
    const { publicKey, privateKey } = generateEd25519KeyPair();
    // `ref` is the exact blob previously stored in `schools.encrypted_private_key`,
    // so envelope schools keep the same storage format (zero data migration).
    return { publicKeyPem: publicKey, ref: keyVault.encrypt(privateKey) };
  }

  async sign(ref: string, data: Buffer): Promise<string> {
    // The PKCS8 PEM is decrypted LOCALLY here and never returned — this is the whole
    // point of the seam. `signEd25519` returns standard base64.
    const privateKeyPem = keyVault.decryptToString(ref);
    return signEd25519(privateKeyPem, data);
  }
}

/** Process-wide singleton — the envelope signer is stateless (master key in env). */
export const envelopeSigner: Signer = new EnvelopeSigner();

/* ── PqSigner — the school's ML-DSA-65 (post-quantum) key, ALWAYS envelope ───
 *
 * A SEPARATE seam from `Signer` (v2.md §V4-1), not a variant of it: a school's
 * classical (Ed25519) key and its post-quantum (ML-DSA-65) key can each be
 * `envelope` or, for Ed25519 only, `kms` — but quasi no managed KMS signs
 * ML-DSA today, so the PQ key stays in `EnvelopeSigner`-style storage
 * REGARDLESS of `schools.signer_kind` (v2.md §V4-2). This is an accepted,
 * explicit asymmetry (see ADR-0006): the two keys of a hybrid signature do NOT
 * share a custody model, and the hybrid "AND" verification rule means the
 * diploma's overall security is that of its BETTER-guarded key, not its worse.
 * The private key never leaves this module — same contract as `Signer`. */
export interface PqSigner {
  /** Creates the school's ML-DSA-65 key pair. Returns the raw public key
   *  (base64 — ML-DSA has no PEM/SPKI convention) + an opaque envelope
   *  reference, stored verbatim in `schools.signer_ref_pq`. */
  createSchoolPqKey(schoolId: string): Promise<{ publicKeyB64: string; ref: string }>;
  /** Signs raw bytes with ML-DSA-65. The secret key NEVER reaches the caller. */
  signPq(ref: string, data: Buffer): Promise<string>; // base64
}

class EnvelopePqSigner implements PqSigner {
  async createSchoolPqKey(_schoolId: string): Promise<{ publicKeyB64: string; ref: string }> {
    const { publicKey, secretKey } = mlDsaKeygen();
    return {
      publicKeyB64: Buffer.from(publicKey).toString("base64"),
      ref: keyVault.encrypt(Buffer.from(secretKey)),
    };
  }

  async signPq(ref: string, data: Buffer): Promise<string> {
    // The raw ML-DSA-65 secret key is decrypted LOCALLY and never returned.
    const secretKey = keyVault.decrypt(ref);
    return Buffer.from(mlDsaSign(secretKey, data)).toString("base64");
  }
}

/** Process-wide singleton — stateless, same custody model for every school's
 *  PQ key regardless of that school's Ed25519 `signer_kind`. */
export const envelopePqSigner: PqSigner = new EnvelopePqSigner();

/* ── KmsSigner — HashiCorp Vault Transit over pure fetch (no SDK: distroless) ── */

export interface KmsSignerOptions {
  addr?: string;
  token?: string;
  mount?: string;
  keyPrefix?: string;
  /** Injected in tests so the real client is exercised without a live Vault. */
  fetchImpl?: typeof globalThis.fetch;
}

/** The `keys` map of a Transit key-read response (`GET {mount}/keys/{name}`). */
interface VaultKeyReadResponse {
  data?: { keys?: Record<string, { public_key?: string } | undefined> };
}
/** The body of a Transit sign response (`POST {mount}/sign/{name}`). */
interface VaultSignResponse {
  data?: { signature?: string };
}

const VAULT_SIGNATURE_PREFIX = "vault:v1:";

/**
 * HashiCorp Vault Transit is the only mainstream managed-KMS option that signs in
 * Ed25519 (v2.md §V2-0) — no curve migration, self-hostable. No SDK is used: the
 * distroless runtime forbids it, and the Transit HTTP API is three endpoints.
 *
 * ⚠️ Every `sign()` is a network round-trip. CSV import issues diplomas
 * SEQUENTIALLY, so the day a KMS is wired in a bulk import costs ≈ RTT × rows —
 * batch / bound the concurrency at that point (v2.md §V2-1 ⚠️). Nothing to do
 * while `SIGNER_KIND=envelope`.
 */
export class KmsSigner implements Signer {
  readonly kind = "kms" as const;
  readonly #addr: string;
  readonly #token: string;
  readonly #mount: string;
  readonly #keyPrefix: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(opts: KmsSignerOptions = {}) {
    // Strip any trailing slash so `${addr}/v1/...` never doubles up.
    this.#addr = (opts.addr ?? env.VAULT_ADDR).replace(/\/+$/, "");
    this.#token = opts.token ?? env.VAULT_TOKEN;
    this.#mount = opts.mount ?? env.VAULT_TRANSIT_MOUNT;
    this.#keyPrefix = opts.keyPrefix ?? env.VAULT_KEY_PREFIX;
    this.#fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  async createSchoolKey(schoolId: string): Promise<{ publicKeyPem: string; ref: string }> {
    const name = `${this.#keyPrefix}-${schoolId}`;
    // 1) Provision the Ed25519 key (Vault returns 204; idempotent server-side).
    await this.#request("POST", `keys/${name}`, { type: "ed25519" });
    // 2) Read its public half — a raw 32-byte Ed25519 key, base64-encoded.
    const read = (await this.#request("GET", `keys/${name}`)) as VaultKeyReadResponse;
    const rawB64 = read.data?.keys?.["1"]?.public_key;
    if (typeof rawB64 !== "string" || rawB64.length === 0) {
      throw new Error(`Vault Transit key "${name}" returned no public key`);
    }
    return { publicKeyPem: rawEd25519PublicKeyToSpkiPem(Buffer.from(rawB64, "base64")), ref: name };
  }

  async sign(ref: string, data: Buffer): Promise<string> {
    const res = (await this.#request("POST", `sign/${ref}`, {
      input: data.toString("base64"),
    })) as VaultSignResponse;
    const signature = res.data?.signature;
    if (typeof signature !== "string" || !signature.startsWith(VAULT_SIGNATURE_PREFIX)) {
      throw new Error("Vault Transit returned an unexpected signature format");
    }
    // "vault:v1:<base64>" → the last segment is standard base64 (never contains ':').
    return signature.slice(VAULT_SIGNATURE_PREFIX.length);
  }

  async #request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const url = `${this.#addr}/v1/${this.#mount}/${path}`;
    const res = await this.#fetch(url, {
      method,
      headers: {
        "X-Vault-Token": this.#token,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      // Surface Vault's own `errors` array when present. NEVER echo the token or
      // any body we sent — only the status, the operation, and Vault's message.
      let detail = "";
      try {
        const parsed = (await res.json()) as { errors?: unknown };
        if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
          detail = `: ${parsed.errors.map(String).join("; ")}`;
        }
      } catch {
        /* non-JSON error body — the status code alone is enough */
      }
      throw new Error(`Vault Transit ${method} ${this.#mount}/${path} failed (${res.status})${detail}`);
    }
    // Key creation answers 204 No Content — nothing to parse.
    if (res.status === 204) return undefined;
    return res.json();
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** DER prefix of an Ed25519 SubjectPublicKeyInfo: SEQUENCE → alg id (OID 1.3.101.112)
 *  → BIT STRING(33, 0 unused). The 32-byte raw key follows, for 44 bytes total. */
const ED25519_SPKI_DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Wraps a raw 32-byte Ed25519 public key (as Vault Transit returns it) into the
 * SPKI PEM that `verifyEd25519` / `createPublicKey` expect. Byte-for-byte identical
 * to Node's own SPKI PEM export (44-byte DER → 60 base64 chars → single line).
 */
export function rawEd25519PublicKeyToSpkiPem(raw: Buffer): string {
  if (raw.length !== 32) {
    throw new Error(`Ed25519 raw public key must be 32 bytes (got ${raw.length})`);
  }
  const der = Buffer.concat([ED25519_SPKI_DER_PREFIX, raw]);
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/* ── Resolution ───────────────────────────────────────────────────────────── */

let kmsSigner: KmsSigner | null = null;

/**
 * Resolves the signer for the CURRENT deployment default (`env.SIGNER_KIND`) — used
 * when MINTING a school's key. Mirrors `engineFor` (proof-engine): the kms instance
 * is built lazily, never at import, since Vault may be unconfigured while the default
 * is envelope.
 */
export function signerFor(kind: SignerKind): Signer {
  if (kind === "kms") return (kmsSigner ??= new KmsSigner());
  return envelopeSigner;
}

/**
 * Resolves the signer for an EXISTING school row (kinds coexist row-by-row). Returns
 * the signer plus the `ref` its `sign()` expects, or `null` when the school holds no
 * usable key material — callers treat `null` exactly like "school not approved".
 *
 *   - envelope: prefer `signerRef`, fall back to the legacy `encryptedPrivateKey`
 *     (schools approved before V2 never had `signer_ref` — zero backfill);
 *   - kms: the `signerRef` key name is mandatory (DB CHECK enforces it too);
 *   - unknown kind or missing ref → `null`.
 */
export function resolveSchoolSigner(school: {
  signerKind: string;
  signerRef: string | null;
  encryptedPrivateKey: string | null;
}): { signer: Signer; ref: string } | null {
  if (school.signerKind === "envelope") {
    const ref = school.signerRef ?? school.encryptedPrivateKey;
    return ref ? { signer: envelopeSigner, ref } : null;
  }
  if (school.signerKind === "kms") {
    return school.signerRef ? { signer: signerFor("kms"), ref: school.signerRef } : null;
  }
  return null;
}
