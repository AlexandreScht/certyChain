import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { exportJWK, generateKeyPair } from "jose";
import { keyVault } from "../../crypto/envelope";
import { db } from "../../db/client";
import { vcIssuerKeys } from "../../db/schema";

const ES256 = "ES256" as const;
const ACTIVE = "active" as const;
const RETIRED = "retired" as const;

export interface ProvisionVcIssuerKeyOptions {
  /** Retire the current key and create a new active key atomically. */
  rotate?: boolean;
  /** Return the existing active key instead of treating it as an error. */
  ifAbsent?: boolean;
}

export interface ProvisionedVcIssuerKey {
  id: string;
  kid: string;
  createdAt: Date;
  created: boolean;
}

function issuerKid(now = new Date()): string {
  const month = now.toISOString().slice(0, 7);
  // The random suffix permits two intentional rotations within one month while
  // keeping the human-readable key epoch advertised in the JWKS.
  return `vc-${month}-${randomBytes(6).toString("hex")}`;
}

/**
 * Provision the platform ES256 issuer key under a transaction-scoped advisory
 * lock. Rotation is all-or-nothing: if key generation or insertion fails, the
 * previous key remains active.
 */
export async function provisionVcIssuerKey(
  options: ProvisionVcIssuerKeyOptions = {},
): Promise<ProvisionedVcIssuerKey> {
  const rotate = options.rotate === true;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('certifychain:vc-issuer-key'))`);

    const [existing] = await tx
      .select({
        id: vcIssuerKeys.id,
        kid: vcIssuerKeys.kid,
        createdAt: vcIssuerKeys.createdAt,
      })
      .from(vcIssuerKeys)
      .where(eq(vcIssuerKeys.status, ACTIVE))
      .limit(1);

    if (existing && !rotate) {
      if (options.ifAbsent === true) return { ...existing, created: false };
      throw new Error(
        `Une clé VC active existe déjà (${existing.kid}). Passez --rotate pour la retirer et en créer une nouvelle.`,
      );
    }

    const kid = issuerKid();
    const { publicKey, privateKey } = await generateKeyPair(ES256, { extractable: true });
    const exportedPublic = await exportJWK(publicKey);
    const exportedPrivate = await exportJWK(privateKey);

    if (!exportedPrivate.d) {
      throw new Error("La clé ES256 générée ne contient pas de composante privée");
    }

    const publicJwk: Record<string, unknown> = {
      ...exportedPublic,
      alg: ES256,
      use: "sig",
      kid,
    };
    const privateJwk = {
      ...exportedPrivate,
      alg: ES256,
      use: "sig",
      kid,
    };

    if (existing) {
      await tx
        .update(vcIssuerKeys)
        .set({ status: RETIRED })
        .where(eq(vcIssuerKeys.id, existing.id));
    }

    const [inserted] = await tx
      .insert(vcIssuerKeys)
      .values({
        kid,
        alg: ES256,
        publicJwk,
        privateKeyEncrypted: keyVault.encrypt(JSON.stringify(privateJwk)),
        status: ACTIVE,
      })
      .returning({
        id: vcIssuerKeys.id,
        kid: vcIssuerKeys.kid,
        createdAt: vcIssuerKeys.createdAt,
      });

    if (!inserted) throw new Error("La création de la clé VC n'a retourné aucune ligne");
    return { ...inserted, created: true };
  });
}

/** Idempotent seed/bootstrap helper. */
export function ensureActiveVcIssuerKey(): Promise<ProvisionedVcIssuerKey> {
  return provisionVcIssuerKey({ ifAbsent: true });
}
