/**
 * Unit tests for the zero-dependency OpenTimestamps client (v2.md §V3-5) —
 * NO network: fetchImpl is always injected (same seam as KmsSigner tests).
 *
 * The golden vectors are written byte-by-byte against the reference format
 * (python-opentimestamps core/{serialize,timestamp,op,notary}.py):
 *   magic \x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94,
 *   version 0x01, sha256 file-hash op 0x08, ops append 0xf0 / prepend 0xf1,
 *   attestations pending 83dfe30d2ef90c8e / bitcoin 0588960d73d71901,
 *   0xff continuation byte before every non-final tree item, LEB128 varuints.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  OtsParseError,
  createOtsClient,
  parseOtsProof,
  serializeOtsProof,
} from "../../../src/modules/transparency/ots";
import type { OtsAttestation, OtsTimestamp } from "../../../src/modules/transparency/ots";

/* ── Byte-vector builders (single-byte varuint lengths only, asserted) ────── */

const hex = (s: string): Buffer => Buffer.from(s.replaceAll(" ", ""), "hex");
const cat = (...parts: Buffer[]): Buffer => Buffer.concat(parts);

/** varbytes with a single-byte length — every test value is < 0x80 long. */
const vb = (b: Buffer): Buffer => {
  assert.ok(b.length < 0x80, "test builder only handles single-byte varuints");
  return cat(Buffer.from([b.length]), b);
};

// Detached-file preamble — timestamp.py DetachedTimestampFile.HEADER_MAGIC.
const MAGIC = hex("004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294");
const VERSION = hex("01"); // MAJOR_VERSION, single byte
const OP_SHA256 = hex("08"); // op.py OpSHA256.TAG
const OP_APPEND = hex("f0"); // op.py OpAppend.TAG
const OP_PREPEND = hex("f1"); // op.py OpPrepend.TAG
const ITEM_SEP = hex("ff"); // continuation byte before non-final items
const ATTESTATION = hex("00"); // stream tag announcing an attestation

// A fixed, recognizable 32-byte digest (bytes 0x00..0x1f).
const DIGEST_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const DIGEST = hex(DIGEST_HEX);

/** Pending attestation: 8-byte tag + varbytes( varbytes(uri) ) — notary.py. */
const pendingAttestation = (uri: string): Buffer =>
  cat(ATTESTATION, hex("83dfe30d2ef90c8e"), vb(vb(Buffer.from(uri, "ascii"))));

/** Bitcoin attestation: 8-byte tag + varbytes( varuint(height) ) — notary.py.
 *  Height 823714 = 34 + 35·128 + 50·128² → LEB128 a2 a3 32 (non-trivial). */
const BITCOIN_HEIGHT = 823714;
const bitcoinAttestation823714 = (): Buffer =>
  cat(ATTESTATION, hex("0588960d73d71901"), vb(hex("a2a332")));

const preamble = (): Buffer => cat(MAGIC, VERSION, OP_SHA256, DIGEST);

const sha256 = (b: Buffer): Buffer => createHash("sha256").update(b).digest();

/* ── fetch fake ───────────────────────────────────────────────────────────── */

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

const fakeFetch =
  (handler: FetchHandler): typeof fetch =>
  async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  };

/** Walks a parsed tree applying append/prepend/sha256 (the only ops these
 *  tests use) and collects every attestation with the message it attests. */
function collectAttestations(
  node: OtsTimestamp,
  msg: Buffer,
): Array<{ msgHex: string; attestation: OtsAttestation }> {
  const out: Array<{ msgHex: string; attestation: OtsAttestation }> = [];
  for (const item of node.items) {
    if (item.type === "attestation") {
      out.push({ msgHex: msg.toString("hex"), attestation: item.attestation });
    } else {
      let next: Buffer;
      if (item.op.kind === "binary") {
        next =
          item.op.tag === 0xf0
            ? Buffer.concat([msg, item.op.operand])
            : Buffer.concat([item.op.operand, msg]);
      } else {
        assert.equal(item.op.tag, 0x08, "tests only build sha256 unary ops");
        next = sha256(msg);
      }
      out.push(...collectAttestations(item.child, next));
    }
  }
  return out;
}

/* ── stamp ───────────────────────────────────────────────────────────────── */

