/**
 * OpenTimestamps client — pure TypeScript, zero npm dependency, native fetch.
 *
 * Same pattern as `crypto/signer.ts` (`KmsSigner`): the distroless runtime rules
 * out SDKs, and the OTS calendar HTTP API is two endpoints. The wire format is
 * implemented against the reference implementation, python-opentimestamps
 * (`opentimestamps/core/{serialize,timestamp,op,notary}.py`, calendar protocol in
 * `opentimestamps/calendar.py`), cross-checked with javascript-opentimestamps.
 *
 * Role (v2.md §V3-5): `stamp()` submits a checkpoint's 32-byte Merkle root digest
 * to the public calendars and returns the INCOMPLETE detached `.ots` proof
 * (stored as `log_checkpoints.ots_proof`); a cron later calls `upgrade()` to
 * graft the Bitcoin attestation once the calendars have aggregated the
 * commitment into a block. No Bitcoin verification happens server-side (no
 * node): the stored proof is standard `.ots`, verifiable by any OTS tool.
 *
 * Anchoring is best-effort and never blocking: `stamp` resolves `null` when no
 * calendar answered, `upgrade` never throws on network or parse failures. Only
 * root hashes transit here — no PII, no secrets.
 *
 * Every read is bounds-checked (`noUncheckedIndexedAccess` spirit at the byte
 * level): a hostile calendar can cause neither OOM (response size cap), nor an
 * infinite loop (varints are ≤ 2^53 and ≤ 8 bytes), nor a stack overflow
 * (recursion depth cap, same 256 limit as the reference).
 */

import { createHash } from "node:crypto";

import { logger } from "../../lib/logger";

/* ── Wire-format constants (python-opentimestamps) ───────────────────────── */

/** `\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94` —
 *  timestamp.py `DetachedTimestampFile.HEADER_MAGIC`. */
const HEADER_MAGIC = Buffer.from(
  "004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294",
  "hex",
);

/** timestamp.py `DetachedTimestampFile.MAJOR_VERSION` — written as a single
 *  byte (`write_uint8`); identical to the varuint encoding of 1. */
const MAJOR_VERSION = 1;

// Op tags — op.py (`TAG` of each Op subclass; crypt tags follow RFC 4880).
const OP_SHA1 = 0x02;
const OP_RIPEMD160 = 0x03;
const OP_SHA256 = 0x08;
const OP_KECCAK256 = 0x67;
const OP_APPEND = 0xf0;
const OP_PREPEND = 0xf1;
const OP_REVERSE = 0xf2;
const OP_HEXLIFY = 0xf3;

const UNARY_OP_TAGS: ReadonlySet<number> = new Set([
  OP_SHA1,
  OP_RIPEMD160,
  OP_SHA256,
  OP_KECCAK256,
  OP_REVERSE,
  OP_HEXLIFY,
]);

/** Digest length of each crypt op usable as a detached-file hash op —
 *  timestamp.py `DetachedTimestampFile.deserialize` + op.py `DIGEST_LENGTH`. */
const FILE_HASH_DIGEST_LENGTHS: ReadonlyMap<number, number> = new Map([
  [OP_SHA1, 20],
  [OP_RIPEMD160, 20],
  [OP_SHA256, 32],
  [OP_KECCAK256, 32],
]);

// Attestation tags — notary.py (`TAG`, 8 bytes each).
const ATTESTATION_TAG_LENGTH = 8;
const PENDING_ATTESTATION_TAG = Buffer.from("83dfe30d2ef90c8e", "hex");
const BITCOIN_ATTESTATION_TAG = Buffer.from("0588960d73d71901", "hex");

// Size limits — op.py `MAX_RESULT_LENGTH`/`MAX_MSG_LENGTH`, notary.py
// `MAX_PAYLOAD_SIZE`/`MAX_URI_LENGTH`, timestamp.py `_recursion_limit`.
const MAX_OP_RESULT_LENGTH = 4096;
const MAX_OP_MSG_LENGTH = 4096;
const MAX_ATTESTATION_PAYLOAD_LENGTH = 8192;
const MAX_URI_LENGTH = 1000;
const MAX_RECURSION_DEPTH = 256;

/** notary.py `PendingAttestation.ALLOWED_URI_CHARS` (matched byte-per-byte —
 *  the URI is decoded latin1 so every byte maps to exactly one char). */
const URI_SAFE_CHARS = /^[A-Za-z0-9\-._/:]*$/;

