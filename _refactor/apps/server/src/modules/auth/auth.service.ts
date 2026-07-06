import { hashPassword } from "../../lib/password";

/**
 * A constant dummy scrypt hash used to keep the login path's timing constant
 * when the requested admin does not exist. We still run a full `verifyPassword`
 * against it so an attacker cannot distinguish "unknown email" from "wrong
 * password" by response latency (anti-enumeration / timing leak).
 *
 * Computed lazily once (the format must match what `verifyPassword` expects),
 * then cached for the lifetime of the process.
 */
let dummyHashPromise: Promise<string> | null = null;

export function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("certifychain-dummy-password-do-not-use");
  }
  return dummyHashPromise;
}