describe("OtsClient.stamp — golden serialization vector", () => {
  it("produces the exact detached .ots bytes for a single pending response", async () => {
    // The calendar answers with a bare Timestamp: one pending attestation.
    const calendarResponse = pendingAttestation("https://a.example.org");

    let sawRequest = false;
    const client = createOtsClient({
      calendars: ["https://a.example.org"],
      fetchImpl: fakeFetch((url, init) => {
        sawRequest = true;
        // calendar.py submit: POST {calendar}/digest, body = raw digest bytes.
        assert.equal(url, "https://a.example.org/digest");
        assert.equal(init?.method, "POST");
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.Accept, "application/vnd.opentimestamps.v1");
        const body = init?.body;
        assert.ok(Buffer.isBuffer(body), "body must be the raw digest bytes");
        assert.equal(Buffer.compare(body, DIGEST), 0);
        return new Response(calendarResponse);
      }),
    });

    const proof = await client.stamp(DIGEST_HEX);
    assert.ok(proof, "one successful calendar is enough");
    assert.ok(sawRequest);

    const expected = cat(
      MAGIC, //                          detached-file magic (31 bytes)
      VERSION, //                        0x01 — major version
      OP_SHA256, //                      0x08 — file hash op (sha256)
      DIGEST, //                         the 32 digest bytes
      ATTESTATION, //                    0x00 — attestation follows
      hex("83dfe30d2ef90c8e"), //        pending-attestation tag
      hex("16"), //                      varbytes: payload = 22 bytes
      hex("15"), //                      varbytes: URI = 21 bytes
      Buffer.from("https://a.example.org", "ascii"),
    );
    assert.equal(proof.toString("hex"), expected.toString("hex"));
  });

  it("merges two calendar responses into ONE multi-branch timestamp (0xff separator)", async () => {
    // Each calendar nonces the digest before aggregating: append(nonce) → sha256 → pending.
    const branchA = cat(
      OP_APPEND,
      vb(hex("a1a2a3a4a5a6a7a8")), //    calendar A's nonce
      OP_SHA256,
      pendingAttestation("https://a.example.org"),
    );
    const branchB = cat(
      OP_APPEND,
      vb(hex("b1b2b3b4b5b6b7b8")), //    calendar B's nonce
      OP_SHA256,
      pendingAttestation("https://b.example.org"),
    );

    const client = createOtsClient({
      calendars: ["https://a.example.org", "https://b.example.org"],
      fetchImpl: fakeFetch((url) =>
        new Response(url.startsWith("https://a.") ? branchA : branchB),
      ),
    });

    const proof = await client.stamp(DIGEST_HEX);
    assert.ok(proof);
    // Two sibling branches: 0xff before the first (non-final) item only.
    const expected = cat(preamble(), ITEM_SEP, branchA, branchB);
    assert.equal(proof.toString("hex"), expected.toString("hex"));
  });

  it("keeps going when one calendar fails — ≥ 1 success suffices", async () => {
    const branchB = pendingAttestation("https://b.example.org");
    const client = createOtsClient({
      calendars: ["https://a.example.org", "https://b.example.org"],
      fetchImpl: fakeFetch((url) =>
        url.startsWith("https://a.")
          ? new Response("boom", { status: 500 })
          : new Response(branchB),
      ),
    });

    const proof = await client.stamp(DIGEST_HEX);
    assert.ok(proof);
    assert.equal(proof.toString("hex"), cat(preamble(), branchB).toString("hex"));
  });

  it("returns null when NO calendar answered", async () => {
    const client = createOtsClient({
      calendars: ["https://a.example.org", "https://b.example.org"],
      fetchImpl: fakeFetch(() => new Response("down", { status: 503 })),
    });
    assert.equal(await client.stamp(DIGEST_HEX), null);
  });

  it("throws synchronously on a malformed digest (programming error, not network)", () => {
    const client = createOtsClient({
      calendars: ["https://a.example.org"],
      fetchImpl: fakeFetch(() => {
        throw new Error("must not be called");
      }),
    });
    assert.throws(() => void client.stamp("abcd"), TypeError);
    assert.throws(() => void client.stamp(`${DIGEST_HEX}00`), TypeError);
    assert.throws(() => void client.stamp("z".repeat(64)), TypeError);
  });

  it("resolves null when the calendar never answers (timeout, no eternal pending)", async () => {
    const client = createOtsClient({
      calendars: ["https://slow.example.org"],
      // Never settles AND ignores the abort signal — the client must still bail.
      fetchImpl: () => new Promise<Response>(() => {}),
      timeoutMs: 40,
    });
    assert.equal(await client.stamp(DIGEST_HEX), null);
  });
});

/* ── round-trip ──────────────────────────────────────────────────────────── */