// Local hardening bounds (ours, not the reference's — the reference caps
// calendar responses at 10 000 bytes; we allow a little more headroom).
const MAX_CALENDAR_RESPONSE_BYTES = 64 * 1024;
const MAX_PENDING_LOOKUPS = 16;
const DEFAULT_TIMEOUT_MS = 10_000;

/** calendar.py `RemoteCalendar.request_headers`. */
const ACCEPT_HEADER = "application/vnd.opentimestamps.v1";

/* ── Data model ──────────────────────────────────────────────────────────── */

/** Unknown attestation kinds keep their raw tag + payload so that any valid
 *  proof round-trips byte-for-byte (notary.py `UnknownAttestation`). */
export type OtsAttestation =
  | { readonly kind: "pending"; readonly uri: string }
  | { readonly kind: "bitcoin"; readonly height: number }
  | { readonly kind: "unknown"; readonly tag: Buffer; readonly payload: Buffer };

export type OtsOp =
  | { readonly kind: "unary"; readonly tag: number }
  | { readonly kind: "binary"; readonly tag: number; readonly operand: Buffer };

/** One serialized element of a timestamp: either an attestation (stream tag
 *  0x00) or an edge (op tag + the sub-timestamp of the op's result). */
export type OtsItem =
  | { readonly type: "attestation"; readonly attestation: OtsAttestation }
  | { readonly type: "op"; readonly op: OtsOp; readonly child: OtsTimestamp };

/** Items are kept in STREAM order (the reference sorts before serializing; we
 *  preserve whatever we parsed so parse→serialize is the identity). The array
 *  is mutable on purpose: `upgrade()` grafts calendar branches into it. */
export interface OtsTimestamp {
  readonly items: OtsItem[];
}

export interface OtsDetachedProof {
  /** Tag of the op that hashed the timestamped file (always sha256 for ours). */
  readonly fileHashOpTag: number;
  readonly digest: Buffer;
  readonly root: OtsTimestamp;
}

/** Raised for any malformed byte stream (never leaves this module's public
 *  API: `stamp`/`upgrade` catch it and degrade gracefully). */
export class OtsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtsParseError";
  }
}

/* ── Bounded binary reader / writer ──────────────────────────────────────── */

class ByteReader {
  readonly #buf: Buffer;
  #pos = 0;

  constructor(buf: Buffer) {
    this.#buf = buf;
  }

  readByte(): number {
    const b = this.#buf[this.#pos];
    if (b === undefined) throw new OtsParseError("unexpected end of data");
    this.#pos += 1;
    return b;
  }

  readBytes(length: number): Buffer {
    if (length < 0 || this.#pos + length > this.#buf.length) {
      throw new OtsParseError(`truncated read: ${length} bytes wanted, ${this.#buf.length - this.#pos} left`);
    }
    // Copy: parsed nodes outlive the network buffer they came from.
    const out = Buffer.from(this.#buf.subarray(this.#pos, this.#pos + length));
    this.#pos += length;
    return out;
  }

  /** Unsigned little-endian base-128 varint (serialize.py `read_varuint`),
   *  hardened: ≤ 8 bytes, ≤ Number.MAX_SAFE_INTEGER, canonical only (no
   *  trailing zero group — our writer is canonical, so round-trips hold). */
  readVaruint(): number {
    let value = 0;
    let shift = 0;
    let count = 0;
    for (;;) {
      const b = this.readByte();
      count += 1;
      if (count > 8) throw new OtsParseError("varint too long (max 8 bytes)");
      value += (b & 0x7f) * 2 ** shift;
      if (value > Number.MAX_SAFE_INTEGER) throw new OtsParseError("varint exceeds 2^53");
      if ((b & 0x80) === 0) {
        if (count > 1 && (b & 0x7f) === 0) throw new OtsParseError("non-canonical varint");
        return value;
      }
      shift += 7;
    }
  }

  /** serialize.py `read_varbytes` — the announced length is checked against
   *  both the caller's cap and the bytes actually available. */
  readVarbytes(maxLength: number, minLength = 0): Buffer {
    const length = this.readVaruint();
    if (length > maxLength) throw new OtsParseError(`varbytes too long: ${length} > ${maxLength}`);
    if (length < minLength) throw new OtsParseError(`varbytes too short: ${length} < ${minLength}`);
    return this.readBytes(length);
  }

  /** serialize.py `assert_eof` — trailing garbage is an error. */
  assertEof(): void {
    if (this.#pos !== this.#buf.length) {
      throw new OtsParseError(`trailing garbage: ${this.#buf.length - this.#pos} byte(s) after end of data`);
    }
  }
}

class ByteWriter {
  readonly #chunks: Buffer[] = [];

