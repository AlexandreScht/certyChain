import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anonymizeIp } from "./net";

describe("anonymizeIp (RGPD IP pseudonymization)", () => {
  it("never returns the raw IP", () => {
    const h = anonymizeIp("203.0.113.7");
    assert.notEqual(h, "203.0.113.7");
    assert.match(h, /^[0-9a-f]{32}$/);
  });

  it("is stable for the same input", () => {
    assert.equal(anonymizeIp("203.0.113.7"), anonymizeIp("203.0.113.7"));
  });

  it("collapses an IPv4 /24 to a single bucket (k-anonymity)", () => {
    assert.equal(anonymizeIp("203.0.113.7"), anonymizeIp("203.0.113.250"));
  });

  it("distinguishes different /24 networks", () => {
    assert.notEqual(anonymizeIp("203.0.113.7"), anonymizeIp("203.0.114.7"));
  });

  it("collapses an IPv6 /48 to a single bucket", () => {
    assert.equal(
      anonymizeIp("2001:db8:abcd:0001::1"),
      anonymizeIp("2001:db8:abcd:ffff::99"),
    );
  });
});
