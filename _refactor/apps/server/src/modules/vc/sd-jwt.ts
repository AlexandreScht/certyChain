import { createHash } from "node:crypto";
import {
  SignJWT,
  importJWK,
  jwtVerify,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from "jose";
import {
  decodeBase64Url,
  digestOf,
  makeDisclosure,
  makeSalt,
  parseDisclosure as parseDisclosureFields,
} from "../../crypto/disclosures";

// V1 (ed25519-sd-v2) and F2 (SD-JWT VC) are two consumers of ONE salt→disclosure→
// digest mechanic, which lives in crypto/disclosures.ts (v2.md §0.4). This module
// keeps only what legitimately differs for the EUDI profile: the ES256 signature,
// the compact JWT envelope, decoys, and the claim-name/value domain validation.

export const SD_JWT_VC_FORMAT = "dc+sd-jwt" as const;
export const CERTIFYCHAIN_DIPLOMA_VCT = "urn:certifychain:diploma:1" as const;

const HASH_ALGORITHM = "sha-256" as const;
const DEFAULT_DECOY_COUNT = 2;
const MINIMUM_SALT_BYTES = 16;

export const DIPLOMA_DISCLOSABLE_CLAIMS = [
  "holder_name",
  "program_title",
  "mention",
  "rncp",
  "issued_at",
  "school_name",
  "school_siret",
  "diploma_id",
] as const;

export type DiplomaDisclosableClaimName = (typeof DIPLOMA_DISCLOSABLE_CLAIMS)[number];
export type JoseKey = KeyLike | Uint8Array | JWK;

export interface DiplomaDisclosableClaims {
  holder_name: string;
  program_title: string;
  mention?: string | null;
  rncp?: string | null;
  issued_at: string;
  school_name: string;
  school_siret: string;
  diploma_id: string;
}

export interface StatusListReference {
  status_list: {
    idx: number;
    uri: string;
  };
}

export interface BuildSdJwtVcInput {
  issuer: string;
  issuerKid: string;
  issuerPrivateKey: JoseKey;
  holderJwk: JWK;
  status: StatusListReference;
  claims: DiplomaDisclosableClaims;
  /** NumericDate. Defaults to the current time. */
  issuedAt?: number;
  vct?: string;
}

export interface VerifySdJwtVcOptions {
  issuerPublicKey: JoseKey;
  issuer?: string;
  issuerKid?: string;
  vct?: string;
}

export interface VerifiedSdJwtVc {
  protectedHeader: {
    alg: "ES256";
    typ: typeof SD_JWT_VC_FORMAT;
    kid: string;
  };
  /** Permanently visible claims plus the verified disclosures in this presentation. */
  payload: JWTPayload & Partial<DiplomaDisclosableClaims>;
  /** Only claims carried by disclosures in this presentation. */
  disclosedClaims: Partial<DiplomaDisclosableClaims>;
}

interface DecodedDisclosure {
  encoded: string;
  digest: string;
  salt: string;
  name: DiplomaDisclosableClaimName;
  value: unknown;
}

interface ParsedSdJwt {
  issuerSignedJwt: string;
  disclosures: string[];
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function assertUrl(value: string, field: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
  } catch {
    throw new TypeError(`${field} must be an absolute HTTP(S) URL`);
  }
}

function assertNumericDate(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer NumericDate`);
  }
}

function assertP256PublicJwk(value: unknown, field: string): asserts value is JWK {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be a public P-256 JWK`);
  }
  const jwk = value as Record<string, unknown>;
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    jwk.x.length === 0 ||
    jwk.y.length === 0 ||
    jwk.d !== undefined ||
    (jwk.alg !== undefined && jwk.alg !== "ES256")
  ) {
    throw new TypeError(`${field} must be a public P-256 JWK`);
  }
}