  writeByte(b: number): void {
    this.#chunks.push(Buffer.from([b]));
  }

  writeBytes(bytes: Buffer): void {
    this.#chunks.push(bytes);
  }

  /** Canonical unsigned LEB128 (serialize.py `write_varuint`). */
  writeVaruint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`varuint out of range: ${value}`);
    }
    if (value === 0) {
      this.writeByte(0);
      return;
    }
    let v = value;
    while (v > 0) {
      let b = v % 0x80;
      v = Math.floor(v / 0x80);
      if (v > 0) b |= 0x80;
      this.writeByte(b);
    }
  }

  writeVarbytes(bytes: Buffer): void {
    this.writeVaruint(bytes.length);
    this.writeBytes(bytes);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.#chunks);
  }
}

/* ── Parsing (deserialization) ───────────────────────────────────────────── */

/** notary.py `TimeAttestation.deserialize` — 8-byte type tag, then the payload
 *  as varbytes; known payloads must have no trailing garbage (`assert_eof`). */
function parseAttestation(r: ByteReader): OtsAttestation {
  const tag = r.readBytes(ATTESTATION_TAG_LENGTH);
  const payload = r.readVarbytes(MAX_ATTESTATION_PAYLOAD_LENGTH);

  if (tag.equals(PENDING_ATTESTATION_TAG)) {
    const p = new ByteReader(payload);
    // latin1 maps each byte to exactly one char, so the charset check below is
    // byte-accurate and re-encoding is byte-exact (ascii would mask bit 7).
    const uri = p.readVarbytes(MAX_URI_LENGTH).toString("latin1");
    p.assertEof();
    if (!URI_SAFE_CHARS.test(uri)) throw new OtsParseError("calendar URI contains a forbidden character");
    return { kind: "pending", uri };
  }

  if (tag.equals(BITCOIN_ATTESTATION_TAG)) {
    const p = new ByteReader(payload);
    const height = p.readVaruint(); // notary.py BitcoinBlockHeaderAttestation: varuint block height
    p.assertEof();
    return { kind: "bitcoin", height };
  }

  return { kind: "unknown", tag, payload };
}

/** op.py `Op.deserialize_from_tag` — unary ops are their tag alone; binary ops
 *  (append/prepend) carry a varbytes operand of 1..4096 bytes. */
function parseOp(r: ByteReader, tag: number): OtsOp {
  if (UNARY_OP_TAGS.has(tag)) return { kind: "unary", tag };
  if (tag === OP_APPEND || tag === OP_PREPEND) {
    return { kind: "binary", tag, operand: r.readVarbytes(MAX_OP_RESULT_LENGTH, 1) };
  }
  throw new OtsParseError(`unknown op tag 0x${tag.toString(16)}`);
}

function parseItem(r: ByteReader, tag: number, depth: number): OtsItem {
  if (tag === 0x00) return { type: "attestation", attestation: parseAttestation(r) };
  return { type: "op", op: parseOp(r, tag), child: parseTimestamp(r, depth + 1) };
}

/** timestamp.py `Timestamp.deserialize` — every item except the last is
 *  prefixed by the 0xff continuation byte; an item starts with 0x00 (an
 *  attestation follows) or an op tag (a sub-timestamp of its result follows). */
function parseTimestamp(r: ByteReader, depth: number): OtsTimestamp {
  if (depth > MAX_RECURSION_DEPTH) throw new OtsParseError("timestamp tree too deep");
  const items: OtsItem[] = [];
  let tag = r.readByte();
  while (tag === 0xff) {
    items.push(parseItem(r, r.readByte(), depth));
    tag = r.readByte();
  }
  items.push(parseItem(r, tag, depth));
  return { items };
}

/**
 * Parses a detached `.ots` file (timestamp.py `DetachedTimestampFile`):
 * magic + version + file-hash-op tag + digest + timestamp, nothing after.
 *
 * Exported (with `serializeOtsProof`) so tests can assert the byte-for-byte
 * round-trip and so later UI code can surface e.g. the Bitcoin block height.
 */
