import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOGIN_THROTTLE } from "../config/constants";
import { loginLockMs, recordLoginFailure, recordLoginSuccess } from "./login-throttle";

describe("login throttle (per-account lockout)", () => {
  it("does not lock before reaching the failure threshold", () => {
    const email = "a@throttle.test";
    for (let i = 0; i < LOGIN_THROTTLE.MAX_FAILS - 1; i++) recordLoginFailure(email);
    assert.equal(loginLockMs(email), 0);
  });

  it("locks the account once the threshold is hit", () => {
    const email = "b@throttle.test";
    for (let i = 0; i < LOGIN_THROTTLE.MAX_FAILS; i++) recordLoginFailure(email);
    const ms = loginLockMs(email);
    assert.ok(ms > 0, "should be locked");
    assert.ok(ms <= LOGIN_THROTTLE.LOCK_SECONDS * 1000);
  });

  it("a successful login clears the throttle state", () => {
    const email = "c@throttle.test";
    for (let i = 0; i < LOGIN_THROTTLE.MAX_FAILS; i++) recordLoginFailure(email);
    assert.ok(loginLockMs(email) > 0);
    recordLoginSuccess(email);
    assert.equal(loginLockMs(email), 0);
  });

  it("keys on the email case-insensitively", () => {
    for (let i = 0; i < LOGIN_THROTTLE.MAX_FAILS; i++) recordLoginFailure("Case@Throttle.Test");
    assert.ok(loginLockMs("case@throttle.test") > 0, "lock must apply regardless of case");
  });

  it("unknown accounts are never locked", () => {
    assert.equal(loginLockMs("never-seen@throttle.test"), 0);
  });
});