function publicHolderJwk(jwk: JWK): JWK {
  assertP256PublicJwk(jwk, "holderJwk");
  // Only confirmation material is embedded: never optional private or operational metadata.
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

function assertStatusReference(value: unknown): asserts value is StatusListReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("status must contain a Token Status List reference");
  }
  const statusList = (value as { status_list?: unknown }).status_list;
  if (!statusList || typeof statusList !== "object" || Array.isArray(statusList)) {
    throw new TypeError("status.status_list is required");
  }
  const { idx, uri } = statusList as { idx?: unknown; uri?: unknown };
  if (!Number.isSafeInteger(idx) || (idx as number) < 0) {
    throw new TypeError("status.status_list.idx must be a non-negative integer");
  }
  assertNonEmptyString(uri, "status.status_list.uri");
  assertUrl(uri, "status.status_list.uri");
}

function assertSalt(salt: string): void {
  assertNonEmptyString(salt, "Disclosure salt");
  if (decodeBase64Url(salt, "Disclosure salt").byteLength < MINIMUM_SALT_BYTES) {
    throw new TypeError("Disclosure salt must contain at least 128 bits");
  }
}

function createDisclosure(
  name: DiplomaDisclosableClaimName,
  value: unknown,
  salt: string,
): DecodedDisclosure {
  assertSalt(salt);
  const encoded = makeDisclosure(name, value, salt);
  return { encoded, digest: digestOf(encoded), salt, name, value };
}

function parseDisclosure(encoded: string): DecodedDisclosure {
  // Shared, pure decode of the [salt, name, value] triple; the EUDI profile then
  // layers its own domain rules (128-bit salt, known claim name, non-empty value).
  const [salt, name, value] = parseDisclosureFields(encoded);
  assertSalt(salt);
  if (!isDiplomaClaimName(name)) {
    throw new TypeError("Disclosure contains an unsupported claim name");
  }
  assertNonEmptyString(value, `Disclosure claim '${name}'`);
  return { encoded, digest: digestOf(encoded), salt, name, value };
}

function parseSdJwt(sdJwt: string): ParsedSdJwt {
  assertNonEmptyString(sdJwt, "SD-JWT VC");
  const parts = sdJwt.split("~");
  if (parts.length < 2 || parts.at(-1) !== "") {
    throw new TypeError("An SD-JWT without Key Binding must end with '~'");
  }
  const issuerSignedJwt = parts[0];
  if (!issuerSignedJwt || issuerSignedJwt.split(".").length !== 3) {
    throw new TypeError("SD-JWT VC contains an invalid Issuer-signed JWT");
  }
  const disclosures = parts.slice(1, -1);
  if (disclosures.some((disclosure) => disclosure.length === 0)) {
    throw new TypeError("SD-JWT VC contains an empty Disclosure");
  }
  return { issuerSignedJwt, disclosures };
}

function isDiplomaClaimName(value: unknown): value is DiplomaDisclosableClaimName {
  return (
    typeof value === "string" &&
    (DIPLOMA_DISCLOSABLE_CLAIMS as readonly string[]).includes(value)
  );
}

function disclosureEntries(claims: DiplomaDisclosableClaims): Array<[
  DiplomaDisclosableClaimName,
  string,
]> {
  const entries: Array<[DiplomaDisclosableClaimName, string]> = [
    ["holder_name", claims.holder_name],
    ["program_title", claims.program_title],
    ["issued_at", claims.issued_at],
    ["school_name", claims.school_name],
    ["school_siret", claims.school_siret],
    ["diploma_id", claims.diploma_id],
  ];
  if (typeof claims.mention === "string" && claims.mention.trim().length > 0) {
    entries.push(["mention", claims.mention]);
  }
  if (typeof claims.rncp === "string" && claims.rncp.trim().length > 0) {
    entries.push(["rncp", claims.rncp]);
  }
  for (const [name, value] of entries) assertNonEmptyString(value, `claims.${name}`);
  return entries;
}