describe("parse → serialize is the identity on valid proofs", () => {
  const roundTrip = (proof: Buffer): void => {
    assert.equal(serializeOtsProof(parseOtsProof(proof)).toString("hex"), proof.toString("hex"));
  };

  it("simple pending proof", () => {
    roundTrip(cat(preamble(), pendingAttestation("https://a.example.org")));
  });

  it("multi-branch proof (two calendars behind 0xff separators)", () => {
    const branch = (nonce: string, uri: string): Buffer =>
      cat(OP_APPEND, vb(hex(nonce)), OP_SHA256, pendingAttestation(uri));
    roundTrip(
      cat(
        preamble(),
        ITEM_SEP,
        branch("a1a2a3a4a5a6a7a8", "https://a.example.org"),
        branch("b1b2b3b4b5b6b7b8", "https://b.example.org"),
      ),
    );
  });

  it("completed Bitcoin proof (append/prepend + sha256 + non-trivial height)", () => {
    // digest → append(nonce) → sha256 → { pending, prepend(prefix) → sha256 → bitcoin }
    const proof = cat(
      preamble(),
      OP_APPEND,
      vb(hex("0102030405060708")), //    calendar nonce
      OP_SHA256,
      ITEM_SEP, //                       two items at this node: pending, then op branch
      pendingAttestation("https://cal.example.org"),
      OP_PREPEND,
      vb(hex("deadbeef")), //            aggregation prefix
      OP_SHA256,
      bitcoinAttestation823714(),
    );
    roundTrip(proof);

    // Sanity: the parsed tree really carries the bitcoin height.
    const parsed = parseOtsProof(proof);
    const attestations = collectAttestations(parsed.root, DIGEST);
    assert.ok(
      attestations.some(
        (a) => a.attestation.kind === "bitcoin" && a.attestation.height === BITCOIN_HEIGHT,
      ),
    );
  });
});

/* ── upgrade ─────────────────────────────────────────────────────────────── */

describe("OtsClient.upgrade", () => {
  const NONCE = hex("0102030405060708");
  const PREFIX = hex("deadbeef");
  const CALENDAR = "https://cal.example.org";
  /** Pending proof as stored right after stamp(): append(nonce) → sha256 → pending. */
  const pendingProof = (): Buffer =>
    cat(preamble(), OP_APPEND, vb(NONCE), OP_SHA256, pendingAttestation(CALENDAR));
  /** The commitment the calendar was given = message at the pending node. */
  const COMMITMENT = sha256(cat(DIGEST, NONCE));

  it("grafts the Bitcoin continuation, reports complete, and stays coherent", async () => {
    // The calendar echoes the pending attestation (as real calendars may) plus
    // the completed branch: dedup must keep the pending exactly once.
    const continuation = cat(
      ITEM_SEP,
      pendingAttestation(CALENDAR),
      OP_PREPEND,
      vb(PREFIX),
      OP_SHA256,
      bitcoinAttestation823714(),
    );

    let requestedUrl = "";
    const client = createOtsClient({
      calendars: [],
      fetchImpl: fakeFetch((url, init) => {
        requestedUrl = url;
        const headers = init?.headers as Record<string, string> | undefined;
        assert.equal(headers?.Accept, "application/vnd.opentimestamps.v1");
        return new Response(continuation);
      }),
    });

    const { proof, complete } = await client.upgrade(pendingProof());
    assert.equal(complete, true);
    // cmds.py upgrade_timestamp: GET {calendar}/timestamp/{hex(commitment)}.
    assert.equal(requestedUrl, `${CALENDAR}/timestamp/${COMMITMENT.toString("hex")}`);

    // Exact expected bytes: the pending node now carries [pending, branch].
    const expected = cat(
      preamble(),
      OP_APPEND,
      vb(NONCE),
      OP_SHA256,
      ITEM_SEP,
      pendingAttestation(CALENDAR), //   kept (reference keeps it too), not duplicated
      OP_PREPEND,
      vb(PREFIX),
      OP_SHA256,
      bitcoinAttestation823714(),
    );
    assert.equal(proof.toString("hex"), expected.toString("hex"));

    // The upgraded proof reparses cleanly and round-trips.
    const parsed = parseOtsProof(proof);
    assert.equal(serializeOtsProof(parsed).toString("hex"), proof.toString("hex"));

    // Op-path coherence from the digest to the Bitcoin attestation:
    // sha256( prefix ‖ sha256( digest ‖ nonce ) ) is what block 823714 attests.
    const attestations = collectAttestations(parsed.root, DIGEST);
    const bitcoin = attestations.find((a) => a.attestation.kind === "bitcoin");
    assert.ok(bitcoin);
    assert.equal(bitcoin.msgHex, sha256(cat(PREFIX, COMMITMENT)).toString("hex"));
    assert.equal(bitcoin.attestation.kind === "bitcoin" && bitcoin.attestation.height, BITCOIN_HEIGHT);
  });

  it("404 from the calendar → complete:false and byte-identical proof", async () => {
    const input = pendingProof();
    const client = createOtsClient({
      calendars: [],
      fetchImpl: fakeFetch(() => new Response("not found", { status: 404 })),
    });
    const { proof, complete } = await client.upgrade(input);
    assert.equal(complete, false);
    assert.equal(proof.toString("hex"), input.toString("hex"));
  });

  it("already-complete proof → complete:true without touching the network", async () => {
    const completeProof = cat(
      preamble(),
      OP_APPEND,
      vb(NONCE),
      OP_SHA256,
      bitcoinAttestation823714(),
    );
    let calls = 0;
    const client = createOtsClient({
      calendars: [],
      fetchImpl: fakeFetch(() => {
        calls += 1;
        return new Response("must not be called", { status: 500 });
      }),
    });
    const { proof, complete } = await client.upgrade(completeProof);
    assert.equal(complete, true);
    assert.equal(calls, 0);
    assert.equal(proof.toString("hex"), completeProof.toString("hex"));
  });

  it("never throws when fetch itself blows up — proof returned unchanged", async () => {
    const input = pendingProof();
    const client = createOtsClient({
      calendars: [],
      fetchImpl: () => {
        throw new Error("connection reset");
      },
    });
    const { proof, complete } = await client.upgrade(input);
    assert.equal(complete, false);
    assert.equal(proof.toString("hex"), input.toString("hex"));
  });

  it("corrupted input proof → {unchanged, complete:false}, no network call", async () => {
    const garbage = Buffer.from("definitely not an ots proof", "utf8");
    let calls = 0;
    const client = createOtsClient({
      calendars: [],
      fetchImpl: fakeFetch(() => {
        calls += 1;
        return new Response("nope");
      }),
    });
    const { proof, complete } = await client.upgrade(garbage);
    assert.equal(complete, false);
    assert.equal(calls, 0);
    assert.equal(proof.toString("hex"), garbage.toString("hex"));
  });
});

