import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportJWK, generateKeyPair } from "jose";

import {
  STATUS_LIST_INITIAL_CAPACITY,
  STATUS_LIST_TOKEN_TYPE,
  buildStatusListToken,
  decodeStatusList,
  encodeStatusList,
  pickRandomStatusListIndex,
  statusListCapacity,
  verifyStatusListToken,
} from "../../../src/modules/vc/status-list";

const oneBitVector = [1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1];
const twoBitVector = [1, 2, 0, 3, 0, 1, 0, 1, 1, 2, 3, 3];

describe("Token Status List encoding (draft-21)", () => {
  it("matches the official 1-bit LSB-first + ZLIB test vector", () => {
    const encoded = encodeStatusList(oneBitVector, 1);
    assert.equal(encoded, "eNrbuRgAAhcBXQ");
    assert.deepEqual(decodeStatusList(encoded, 1, oneBitVector.length), oneBitVector);
  });

  it("matches the official 2-bit test vector", () => {
    const encoded = encodeStatusList(twoBitVector, 2);
    assert.equal(encoded, "eNo76fITAAPfAgc");
    assert.deepEqual(decodeStatusList(encoded, 2, twoBitVector.length), twoBitVector);
  });

  it("rejects invalid values, malformed encoding, and decompression beyond the bound", () => {
    assert.throws(() => encodeStatusList([], 1), /at least one entry/);
    assert.throws(() => encodeStatusList([0, 2], 1), /does not fit/);
    assert.throws(() => decodeStatusList("not+base64", 1), /base64url/);
    assert.throws(
      () => decodeStatusList(encodeStatusList(oneBitVector, 1), 1, 7),
      /bounded ZLIB\/DEFLATE/,
    );
  });
});

describe("Status List index allocation helpers", () => {
  it("extends capacity only above 75 percent occupancy", () => {
    assert.equal(statusListCapacity(0), STATUS_LIST_INITIAL_CAPACITY);
    assert.equal(statusListCapacity(3_072), 4_096);
    assert.equal(statusListCapacity(3_073), 8_192);
    assert.equal(statusListCapacity(6_145), 16_384);
  });

  it("selects uniformly-ranked free indexes without duplicates", () => {
    const used = new Set<number>();
    for (let sequence = 0; sequence < 500; sequence += 1) {
      const selected = pickRandomStatusListIndex(used, (maximum) => (sequence * 977) % maximum);
      assert.equal(used.has(selected.index), false);
      assert.equal(selected.capacity, STATUS_LIST_INITIAL_CAPACITY);
      used.add(selected.index);
    }
    assert.equal(used.size, 500);
  });

  it("maps a free-set rank to the correct sparse index", () => {
    assert.deepEqual(pickRandomStatusListIndex([0, 2], () => 0), {
      index: 1,
      capacity: STATUS_LIST_INITIAL_CAPACITY,
    });
    assert.deepEqual(pickRandomStatusListIndex([0, 2], () => 1), {
      index: 3,
      capacity: STATUS_LIST_INITIAL_CAPACITY,
    });
  });
});

describe("Status List Token JWT", () => {
  it("signs and verifies exact statuslist+jwt claims with ES256", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    const issuer = "https://issuer.certifychain.test";
    const uri = `${issuer}/vc/status/1`;
    const token = await buildStatusListToken({
      issuer,
      uri,
      issuerKid: "vc-es256-2026-01",
      issuerPrivateKey: privateKey,
      statuses: oneBitVector,
      bits: 1,
      ttlSeconds: 300,
      issuedAt: 1_783_814_400,
    });

    const verified = await verifyStatusListToken(token, {
      issuerPublicKey: publicJwk,
      issuer,
      uri,
      issuerKid: "vc-es256-2026-01",
      maxEntries: oneBitVector.length,
    });
    assert.deepEqual(verified.protectedHeader, {
      alg: "ES256",
      typ: STATUS_LIST_TOKEN_TYPE,
      kid: "vc-es256-2026-01",
    });
    assert.equal(verified.payload.iss, issuer);
    assert.equal(verified.payload.sub, uri);
    assert.equal(verified.payload.iat, 1_783_814_400);
    assert.equal(verified.payload.ttl, 300);
    assert.deepEqual(verified.payload.status_list, {
      bits: 1,
      lst: "eNrbuRgAAhcBXQ",
    });
    assert.deepEqual(verified.statuses, oneBitVector);

    const foreign = await generateKeyPair("ES256", { extractable: true });
    await assert.rejects(
      verifyStatusListToken(token, { issuerPublicKey: await exportJWK(foreign.publicKey) }),
    );
  });
});
