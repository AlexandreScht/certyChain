import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import type { EudiOfferDTO } from "@certifychain/contract/dto";
import { VC } from "../../config/constants";
import { env } from "../../config/env";
import { keyVault, sha256Hex } from "../../crypto";
import { db } from "../../db/client";
import { diplomas, schools, vcCredentials, vcOffers } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { numericCode, urlToken, uuid } from "../../lib/ids";
import { hashOtp, verifyOtp } from "../../lib/otp";
import { recordAudit } from "../audit/audit.service";
import {
  VC_CREDENTIAL_CONFIGURATION_ID,
  VC_ISSUER,
  VC_PRE_AUTHORIZED_GRANT,
} from "./issuer";
import { loadActiveIssuerKey } from "./keys";
import { loadStatusIssuerKey } from "./keys";
import { VcProtocolError } from "./protocol";
import { verifyHolderProof } from "./proof";
import { buildSdJwtVc } from "./sd-jwt";
import {
  buildStatusListToken,
  pickRandomStatusListIndex,
  statusListCapacity,
} from "./status-list";
import { signVcAccessToken, verifyVcAccessToken } from "./tokens";

interface CredentialOffer {
  credential_issuer: string;
  credential_configuration_ids: string[];
  grants: {
    [VC_PRE_AUTHORIZED_GRANT]: {
      "pre-authorized_code": string;
      tx_code: {
        input_mode: "numeric";
        length: number;
        description: string;
      };
    };
  };
}

interface EncryptedCredentialOfferEnvelope {
  v: 1;
  offerId: string;
  offer: CredentialOffer;
}

export interface VcTokenInput {
  grantType: string;
  preAuthorizedCode: string;
  txCode: string;
}

export interface VcTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface VcCredentialResponse {
  credentials: Array<{ credential: string }>;
}

interface CredentialRequest {
  credential_configuration_id: typeof VC_CREDENTIAL_CONFIGURATION_ID;
  proof: string;
}

function parseCredentialRequest(value: unknown): CredentialRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VcProtocolError("invalid_credential_request");
  }
  const request = value as Record<string, unknown>;
  if (request.credential_response_encryption !== undefined) {
    throw new VcProtocolError("invalid_encryption_parameters");
  }
  if (request.credential_identifier !== undefined) {
    throw new VcProtocolError("unknown_credential_identifier");
  }
  if (typeof request.credential_configuration_id !== "string") {
    throw new VcProtocolError("invalid_credential_request");
  }
  if (request.credential_configuration_id !== VC_CREDENTIAL_CONFIGURATION_ID) {
    throw new VcProtocolError("unknown_credential_configuration");
  }
  const proofs = request.proofs;
  if (!proofs || typeof proofs !== "object" || Array.isArray(proofs)) {
    throw new VcProtocolError("invalid_proof");
  }
  const jwtProofs = (proofs as Record<string, unknown>).jwt;
  if (
    !Array.isArray(jwtProofs) ||
    jwtProofs.length !== 1 ||
    typeof jwtProofs[0] !== "string"
  ) {
    throw new VcProtocolError("invalid_proof");
  }
  return {
    credential_configuration_id: VC_CREDENTIAL_CONFIGURATION_ID,
    proof: jwtProofs[0],
  };
}

async function offerIdFromAuthorization(authorization: string | undefined): Promise<string> {
  const match = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(authorization ?? "");
  if (!match?.[1]) throw new VcProtocolError("invalid_token", 401);
  try {
    return await verifyVcAccessToken(match[1]);
  } catch {
    throw new VcProtocolError("invalid_token", 401);
  }
}

function isCredentialOffer(value: unknown): value is CredentialOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as Record<string, unknown>;
  const ids = offer.credential_configuration_ids;
  const grants = offer.grants;
  if (
    offer.credential_issuer !== VC_ISSUER ||
    !Array.isArray(ids) ||
    ids.length !== 1 ||
    ids[0] !== VC_CREDENTIAL_CONFIGURATION_ID ||
    !grants ||
    typeof grants !== "object"
  ) {
    return false;
  }
  const grant = (grants as Record<string, unknown>)[VC_PRE_AUTHORIZED_GRANT];
  if (!grant || typeof grant !== "object") return false;
  const record = grant as Record<string, unknown>;
  return (
    typeof record["pre-authorized_code"] === "string" &&
    record.tx_code !== null &&
    typeof record.tx_code === "object"
  );
}

