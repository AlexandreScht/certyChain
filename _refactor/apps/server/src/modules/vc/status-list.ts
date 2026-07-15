import { randomInt } from "node:crypto";
import * as zlib from "node:zlib";
import {
  SignJWT,
  jwtVerify,
  type JWK,
  type JWTPayload,
  type KeyLike,
} from "jose";

export const STATUS_LIST_TOKEN_TYPE = "statuslist+jwt" as const;
export const STATUS_LIST_INITIAL_CAPACITY = 4_096;
export const STATUS_LIST_GROWTH_THRESHOLD = 0.75;
export const STATUS_LIST_MAX_DECODED_ENTRIES = 1 << 24;

export type StatusListBits = 1 | 2 | 4 | 8;
export type StatusListJoseKey = KeyLike | Uint8Array | JWK;

export interface BuildStatusListTokenInput {
  issuer: string;
  uri: string;
  issuerKid: string;
  issuerPrivateKey: StatusListJoseKey;
  statuses: readonly number[];
  bits?: StatusListBits;
  ttlSeconds: number;
  /** NumericDate. Defaults to the current time. */
  issuedAt?: number;
}

export interface VerifyStatusListTokenOptions {
  issuerPublicKey: StatusListJoseKey;
  issuer?: string;
  uri?: string;
  issuerKid?: string;
  maxEntries?: number;
}

export interface VerifiedStatusListToken {
  protectedHeader: {
    alg: "ES256";
    typ: typeof STATUS_LIST_TOKEN_TYPE;
    kid: string;
  };
  payload: JWTPayload & {
    sub: string;
    iat: number;
    ttl: number;
    status_list: { bits: StatusListBits; lst: string };
  };
  statuses: number[];
}

function assertBits(bits: number): asserts bits is StatusListBits {
  if (bits !== 1 && bits !== 2 && bits !== 4 && bits !== 8) {
    throw new TypeError("Status List bits must be one of 1, 2, 4, or 8");
  }
}

function assertNonNegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function assertHttpUrl(value: string, field: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
  } catch {
    throw new TypeError(`${field} must be an absolute HTTP(S) URL`);
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1 || value.includes("=")) {
    throw new TypeError("Status List lst must be unpadded base64url");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new TypeError("Status List lst must use canonical base64url encoding");
  }
  return decoded;
}

/** RFC Token Status List encoding: LSB-first packing, then DEFLATE with the ZLIB wrapper. */
export function encodeStatusList(statuses: readonly number[], bits: StatusListBits = 1): string {
  assertBits(bits);
  if (statuses.length === 0) throw new TypeError("Status List must contain at least one entry");
  const maximumValue = 2 ** bits - 1;
  const entriesPerByte = 8 / bits;
  const bytes = Buffer.alloc(Math.ceil(statuses.length / entriesPerByte));

  statuses.forEach((status, index) => {
    if (!Number.isSafeInteger(status) || status < 0 || status > maximumValue) {
      throw new TypeError(`Status at index ${index} does not fit in ${bits} bit(s)`);
    }
    const byteIndex = Math.floor(index / entriesPerByte);
    const byte = bytes[byteIndex];
    if (byte === undefined) throw new RangeError("Status List byte index is out of bounds");
    const bitOffset = (index % entriesPerByte) * bits;
    bytes[byteIndex] = byte | (status << bitOffset);
  });

  return zlib
    .deflateSync(bytes, { level: zlib.constants.Z_BEST_COMPRESSION })
    .toString("base64url");
}

/** Safely inflate and unpack an encoded list. Padding in the final byte is returned as zeroes. */
export function decodeStatusList(
  encoded: string,
  bits: StatusListBits = 1,
  maxEntries = STATUS_LIST_MAX_DECODED_ENTRIES,
): number[] {
  assertBits(bits);
  assertPositiveSafeInteger(maxEntries, "maxEntries");
  if (maxEntries > STATUS_LIST_MAX_DECODED_ENTRIES) {
    throw new RangeError(`maxEntries cannot exceed ${STATUS_LIST_MAX_DECODED_ENTRIES}`);
  }
  const maxOutputLength = Math.ceil((maxEntries * bits) / 8);
  // Reject oversized inputs before decoding; valid DEFLATE data is never meaningfully larger
  // than this conservative bound for the maximum accepted output.
  if (encoded.length > maxOutputLength * 3 + 1_024) {
    throw new TypeError("Status List lst exceeds the configured compressed-size limit");
  }
  const compressed = decodeBase64Url(encoded);
  let bytes: Buffer;
  try {
    bytes = zlib.inflateSync(compressed, { maxOutputLength });
  } catch {
    throw new TypeError("Status List lst is not a valid bounded ZLIB/DEFLATE payload");
  }
  if (bytes.length === 0) throw new TypeError("Status List must contain at least one entry");

  const entriesPerByte = 8 / bits;
  const mask = 2 ** bits - 1;
  const statuses = new Array<number>(bytes.length * entriesPerByte);
  for (let index = 0; index < statuses.length; index += 1) {
    const byte = bytes[Math.floor(index / entriesPerByte)];
    if (byte === undefined) throw new RangeError("Status List byte index is out of bounds");
    statuses[index] = (byte >> ((index % entriesPerByte) * bits)) & mask;
  }
  return statuses;
}

