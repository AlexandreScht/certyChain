import { desc, eq } from "drizzle-orm";
import { importJWK, type JWK, type KeyLike } from "jose";
import { keyVault } from "../../crypto";
import { db } from "../../db/client";
import { vcIssuerKeys } from "../../db/schema";

export interface VcIssuerKey {
  kid: string;
  publicJwk: JWK;
  privateKey: KeyLike | Uint8Array;
}

function isP256PublicJwk(value: unknown): value is JWK {
  if (!value || typeof value !== "object") return false;
  const jwk = value as Record<string, unknown>;
  return (
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    typeof jwk.x === "string" &&
    jwk.x.length > 0 &&
    typeof jwk.y === "string" &&
    jwk.y.length > 0 &&
    (jwk.alg === undefined || jwk.alg === "ES256") &&
    (jwk.use === undefined || jwk.use === "sig") &&
    jwk.d === undefined
  );
}

function parsePrivateJwk(ciphertext: string, publicJwk: JWK): JWK {
  const parsed = JSON.parse(keyVault.decryptToString(ciphertext)) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid encrypted VC issuer key");
  const jwk = parsed as Record<string, unknown>;
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    typeof jwk.d !== "string" ||
    jwk.x !== publicJwk.x ||
    jwk.y !== publicJwk.y
  ) {
    throw new Error("Invalid or mismatched VC issuer private key");
  }
  return parsed as JWK;
}

async function materializeIssuerKey(
  row: typeof vcIssuerKeys.$inferSelect,
): Promise<VcIssuerKey> {
  if (!isP256PublicJwk(row.publicJwk)) throw new Error("Invalid VC issuer public JWK");
  const privateJwk = parsePrivateJwk(row.privateKeyEncrypted, row.publicJwk);
  return {
    kid: row.kid,
    publicJwk: { ...row.publicJwk, kid: row.kid, alg: "ES256", use: "sig" },
    privateKey: await importJWK(privateJwk, "ES256"),
  };
}

export async function loadActiveIssuerKey(): Promise<VcIssuerKey | null> {
  const [row] = await db
    .select()
    .from(vcIssuerKeys)
    .where(eq(vcIssuerKeys.status, "active"))
    .orderBy(desc(vcIssuerKeys.createdAt))
    .limit(1);
  return row ? materializeIssuerKey(row) : null;
}

/**
 * Status lists must remain signable after issuance is disabled. A retired-key
 * fallback also prevents a transient JWKS outage during an operational rotation.
 */
export async function loadStatusIssuerKey(): Promise<VcIssuerKey | null> {
  const active = await loadActiveIssuerKey();
  if (active) return active;
  const [retired] = await db
    .select()
    .from(vcIssuerKeys)
    .where(eq(vcIssuerKeys.status, "retired"))
    .orderBy(desc(vcIssuerKeys.createdAt))
    .limit(1);
  return retired ? materializeIssuerKey(retired) : null;
}

export async function listIssuerPublicJwks(): Promise<JWK[]> {
  const rows = await db
    .select({ kid: vcIssuerKeys.kid, publicJwk: vcIssuerKeys.publicJwk })
    .from(vcIssuerKeys)
    .orderBy(desc(vcIssuerKeys.createdAt));
  return rows.map((row) => {
    if (!isP256PublicJwk(row.publicJwk)) throw new Error("Invalid VC issuer public JWK");
    return { ...row.publicJwk, kid: row.kid, alg: "ES256", use: "sig" };
  });
}

export function isHolderP256Jwk(value: unknown): value is JWK {
  return isP256PublicJwk(value);
}