export function parseOtsProof(proofBytes: Buffer): OtsDetachedProof {
  const r = new ByteReader(proofBytes);
  if (!r.readBytes(HEADER_MAGIC.length).equals(HEADER_MAGIC)) {
    throw new OtsParseError("bad detached-timestamp magic");
  }
  const version = r.readVaruint();
  if (version !== MAJOR_VERSION) throw new OtsParseError(`unsupported version ${version}`);
  const fileHashOpTag = r.readByte();
  const digestLength = FILE_HASH_DIGEST_LENGTHS.get(fileHashOpTag);
  if (digestLength === undefined) {
    throw new OtsParseError(`file hash op 0x${fileHashOpTag.toString(16)} is not a crypt op`);
  }
  const digest = r.readBytes(digestLength);
  const root = parseTimestamp(r, 0);
  r.assertEof();
  return { fileHashOpTag, digest, root };
}

/* ── Serialization (exact mirror of the reference writers) ───────────────── */

function writeAttestation(w: ByteWriter, attestation: OtsAttestation): void {
  // notary.py TimeAttestation.serialize: 8-byte tag, then payload as varbytes.
  if (attestation.kind === "pending") {
    w.writeBytes(PENDING_ATTESTATION_TAG);
    const payload = new ByteWriter();
    payload.writeVarbytes(Buffer.from(attestation.uri, "latin1"));
    w.writeVarbytes(payload.toBuffer());
  } else if (attestation.kind === "bitcoin") {
    w.writeBytes(BITCOIN_ATTESTATION_TAG);
    const payload = new ByteWriter();
    payload.writeVaruint(attestation.height);
    w.writeVarbytes(payload.toBuffer());
  } else {
    w.writeBytes(attestation.tag);
    w.writeVarbytes(attestation.payload);
  }
}

function writeOp(w: ByteWriter, op: OtsOp): void {
  w.writeByte(op.tag);
  if (op.kind === "binary") w.writeVarbytes(op.operand);
}

function writeItem(w: ByteWriter, item: OtsItem): void {
  if (item.type === "attestation") {
    w.writeByte(0x00);
    writeAttestation(w, item.attestation);
  } else {
    writeOp(w, item.op);
    writeTimestamp(w, item.child);
  }
}

/** timestamp.py `Timestamp.serialize` — 0xff before every non-final item. */
function writeTimestamp(w: ByteWriter, node: OtsTimestamp): void {
  if (node.items.length === 0) throw new Error("an empty timestamp can't be serialized");
  node.items.forEach((item, index) => {
    if (index < node.items.length - 1) w.writeByte(0xff);
    writeItem(w, item);
  });
}

export function serializeOtsProof(proof: OtsDetachedProof): Buffer {
  const w = new ByteWriter();
  w.writeBytes(HEADER_MAGIC);
  w.writeByte(MAJOR_VERSION);
  w.writeByte(proof.fileHashOpTag);
  w.writeBytes(proof.digest);
  writeTimestamp(w, proof.root);
  return w.toBuffer();
}

function serializeItem(item: OtsItem): Buffer {
  const w = new ByteWriter();
  writeItem(w, item);
  return w.toBuffer();
}

/* ── Tree walking ────────────────────────────────────────────────────────── */

function hashOrNull(algorithm: string, msg: Buffer): Buffer | null {
  try {
    return createHash(algorithm).update(msg).digest();
  } catch {
    return null; // algorithm unavailable in this OpenSSL build
  }
}

/**
 * Applies one op to a message (op.py `Op.__call__` semantics, including the
 * 4096-byte message/result caps). Returns null when the result can't be
 * computed (keccak256 is not in node:crypto) or would break a bound — the
 * branch is then simply not upgradeable from here, never an exception.
 */
function applyOp(op: OtsOp, msg: Buffer): Buffer | null {
  if (msg.length > MAX_OP_MSG_LENGTH) return null;
  let result: Buffer | null;
  if (op.kind === "binary") {
    result = op.tag === OP_APPEND ? Buffer.concat([msg, op.operand]) : Buffer.concat([op.operand, msg]);
  } else {
    switch (op.tag) {
      case OP_SHA1:
        result = hashOrNull("sha1", msg);
        break;
      case OP_RIPEMD160:
        result = hashOrNull("ripemd160", msg);
        break;
      case OP_SHA256:
        result = hashOrNull("sha256", msg);
        break;
      case OP_REVERSE:
        result = msg.length === 0 ? null : Buffer.from(msg).reverse();
        break;
      case OP_HEXLIFY:
        result = msg.length === 0 ? null : Buffer.from(msg.toString("hex"), "latin1");
        break;
      default:
        result = null; // keccak256 (or a tag added after this was written)
    }
  }
  if (result === null || result.length === 0 || result.length > MAX_OP_RESULT_LENGTH) return null;
  return result;
}