/** Capacity doubles only once occupancy is strictly above the product threshold. */
export function statusListCapacity(
  occupiedCount: number,
  initialCapacity = STATUS_LIST_INITIAL_CAPACITY,
  growthThreshold = STATUS_LIST_GROWTH_THRESHOLD,
): number {
  assertNonNegativeSafeInteger(occupiedCount, "occupiedCount");
  assertPositiveSafeInteger(initialCapacity, "initialCapacity");
  if (!Number.isFinite(growthThreshold) || growthThreshold <= 0 || growthThreshold >= 1) {
    throw new TypeError("growthThreshold must be between 0 and 1");
  }
  let capacity = initialCapacity;
  while (occupiedCount / capacity > growthThreshold) {
    if (capacity > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError("Status List capacity overflow");
    }
    capacity *= 2;
  }
  return capacity;
}

function countAtMost(sorted: readonly number[], target: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const value = sorted[middle];
    if (value !== undefined && value <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Select uniformly among the currently free slots; DB uniqueness still arbitrates concurrent calls. */
export function pickRandomStatusListIndex(
  usedIndices: Iterable<number>,
  randomBelow: (exclusiveMaximum: number) => number = (maximum) => randomInt(maximum),
): { index: number; capacity: number } {
  const unique = new Set<number>();
  for (const index of usedIndices) {
    assertNonNegativeSafeInteger(index, "used status index");
    unique.add(index);
  }
  const capacity = statusListCapacity(unique.size);
  const sorted = [...unique].sort((left, right) => left - right);
  if (sorted.some((index) => index >= capacity)) {
    throw new RangeError("A used status index exceeds the derived list capacity");
  }
  const freeCount = capacity - sorted.length;
  assertPositiveSafeInteger(freeCount, "free status slot count");
  const rank = randomBelow(freeCount);
  if (!Number.isSafeInteger(rank) || rank < 0 || rank >= freeCount) {
    throw new RangeError("Random source returned an out-of-range value");
  }

  // Map the random rank in the free set back to its actual index without allocating capacity slots.
  let low = 0;
  let high = capacity - 1;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const freeThroughMiddle = middle + 1 - countAtMost(sorted, middle);
    if (freeThroughMiddle > rank) high = middle;
    else low = middle + 1;
  }
  if (unique.has(low)) throw new Error("Failed to select a free Status List index");
  return { index: low, capacity };
}

/** Sign a JWT Token Status List using the draft-21 field names and ES256 profile. */
export async function buildStatusListToken(input: BuildStatusListTokenInput): Promise<string> {
  assertNonEmptyString(input.issuer, "issuer");
  assertHttpUrl(input.issuer, "issuer");
  assertNonEmptyString(input.uri, "uri");
  assertHttpUrl(input.uri, "uri");
  assertNonEmptyString(input.issuerKid, "issuerKid");
  assertPositiveSafeInteger(input.ttlSeconds, "ttlSeconds");
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1_000);
  assertNonNegativeSafeInteger(issuedAt, "issuedAt");
  const bits = input.bits ?? 1;
  const lst = encodeStatusList(input.statuses, bits);

  return new SignJWT({
    status_list: { bits, lst },
    ttl: input.ttlSeconds,
  })
    .setProtectedHeader({ alg: "ES256", typ: STATUS_LIST_TOKEN_TYPE, kid: input.issuerKid })
    .setIssuer(input.issuer)
    .setSubject(input.uri)
    .setIssuedAt(issuedAt)
    .sign(input.issuerPrivateKey);
}

/** Verify a Status List JWT and safely decode its embedded bit array. */
export async function verifyStatusListToken(
  token: string,
  options: VerifyStatusListTokenOptions,
): Promise<VerifiedStatusListToken> {
  const verified = await jwtVerify(token, options.issuerPublicKey, {
    algorithms: ["ES256"],
    ...(options.issuer ? { issuer: options.issuer } : {}),
    ...(options.uri ? { subject: options.uri } : {}),
  });
  const { protectedHeader, payload } = verified;
  if (protectedHeader.alg !== "ES256" || protectedHeader.typ !== STATUS_LIST_TOKEN_TYPE) {
    throw new TypeError("Status List Token must use typ statuslist+jwt and alg ES256");
  }
  assertNonEmptyString(protectedHeader.kid, "Status List Token kid");
  if (options.issuerKid !== undefined && protectedHeader.kid !== options.issuerKid) {
    throw new TypeError("Status List Token kid does not match the expected key");
  }
  assertNonEmptyString(payload.iss, "payload.iss");
  assertNonEmptyString(payload.sub, "payload.sub");
  assertHttpUrl(payload.sub, "payload.sub");
  assertNonNegativeSafeInteger(payload.iat as number, "payload.iat");
  assertPositiveSafeInteger(payload.ttl as number, "payload.ttl");
  const statusList = payload.status_list;
  if (!statusList || typeof statusList !== "object" || Array.isArray(statusList)) {
    throw new TypeError("Status List Token must contain status_list");
  }
  const { bits, lst } = statusList as { bits?: unknown; lst?: unknown };
  if (typeof bits !== "number") throw new TypeError("status_list.bits must be a number");
  assertBits(bits);
  assertNonEmptyString(lst, "status_list.lst");
  const statuses = decodeStatusList(lst, bits, options.maxEntries);

  return {
    protectedHeader: { alg: "ES256", typ: STATUS_LIST_TOKEN_TYPE, kid: protectedHeader.kid },
    payload: payload as VerifiedStatusListToken["payload"],
    statuses,
  };
}
