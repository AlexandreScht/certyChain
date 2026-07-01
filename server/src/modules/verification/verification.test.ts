import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { normalizeSiret } from "../../lib/proconnect";
import { verifyWebhookSignature } from "../../lib/stripe";
import { dnsRecordValue, dnsTxtMatches, domainFromEmail } from "./verification.service";

/* ── Stripe webhook signature (the gate before any postal dispatch) ───────── */

function stripeSig(body: string, secret: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const EVT = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { client_reference_id: "ver_1" } },
});
const SECRET = "whsec_test_secret";
const NOW = 1_700_000_000;

test("stripe webhook: accepts a valid signature and parses the event", () => {
  const evt = verifyWebhookSignature(EVT, stripeSig(EVT, SECRET, NOW), SECRET, 300, NOW);
  assert.equal(evt?.type, "checkout.session.completed");
});

test("stripe webhook: rejects a tampered body", () => {
  const header = stripeSig(EVT, SECRET, NOW);
  assert.equal(verifyWebhookSignature(`${EVT} `, header, SECRET, 300, NOW), null);
});

test("stripe webhook: rejects a wrong secret", () => {
  const header = stripeSig(EVT, "whsec_other", NOW);
  assert.equal(verifyWebhookSignature(EVT, header, SECRET, 300, NOW), null);
});

test("stripe webhook: rejects a stale timestamp (replay)", () => {
  const header = stripeSig(EVT, SECRET, NOW - 10_000);
  assert.equal(verifyWebhookSignature(EVT, header, SECRET, 300, NOW), null);
});

test("stripe webhook: rejects a missing header / missing v1 / empty secret", () => {
  assert.equal(verifyWebhookSignature(EVT, undefined, SECRET), null);
  assert.equal(verifyWebhookSignature(EVT, `t=${NOW}`, SECRET, 300, NOW), null);
  assert.equal(verifyWebhookSignature(EVT, stripeSig(EVT, SECRET, NOW), "", 300, NOW), null);
});

/* ── SIRET normalization (ProConnect identity match) ──────────────────────── */

test("normalizeSiret: keeps only digits, so formatting can't bypass the match", () => {
  assert.equal(normalizeSiret(" 123 456 789 01234 "), "12345678901234");
  assert.equal(normalizeSiret("123-456"), "123456");
  assert.equal(normalizeSiret(null), "");
  assert.equal(
    normalizeSiret("130 025 265 00013"),
    normalizeSiret("13002526500013"),
  );
});

/* ── DNS TXT matching (control proof) ─────────────────────────────────────── */

test("dnsTxtMatches: finds the token, including across chunked TXT segments", () => {
  const token = "Zm9vYmFy_token-24";
  const value = dnsRecordValue(token);
  assert.equal(value, `certifychain-verify=${token}`);
  assert.equal(dnsTxtMatches([["unrelated"], [value]], token), true);
  // Postgres/DNS may split a TXT value into chunks — they must be joined first.
  assert.equal(dnsTxtMatches([["certifychain-verify=", token]], token), true);
  assert.equal(dnsTxtMatches([["certifychain-verify=wrong"]], token), false);
  assert.equal(dnsTxtMatches([], token), false);
});

/* ── Email → domain (DNS-proof anchor) ────────────────────────────────────── */

test("domainFromEmail: extracts and lowercases the host, rejects invalid input", () => {
  assert.equal(domainFromEmail("direction@univ-lyon.fr"), "univ-lyon.fr");
  assert.equal(domainFromEmail("Dir@Univ-Lyon.FR"), "univ-lyon.fr");
  assert.equal(domainFromEmail("no-at-sign"), null);
  assert.equal(domainFromEmail("user@localhost"), null);
  assert.equal(domainFromEmail(null), null);
});