export async function vcIssuanceAvailable(): Promise<boolean> {
  if (!env.vcExportEnabled) return false;
  try {
    return (await loadActiveIssuerKey()) !== null;
  } catch {
    return false;
  }
}

export async function createEudiOffer(
  diplomaId: string,
  studentId: string,
): Promise<EudiOfferDTO> {
  if (!(await vcIssuanceAvailable())) throw fail.notFound("Export EUDI indisponible");

  const [row] = await db
    .select({
      diplomaId: diplomas.id,
      diplomaStatus: diplomas.status,
      schoolId: schools.id,
      schoolStatus: schools.status,
      schoolSiret: schools.siret,
    })
    .from(diplomas)
    .innerJoin(schools, eq(schools.id, diplomas.schoolId))
    .where(and(eq(diplomas.id, diplomaId), eq(diplomas.studentId, studentId)))
    .limit(1);
  if (!row) throw fail.notFound("Diplôme introuvable");
  if (
    row.diplomaStatus !== "active" ||
    row.schoolStatus !== "approved" ||
    !row.schoolSiret ||
    !/^\d{14}$/.test(row.schoolSiret)
  ) {
    throw fail.forbidden("Ce diplôme ne peut pas être exporté vers un portefeuille EUDI");
  }

  const id = uuid();
  const preAuthorizedCode = urlToken(32);
  const txCode = numericCode(VC.TX_CODE_LEN);
  const expiresAt = new Date(Date.now() + VC.OFFER_TTL_SEC * 1000);
  const offer: CredentialOffer = {
    credential_issuer: VC_ISSUER,
    credential_configuration_ids: [VC_CREDENTIAL_CONFIGURATION_ID],
    grants: {
      [VC_PRE_AUTHORIZED_GRANT]: {
        "pre-authorized_code": preAuthorizedCode,
        tx_code: {
          input_mode: "numeric",
          length: VC.TX_CODE_LEN,
          description: "Code affiché dans votre espace CertifyChain",
        },
      },
    },
  };

  await db.insert(vcOffers).values({
    id,
    diplomaId,
    studentId,
    preAuthCodeHash: sha256Hex(preAuthorizedCode),
    txCodeHash: hashOtp(txCode),
    offerPayloadEncrypted: keyVault.encrypt(
      JSON.stringify({ v: 1, offerId: id, offer } satisfies EncryptedCredentialOfferEnvelope),
    ),
    expiresAt,
  });
  await recordAudit({
    type: "vc_offer_created",
    schoolId: row.schoolId,
    diplomaId,
    metadata: { offerId: id },
  });

  const offerUri = `${VC_ISSUER}/vc/offers/${id}`;
  return {
    offerDeepLink:
      "openid-credential-offer://?credential_offer_uri=" + encodeURIComponent(offerUri),
    txCode,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getCredentialOffer(id: string): Promise<CredentialOffer | null> {
  if (!(await vcIssuanceAvailable())) return null;
  const [row] = await db
    .select({ payload: vcOffers.offerPayloadEncrypted })
    .from(vcOffers)
    .where(
      and(
        eq(vcOffers.id, id),
        gt(vcOffers.expiresAt, new Date()),
        isNull(vcOffers.consumedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(keyVault.decryptToString(row.payload));
  } catch {
    // Credential Offer URIs are public protocol endpoints. A damaged encrypted
    // payload is indistinguishable from an unavailable offer to a wallet and
    // must not leak the application's internal error envelope.
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const envelope = parsed as Partial<EncryptedCredentialOfferEnvelope>;
  if (envelope.v !== 1 || envelope.offerId !== id || !isCredentialOffer(envelope.offer)) {
    return null;
  }
  return envelope.offer;
}

function invalidGrant(): never {
  throw new VcProtocolError("invalid_grant");
}

export async function exchangePreAuthorizedCode(
  input: VcTokenInput,
): Promise<VcTokenResponse> {
  if (input.grantType !== VC_PRE_AUTHORIZED_GRANT) {
    throw new VcProtocolError("unsupported_grant_type");
  }
  if (
    input.preAuthorizedCode.length < 20 ||
    input.preAuthorizedCode.length > 128 ||
    !/^\d{5}$/.test(input.txCode)
  ) {
    invalidGrant();
  }

  const [offer] = await db
    .select({
      id: vcOffers.id,
      txCodeHash: vcOffers.txCodeHash,
    })
    .from(vcOffers)
    .where(
      and(
        eq(vcOffers.preAuthCodeHash, sha256Hex(input.preAuthorizedCode)),
        gt(vcOffers.expiresAt, new Date()),
        isNull(vcOffers.consumedAt),
      ),
    )
    .limit(1);
  if (!offer) invalidGrant();

  if (!verifyOtp(input.txCode, offer.txCodeHash)) {
    await db
      .update(vcOffers)
      .set({
        txAttempts: sql`${vcOffers.txAttempts} + 1`,
        consumedAt: sql`case
          when ${vcOffers.txAttempts} + 1 >= ${VC.TX_MAX_ATTEMPTS} then now()
          else ${vcOffers.consumedAt}
        end`,
      })
      .where(
        and(
          eq(vcOffers.id, offer.id),
          gt(vcOffers.expiresAt, new Date()),
          isNull(vcOffers.consumedAt),
        ),
      );
    invalidGrant();
  }

  const [consumed] = await db
    .update(vcOffers)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(vcOffers.id, offer.id),
        gt(vcOffers.expiresAt, new Date()),
        isNull(vcOffers.consumedAt),
        sql`${vcOffers.txAttempts} < ${VC.TX_MAX_ATTEMPTS}`,
      ),
    )
    .returning({ id: vcOffers.id });
  if (!consumed) invalidGrant();

  return {
    access_token: await signVcAccessToken(consumed.id),
    token_type: "Bearer",
    expires_in: VC.TOKEN_TTL_SEC,
  };
}

/**
 * Validate bearer + holder proof first, then consume the credential token and
 * issue inside one transaction. A forged proof can therefore never burn a
 * legitimate one-shot token (the security-critical ordering from the audit).
 */
export async function issueVcCredential(
  authorization: string | undefined,
  body: unknown,
): Promise<VcCredentialResponse> {
  const offerId = await offerIdFromAuthorization(authorization);
  const request = parseCredentialRequest(body);

  const [candidate] = await db
    .select({
      id: vcOffers.id,
      consumedAt: vcOffers.consumedAt,
      credentialIssuedAt: vcOffers.credentialIssuedAt,
    })
    .from(vcOffers)
    .where(eq(vcOffers.id, offerId))
    .limit(1);
  if (!candidate?.consumedAt || candidate.credentialIssuedAt) {
    throw new VcProtocolError("invalid_token", 401);
  }

  // No state mutation is allowed before both signature and nonce are valid.
  const holder = await verifyHolderProof(request.proof);
  const issuerKey = await loadActiveIssuerKey();
  if (!issuerKey) throw new VcProtocolError("temporarily_unavailable", 503);

  const issued = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vc-offer:${offerId}`}))`);
    const issuedAt = new Date();
    const [consumed] = await tx
      .update(vcOffers)
      .set({ credentialIssuedAt: issuedAt })
      .where(
        and(
          eq(vcOffers.id, offerId),
          isNotNull(vcOffers.consumedAt),
          isNull(vcOffers.credentialIssuedAt),
        ),
      )
      .returning({
        diplomaId: vcOffers.diplomaId,
        studentId: vcOffers.studentId,
      });
    if (!consumed) throw new VcProtocolError("invalid_token", 401);

    const [diploma] = await tx
      .select({
        id: diplomas.id,
        holderName: diplomas.holderName,
        programTitle: diplomas.programTitle,
        mention: diplomas.mention,
        rncp: diplomas.rncp,
        issuedAt: diplomas.issuedAt,
        diplomaStatus: diplomas.status,
        schoolId: schools.id,
        schoolName: schools.name,
        schoolSiret: schools.siret,
        schoolStatus: schools.status,
      })
      .from(diplomas)
      .innerJoin(schools, eq(schools.id, diplomas.schoolId))
      .where(
        and(
          eq(diplomas.id, consumed.diplomaId),
          eq(diplomas.studentId, consumed.studentId),
        ),
      )
      .limit(1);
    if (
      !diploma ||
      diploma.diplomaStatus !== "active" ||
      diploma.schoolStatus !== "approved" ||
      !diploma.schoolSiret ||
      !/^\d{14}$/.test(diploma.schoolSiret)
    ) {
      throw new VcProtocolError("invalid_token", 401);
    }

    // Serialize allocation for list 1. This makes the random free-slot choice
    // race-free without relying on catching a unique violation in an aborted TX.
    const statusListId = 1;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`vc-status-list:${statusListId}`}))`,
    );
    const used = await tx
      .select({ index: vcCredentials.statusListIndex })
      .from(vcCredentials)
      .where(eq(vcCredentials.statusListId, statusListId));
    const { index: statusListIndex } = pickRandomStatusListIndex(
      used.map((row) => row.index),
    );

    await tx.insert(vcCredentials).values({
      diplomaId: diploma.id,
      offerId,
      statusListId,
      statusListIndex,
      cnfJkt: holder.jkt,
      vct: VC.VCT,
      issuedAt,
    });

    const credential = await buildSdJwtVc({
      issuer: VC_ISSUER,
      issuerKid: issuerKey.kid,
      issuerPrivateKey: issuerKey.privateKey,
      holderJwk: holder.holderJwk,
      issuedAt: Math.floor(issuedAt.getTime() / 1000),
      vct: VC.VCT,
      status: {
        status_list: {
          idx: statusListIndex,
          uri: `${VC_ISSUER}/vc/status/${statusListId}`,
        },
      },
      claims: {
        holder_name: diploma.holderName,
        program_title: diploma.programTitle,
        mention: diploma.mention,
        rncp: diploma.rncp,
        issued_at: diploma.issuedAt,
        school_name: diploma.schoolName,
        school_siret: diploma.schoolSiret,
        diploma_id: diploma.id,
      },
    });
    return { credential, diplomaId: diploma.id, schoolId: diploma.schoolId };
  });

  // A token cached before this issuance may be shorter than the newly assigned
  // index. Invalidate immediately; revocation changes may still use the 60 s TTL.
  statusTokenCache.delete(1);
  await recordAudit({
    type: "vc_credential_issued",
    schoolId: issued.schoolId,
    diplomaId: issued.diplomaId,
    metadata: { offerId },
  });
  return { credentials: [{ credential: issued.credential }] };
}

const STATUS_CACHE_MS = 60_000;
const statusTokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function getVcStatusListToken(listId: number): Promise<string | null> {
  if (!Number.isSafeInteger(listId) || listId <= 0) return null;
  const cached = statusTokenCache.get(listId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const issuerKey = await loadStatusIssuerKey();
  if (!issuerKey) return null;
  const rows = await db
    .select({
      index: vcCredentials.statusListIndex,
      diplomaStatus: diplomas.status,
      schoolStatus: schools.status,
    })
    .from(vcCredentials)
    .innerJoin(diplomas, eq(diplomas.id, vcCredentials.diplomaId))
    .innerJoin(schools, eq(schools.id, diplomas.schoolId))
    .where(eq(vcCredentials.statusListId, listId));
  if (rows.length === 0 && listId !== 1) return null;

  const highestIndex = rows.reduce((highest, row) => Math.max(highest, row.index), -1);
  let capacity = statusListCapacity(rows.length, VC.STATUS_LIST_CAPACITY);
  while (highestIndex >= capacity) capacity *= 2;
  const statuses = new Array<number>(capacity).fill(0);
  for (const row of rows) {
    statuses[row.index] =
      row.diplomaStatus === "revoked" || row.schoolStatus !== "approved" ? 1 : 0;
  }

  const uri = `${VC_ISSUER}/vc/status/${listId}`;
  const token = await buildStatusListToken({
    issuer: VC_ISSUER,
    uri,
    issuerKid: issuerKey.kid,
    issuerPrivateKey: issuerKey.privateKey,
    statuses,
    bits: 1,
    ttlSeconds: VC.STATUS_TTL_SEC,
  });
  statusTokenCache.set(listId, { token, expiresAt: Date.now() + STATUS_CACHE_MS });
  return token;
}

export function clearVcStatusCache(): void {
  statusTokenCache.clear();
}

/** Remove abandoned bearer payloads one day after their protocol expiry. */
export async function purgeExpiredVcOffers(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 86_400_000);
  const deleted = await db
    .delete(vcOffers)
    .where(and(lt(vcOffers.expiresAt, cutoff), isNull(vcOffers.credentialIssuedAt)))
    .returning({ id: vcOffers.id });
  return deleted.length;
}