/* ── hostile inputs ──────────────────────────────────────────────────────── */

describe("hostile inputs are rejected within bounds", () => {
  it("calendar response above the size cap is rejected (stamp → null)", async () => {
    const client = createOtsClient({
      calendars: ["https://a.example.org"],
      fetchImpl: fakeFetch(() => new Response(Buffer.alloc(64 * 1024 + 1, 0x00))),
    });
    assert.equal(await client.stamp(DIGEST_HEX), null);
  });

  it("giant varint (9 continuation bytes) is rejected", () => {
    // Bitcoin attestation whose height varint never terminates within 8 bytes.
    const bad = cat(
      preamble(),
      ATTESTATION,
      hex("0588960d73d71901"),
      vb(hex("ffffffffffffffff7f")), //  9-byte varint > 2^53 territory
    );
    assert.throws(() => parseOtsProof(bad), OtsParseError);
  });

  it("varbytes announcing more bytes than available is rejected", () => {
    const bad = cat(
      preamble(),
      ATTESTATION,
      hex("83dfe30d2ef90c8e"),
      hex("20"), //                      payload claims 32 bytes…
      hex("0102030405"), //              …but only 5 are present
    );
    assert.throws(() => parseOtsProof(bad), OtsParseError);
  });

  it("recursion depth is bounded (300 nested ops rejected, no stack overflow)", () => {
    const bad = cat(
      preamble(),
      Buffer.alloc(300, 0x08), //        300 nested sha256 edges
      pendingAttestation("https://a.example.org"),
    );
    assert.throws(() => parseOtsProof(bad), /too deep/);
  });

  it("trailing garbage after a valid proof is rejected", () => {
    const bad = cat(preamble(), pendingAttestation("https://a.example.org"), hex("00"));
    assert.throws(() => parseOtsProof(bad), OtsParseError);
  });

  it("a hostile parse failure during upgrade degrades to {unchanged, false}", async () => {
    // Valid pending proof, but the calendar answers with an oversized varint.
    const input = cat(
      preamble(),
      OP_APPEND,
      vb(hex("0102030405060708")),
      OP_SHA256,
      pendingAttestation("https://cal.example.org"),
    );
    const client = createOtsClient({
      calendars: [],
      fetchImpl: fakeFetch(() =>
        new Response(cat(hex("0588960d73d71901"))), // truncated garbage
      ),
    });
    const { proof, complete } = await client.upgrade(input);
    assert.equal(complete, false);
    assert.equal(proof.toString("hex"), input.toString("hex"));
  });
});
