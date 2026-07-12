/** Portes d'authentification : TOTP (RFC 6238), OTP e-mail hashé, scrypt. */
import { generateOtp, hashOtp, verifyOtp } from "../../../apps/server/src/lib/otp";
import { hashPassword, verifyPassword } from "../../../apps/server/src/lib/password";
import { generateTotp, generateTotpSecret, verifyTotp } from "../../../apps/server/src/lib/totp";

describe("TOTP", () => {
  const secret = generateTotpSecret();
  const t = 1_770_000_000_000; // instant fixe → codes déterministes

  it("génère un secret base32 de 160 bits", () => {
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepte le code de l'instant courant", () => {
    expect(verifyTotp(generateTotp(secret, t), secret, t)).toBe(true);
  });

  it("tolère ±1 pas de dérive d'horloge", () => {
    const prev = generateTotp(secret, t - 30_000);
    const next = generateTotp(secret, t + 30_000);
    expect(verifyTotp(prev, secret, t)).toBe(true);
    expect(verifyTotp(next, secret, t)).toBe(true);
  });

  it("refuse un code hors fenêtre (±2 pas)", () => {
    const stale = generateTotp(secret, t - 90_000);
    expect(verifyTotp(stale, secret, t)).toBe(false);
  });

  it("refuse un format invalide sans jeter", () => {
    expect(verifyTotp("12345", secret, t)).toBe(false);
    expect(verifyTotp("abcdef", secret, t)).toBe(false);
    expect(verifyTotp("", secret, t)).toBe(false);
  });

  it("tolère les espaces autour du code saisi", () => {
    expect(verifyTotp(` ${generateTotp(secret, t)} `, secret, t)).toBe(true);
  });
});

describe("OTP e-mail", () => {
  it("génère 6 chiffres", () => {
    expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("vérifie le bon code et refuse un autre", () => {
    const code = generateOtp();
    const hash = hashOtp(code);
    expect(verifyOtp(code, hash)).toBe(true);
    expect(verifyOtp("000000" === code ? "111111" : "000000", hash)).toBe(false);
  });

  it("ne stocke jamais le code en clair (HMAC hex)", () => {
    const code = generateOtp();
    const hash = hashOtp(code);
    expect(hash).not.toContain(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("scrypt (mots de passe admins)", () => {
  it("hash → verify roundtrip", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  }, 20_000);

  it("refuse un mauvais mot de passe", async () => {
    const hash = await hashPassword("bon-mot-de-passe-123");
    expect(await verifyPassword("mauvais-mot-de-passe", hash)).toBe(false);
  }, 20_000);

  it("refuse un hash stocké mal formé sans jeter", async () => {
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });

  it("le format est auto-descriptif (scrypt$N$r$p$salt$dk)", async () => {
    const hash = await hashPassword("abcdefghijklm");
    expect(hash.split("$")[0]).toBe("scrypt");
    expect(hash.split("$")).toHaveLength(6);
  }, 20_000);
});
