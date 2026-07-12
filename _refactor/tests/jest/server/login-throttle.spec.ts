/**
 * Verrouillage progressif PAR COMPTE (pas par IP) — la défense qui reste
 * effective face à un attaquant distribué (rotation d'IP). L'état est un
 * module-singleton : chaque test utilise donc un e-mail dédié.
 */
import { LOGIN_THROTTLE } from "../../../apps/server/src/config/constants";
import {
  loginLockMs,
  recordLoginFailure,
  recordLoginSuccess,
} from "../../../apps/server/src/lib/login-throttle";

const LOCK_MS = LOGIN_THROTTLE.LOCK_SECONDS * 1000;
const MAX = LOGIN_THROTTLE.MAX_FAILS;

const failTimes = (email: string, n: number): void => {
  for (let i = 0; i < n; i += 1) recordLoginFailure(email);
};

describe("login-throttle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-10T12:00:00Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it(`${MAX - 1} échecs ne verrouillent pas ; le ${MAX}e verrouille pour LOCK_SECONDS`, () => {
    const email = "t1@ecole.fr";
    failTimes(email, MAX - 1);
    expect(loginLockMs(email)).toBe(0);
    recordLoginFailure(email);
    expect(loginLockMs(email)).toBe(LOCK_MS);
  });

  it("le verrou expire après LOCK_SECONDS", () => {
    const email = "t2@ecole.fr";
    failTimes(email, MAX);
    jest.advanceTimersByTime(LOCK_MS - 1000);
    expect(loginLockMs(email)).toBe(1000);
    jest.advanceTimersByTime(1001);
    expect(loginLockMs(email)).toBe(0);
  });

  it("après expiration du verrou, le compteur repart de zéro", () => {
    const email = "t3@ecole.fr";
    failTimes(email, MAX);
    jest.advanceTimersByTime(LOCK_MS + 1);
    // 1er échec de la nouvelle fenêtre : pas de re-verrouillage immédiat…
    recordLoginFailure(email);
    expect(loginLockMs(email)).toBe(0);
    // …mais la fenêtre neuve compte bien jusqu'au seuil.
    failTimes(email, MAX - 1);
    expect(loginLockMs(email)).toBe(LOCK_MS);
  });

  it("un login réussi purge l'état du compte", () => {
    const email = "t4@ecole.fr";
    failTimes(email, MAX - 1);
    recordLoginSuccess(email);
    failTimes(email, MAX - 1);
    expect(loginLockMs(email)).toBe(0);
    recordLoginFailure(email);
    expect(loginLockMs(email)).toBe(LOCK_MS);
  });

  it("la clé est normalisée (casse + espaces) — impossible de contourner en variant l'adresse", () => {
    failTimes("  Admin@Ecole.FR  ", MAX - 2);
    failTimes("admin@ecole.fr", 2);
    expect(loginLockMs("ADMIN@ECOLE.FR")).toBe(LOCK_MS);
  });
});
