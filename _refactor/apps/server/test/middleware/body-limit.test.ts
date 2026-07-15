import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CDC_UPLOAD_LIMITS } from "@certifychain/contract/constants";
import { createApp } from "../../src/app";

const MIB = 1024 * 1024;

/**
 * Body-limit trusts Content-Length when Transfer-Encoding is absent. A one-byte
 * body plus a declared length lets these boundary tests stay allocation-free;
 * none of the probe handlers consumes the accepted request body.
 */
async function postWithDeclaredSize(path: string, bytes: number): Promise<Response> {
  return await createApp().request(path, {
    method: "POST",
    headers: {
      "content-length": String(bytes),
      "content-type": "application/octet-stream",
    },
    body: "x",
  });
}

async function assertAcceptedByBodyLimit(path: string, bytes: number): Promise<void> {
  const response = await postWithDeclaredSize(path, bytes);
  assert.notEqual(response.status, 413, `${path} should accept ${bytes} bytes`);
}

async function assertPayloadTooLarge(path: string, bytes: number): Promise<void> {
  const response = await postWithDeclaredSize(path, bytes);
  assert.equal(response.status, 413, `${path} should reject ${bytes} bytes`);
  assert.deepEqual(await response.json(), {
    error: {
      code: "payload_too_large",
      message: "Charge utile trop volumineuse",
    },
  });
}

describe("global route-aware body limit", () => {
  it("keeps the default limit at exactly 1 MiB", async () => {
    await assertAcceptedByBodyLimit("/body-limit-default-probe", MIB);
    await assertPayloadTooLarge("/body-limit-default-probe", MIB + 1);
  });

  it("allows exactly 5 MiB only for the diploma CSV import", async () => {
    await assertAcceptedByBodyLimit("/diplomas/import", 5 * MIB);
    await assertPayloadTooLarge("/diplomas/import", 5 * MIB + 1);

    // A neighbouring diploma route still uses the default ceiling.
    await assertPayloadTooLarge("/diplomas/not-import", MIB + 1);
  });

  it("allows exactly 2 MiB for the CDC identity import", async () => {
    await assertAcceptedByBodyLimit(
      "/cdc/identities/import",
      CDC_UPLOAD_LIMITS.identityCsv,
    );
    await assertPayloadTooLarge(
      "/cdc/identities/import",
      CDC_UPLOAD_LIMITS.identityCsv + 1,
    );
  });

  it("allows exactly 2 MiB for a CDC CRT upload, including a query string", async () => {
    const path = "/cdc/exports/123e4567-e89b-12d3-a456-426614174000/crt?source=manual";
    await assertAcceptedByBodyLimit(path, CDC_UPLOAD_LIMITS.crt);
    await assertPayloadTooLarge(path, CDC_UPLOAD_LIMITS.crt + 1);
  });

  it("does not grant 2 MiB to neighbouring CDC paths", async () => {
    await assertPayloadTooLarge("/cdc/exports/not-a-crt/file", MIB + 1);
    await assertPayloadTooLarge("/cdc/identities/import-extra", MIB + 1);
  });
});