function shuffledWithoutSourceOrder<T>(values: readonly T[]): T[] {
  // RFC 9901 only requires hiding source order; sorting by digest is deterministic and interoperable.
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function defaultSaltGenerator(): string {
  return makeSalt();
}

function createUniqueRandomValue(existing: Set<string>): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const value = defaultSaltGenerator();
    assertSalt(value);
    if (!existing.has(value)) {
      existing.add(value);
      return value;
    }
  }
  throw new Error("Could not generate a unique cryptographic random value");
}

/** Build a CertifyChain diploma SD-JWT VC using only RFC 9901 and JOSE primitives. */
export async function buildSdJwtVc(input: BuildSdJwtVcInput): Promise<string> {
  assertNonEmptyString(input.issuer, "issuer");
  assertUrl(input.issuer, "issuer");
  assertNonEmptyString(input.issuerKid, "issuerKid");
  assertStatusReference(input.status);
  const holderJwk = publicHolderJwk(input.holderJwk);
  await importJWK(holderJwk, "ES256");
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1_000);
  assertNumericDate(issuedAt, "issuedAt");
  const vct = input.vct ?? CERTIFYCHAIN_DIPLOMA_VCT;
  assertNonEmptyString(vct, "vct");

  const salts = new Set<string>();
  const disclosures = disclosureEntries(input.claims).map(([name, value]) =>
    createDisclosure(name, value, createUniqueRandomValue(salts)),
  );
  const digests = new Set(disclosures.map(({ digest }) => digest));

  for (let index = 0; index < DEFAULT_DECOY_COUNT; index += 1) {
    const randomValue = createUniqueRandomValue(salts);
    const digest = createHash("sha256")
      .update(decodeBase64Url(randomValue, "Decoy source"))
      .digest("base64url");
    if (digests.has(digest)) throw new Error("Duplicate SD-JWT digest generated");
    digests.add(digest);
  }

  const payload: JWTPayload = {
    iss: input.issuer,
    iat: issuedAt,
    vct,
    cnf: { jwk: holderJwk },
    status: input.status,
    _sd_alg: HASH_ALGORITHM,
    _sd: shuffledWithoutSourceOrder([...digests]),
  };
  const issuerSignedJwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", typ: SD_JWT_VC_FORMAT, kid: input.issuerKid })
    .sign(input.issuerPrivateKey);

  // RFC 9901 compact serialization requires the final tilde when no KB-JWT is present.
  return `${issuerSignedJwt}~${disclosures.map(({ encoded }) => encoded).join("~")}~`;
}

/**
 * Filter an issued credential into an SD-JWT presentation. Signature/digests are intentionally
 * checked by `verifySdJwtVc`; this helper only performs the Holder's disclosure selection.
 */
export function selectSdJwtDisclosures(
  issuedSdJwt: string,
  selectedClaims: readonly DiplomaDisclosableClaimName[],
): string {
  const parsed = parseSdJwt(issuedSdJwt);
  const selected = new Set(selectedClaims);
  if (selected.size !== selectedClaims.length) throw new TypeError("Duplicate selected claim name");
  const found = new Set<DiplomaDisclosableClaimName>();
  const disclosures = parsed.disclosures.filter((encoded) => {
    const disclosure = parseDisclosure(encoded);
    if (!selected.has(disclosure.name)) return false;
    if (found.has(disclosure.name)) throw new TypeError("Duplicate Disclosure claim name");
    found.add(disclosure.name);
    return true;
  });
  for (const name of selected) {
    if (!found.has(name)) throw new TypeError(`Claim '${name}' is not available for disclosure`);
  }
  return `${parsed.issuerSignedJwt}~${disclosures.length > 0 ? `${disclosures.join("~")}~` : ""}`;
}