function hasBitcoinAttestation(node: OtsTimestamp): boolean {
  return node.items.some((item) =>
    item.type === "attestation"
      ? item.attestation.kind === "bitcoin"
      : hasBitcoinAttestation(item.child),
  );
}

/** A node holding a pending attestation, plus the commitment (the message at
 *  that node, i.e. the digest with every op on the path applied) — this is
 *  exactly what otsclient queries: `GET {uri}/timestamp/{hex(commitment)}`. */
interface PendingSite {
  readonly node: OtsTimestamp;
  readonly uri: string;
  readonly commitment: Buffer;
}

function collectPendingSites(node: OtsTimestamp, msg: Buffer | null, out: PendingSite[]): void {
  const seenHere = new Set<string>();
  for (const item of node.items) {
    if (item.type === "attestation") {
      if (item.attestation.kind === "pending" && msg !== null && !seenHere.has(item.attestation.uri)) {
        seenHere.add(item.attestation.uri);
        out.push({ node, uri: item.attestation.uri, commitment: msg });
      }
    } else {
      collectPendingSites(item.child, msg === null ? null : applyOp(item.op, msg), out);
    }
  }
}

/**
 * Grafts a calendar's continuation into the node that carried the pending
 * attestation — the byte-level equivalent of otsclient's
 * `sub_stamp.merge(upgraded_stamp)` (cmds.py `upgrade_timestamp`). The pending
 * attestation is kept, as the reference keeps it (pruning is a separate,
 * explicitly-requested operation there). Byte-identical branches are skipped
 * so a re-run can't duplicate them. Returns the number of items grafted.
 */
function graftItems(node: OtsTimestamp, incoming: readonly OtsItem[]): number {
  const existing = new Set(node.items.map((item) => serializeItem(item).toString("hex")));
  let added = 0;
  for (const item of incoming) {
    const bytes = serializeItem(item).toString("hex");
    if (existing.has(bytes)) continue;
    existing.add(bytes);
    node.items.push(item);
    added += 1;
  }
  return added;
}

/* ── Client ──────────────────────────────────────────────────────────────── */

export interface OtsClient {
  /** Submits the digest (32 bytes) to the calendars; returns the serialized
   *  detached `.ots` file (preamble + version + sha256 file-hash op + digest +
   *  op/attestation tree), or null if NO calendar answered (anchoring is
   *  best-effort, never blocking). */
  stamp(digestHex: string): Promise<Buffer | null>;
  /** Tries to complete a proof by querying the calendars of its pending
   *  attestations; returns the (upgraded or unchanged) proof plus
   *  `complete: true` when at least one Bitcoin attestation is present.
   *  Never throws for a network error. */
  upgrade(otsProof: Buffer): Promise<{ proof: Buffer; complete: boolean }>;
}

export interface OtsClientOptions {
  /** Calendar base URLs, e.g. https://a.pool.opentimestamps.org */
  calendars: readonly string[];
  /** Injectable for tests (same seam as KmsSigner). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout; default 10 000 ms. */
  timeoutMs?: number;
}

export function createOtsClient(opts: OtsClientOptions): OtsClient {
  // Strip trailing slashes so `${base}/digest` never doubles up.
  const calendars = opts.calendars.map((url) => url.replace(/\/+$/, ""));
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Races an explicit timer in addition to passing AbortSignal: an injected
   *  fetchImpl may ignore the signal, and `stamp` must never hang forever. */
  async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
    });
    const request = (async () => fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }))();
    // A late rejection of an abandoned request must not surface as unhandled.
    request.catch(() => {});
    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** Reads the body incrementally so a hostile calendar can't make us buffer
   *  an unbounded response — the stream is cancelled at the cap. */
  async function readBodyBounded(res: Response): Promise<Buffer> {
    const body = res.body;
    if (body === null) return Buffer.alloc(0);
    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel().catch(() => {});
        throw new Error("unexpected chunk type in calendar response");
      }
      total += value.byteLength;
      if (total > MAX_CALENDAR_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error(`calendar response exceeds ${MAX_CALENDAR_RESPONSE_BYTES} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }

  /** Parses a bare Timestamp serialization (calendar responses carry no
   *  detached-file preamble — calendar.py `submit`/`get_timestamp`). */
  function parseBareTimestamp(bytes: Buffer): OtsTimestamp {
    const r = new ByteReader(bytes);
    const timestamp = parseTimestamp(r, 0);
    r.assertEof();
    return timestamp;
  }

  /** calendar.py `RemoteCalendar.submit` — POST {calendar}/digest with the raw
   *  digest bytes as body; the response is a Timestamp rooted at the digest. */
  async function submitDigest(calendar: string, digest: Buffer): Promise<OtsTimestamp> {
    const res = await fetchWithTimeout(`${calendar}/digest`, {
      method: "POST",
      headers: { Accept: ACCEPT_HEADER, "Content-Type": "application/octet-stream" },
      body: digest,
    });
    if (!res.ok) throw new Error(`calendar answered ${res.status}`);
    return parseBareTimestamp(await readBodyBounded(res));
  }

  async function stampDigest(digest: Buffer): Promise<Buffer | null> {
    const results = await Promise.allSettled(
      calendars.map((calendar) => submitDigest(calendar, digest)),
    );

    // Merge every valid response into ONE multi-branch timestamp. Responses
    // are all rooted at the same message (the digest), so their items simply
    // become sibling branches — the flat equivalent of Timestamp.merge().
    const merged: OtsItem[] = [];
    let succeeded = 0;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        succeeded += 1;
        merged.push(...result.value.items);
      } else {
        logger.warn("ots.stamp_failed", {
          calendar: calendars[index] ?? "unknown",
          error: errorMessage(result.reason),
        });
      }
    });

    if (succeeded === 0) {
      logger.warn("ots.stamp_unanchored", { calendarsTotal: calendars.length });
      return null;
    }

    const bytes = serializeOtsProof({
      fileHashOpTag: OP_SHA256,
      digest,
      root: { items: merged },
    });
    logger.info("ots.stamped", {
      digest: digest.toString("hex"),
      calendarsOk: succeeded,
      calendarsTotal: calendars.length,
    });
    return bytes;
  }

  return {
    stamp(digestHex: string): Promise<Buffer | null> {
      // Synchronous throw: a malformed digest is a programming error upstream
      // (checkpoint roots are always 32-byte SHA-256 hex), not a network one.
      if (!/^[0-9a-fA-F]{64}$/.test(digestHex)) {
        throw new TypeError("stamp() expects a 32-byte SHA-256 digest as 64 hex characters");
      }
      return stampDigest(Buffer.from(digestHex, "hex"));
    },

    async upgrade(otsProof: Buffer): Promise<{ proof: Buffer; complete: boolean }> {
      let parsed: OtsDetachedProof;
      try {
        parsed = parseOtsProof(otsProof);
      } catch (error) {
        // Corrupted input: report loudly (this shouldn't exist in the DB) but
        // hand the bytes back untouched — the caller decides what to do.
        logger.error("ots.upgrade_invalid_proof", { error: errorMessage(error) });
        return { proof: otsProof, complete: false };
      }

      if (hasBitcoinAttestation(parsed.root)) {
        return { proof: otsProof, complete: true }; // nothing to do, no network
      }

      // The root Timestamp's message is the file digest itself.
      const sites: PendingSite[] = [];
      collectPendingSites(parsed.root, parsed.digest, sites);

      let grafted = 0;
      for (const site of sites.slice(0, MAX_PENDING_LOOKUPS)) {
        try {
          if (!/^https?:\/\//.test(site.uri)) {
            logger.warn("ots.upgrade_failed", { calendar: site.uri, error: "calendar URI is not http(s)" });
            continue;
          }
          // cmds.py upgrade_timestamp → calendar.py get_timestamp.
          const url = `${site.uri.replace(/\/+$/, "")}/timestamp/${site.commitment.toString("hex")}`;
          const res = await fetchWithTimeout(url, { headers: { Accept: ACCEPT_HEADER } });
          if (!res.ok) {
            // 404 = the calendar hasn't aggregated into Bitcoin yet — normal
            // for a few hours after stamping, the cron will retry.
            logger.warn("ots.upgrade_failed", { calendar: site.uri, error: `calendar answered ${res.status}` });
            continue;
          }
          const branch = parseBareTimestamp(await readBodyBounded(res));
          grafted += graftItems(site.node, branch.items);
        } catch (error) {
          logger.warn("ots.upgrade_failed", { calendar: site.uri, error: errorMessage(error) });
        }
      }

      const complete = hasBitcoinAttestation(parsed.root);
      if (grafted === 0) {
        // Nothing changed: return the exact input bytes, not a re-serialization.
        return { proof: otsProof, complete };
      }
      logger.info("ots.upgraded", { grafted, complete });
      return { proof: serializeOtsProof(parsed), complete };
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