/** Verify the issuer signature and every disclosure included in an SD-JWT VC presentation. */
export async function verifySdJwtVc(
  sdJwt: string,
  options: VerifySdJwtVcOptions,
): Promise<VerifiedSdJwtVc> {
  const parsed = parseSdJwt(sdJwt);
  const verified = await jwtVerify(parsed.issuerSignedJwt, options.issuerPublicKey, {
    algorithms: ["ES256"],
    ...(options.issuer ? { issuer: options.issuer } : {}),
  });
  const { protectedHeader, payload } = verified;
  if (protectedHeader.alg !== "ES256" || protectedHeader.typ !== SD_JWT_VC_FORMAT) {
    throw new TypeError("Issuer-signed JWT must use typ dc+sd-jwt and alg ES256");
  }
  assertNonEmptyString(protectedHeader.kid, "Issuer-signed JWT kid");
  if (options.issuerKid !== undefined && protectedHeader.kid !== options.issuerKid) {
    throw new TypeError("Issuer-signed JWT kid does not match the expected key");
  }
  if (payload._sd_alg !== HASH_ALGORITHM) {
    throw new TypeError("CertifyChain SD-JWT VCs must declare _sd_alg sha-256");
  }
  if (!Array.isArray(payload._sd) || !payload._sd.every((digest) => typeof digest === "string")) {
    throw new TypeError("SD-JWT VC must contain a valid top-level _sd array");
  }
  const digestSet = new Set(payload._sd as string[]);
  if (digestSet.size !== payload._sd.length) {
    throw new TypeError("SD-JWT VC contains duplicate digests");
  }
  for (const digest of digestSet) {
    if (decodeBase64Url(digest, "Disclosure digest").byteLength !== 32) {
      throw new TypeError("Disclosure digest must be a SHA-256 value");
    }
  }

  assertNonEmptyString(payload.iss, "payload.iss");
  assertNumericDate(payload.iat as number, "payload.iat");
  assertNonEmptyString(payload.vct, "payload.vct");
  if (options.vct !== undefined && payload.vct !== options.vct) {
    throw new TypeError("SD-JWT VC vct does not match the expected type");
  }
  if (payload.exp !== undefined) {
    throw new TypeError("CertifyChain diploma credentials must not expire");
  }
  const confirmation = payload.cnf;
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) {
    throw new TypeError("SD-JWT VC must contain cnf.jwk");
  }
  const embeddedHolderJwk = (confirmation as { jwk?: unknown }).jwk;
  assertP256PublicJwk(embeddedHolderJwk, "payload.cnf.jwk");
  await importJWK(embeddedHolderJwk, "ES256");
  assertStatusReference(payload.status);
  for (const claimName of DIPLOMA_DISCLOSABLE_CLAIMS) {
    if (Object.hasOwn(payload, claimName)) {
      throw new TypeError(`Claim '${claimName}' must be selectively disclosable`);
    }
  }

  const disclosedClaims: Partial<DiplomaDisclosableClaims> = {};
  const seenDisclosureDigests = new Set<string>();
  for (const encoded of parsed.disclosures) {
    const disclosure = parseDisclosure(encoded);
    if (!digestSet.has(disclosure.digest)) {
      throw new TypeError("Disclosure digest is not present in the signed payload");
    }
    if (seenDisclosureDigests.has(disclosure.digest)) throw new TypeError("Duplicate Disclosure");
    if (Object.hasOwn(disclosedClaims, disclosure.name)) {
      throw new TypeError("Multiple Disclosures target the same claim");
    }
    seenDisclosureDigests.add(disclosure.digest);
    Object.defineProperty(disclosedClaims, disclosure.name, {
      value: disclosure.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }

  const processedPayload = { ...payload, ...disclosedClaims } as JWTPayload &
    Partial<DiplomaDisclosableClaims>;
  delete processedPayload._sd;
  delete processedPayload._sd_alg;
  return {
    protectedHeader: {
      alg: "ES256",
      typ: SD_JWT_VC_FORMAT,
      kid: protectedHeader.kid,
    },
    payload: processedPayload,
    disclosedClaims,
  };
}
