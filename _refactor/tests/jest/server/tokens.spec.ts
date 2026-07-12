/** Jetons JWT : access (session) vs MFA (défi) — audiences bien séparées. */
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signMfaToken,
  verifyAccessToken,
  verifyMfaToken,
} from "../../../apps/server/src/lib/tokens";

describe("access token", () => {
  it("roundtrip des claims (sub, role, email, schoolId)", async () => {
    const token = await signAccessToken({
      sub: "admin-1",
      role: "school_admin",
      email: "admin@ecole.fr",
      schoolId: "school-1",
    });
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual({
      sub: "admin-1",
      role: "school_admin",
      email: "admin@ecole.fr",
      schoolId: "school-1",
    });
  });

  it("schoolId absent pour un élève", async () => {
    const token = await signAccessToken({ sub: "stu-1", role: "student", email: "e@x.fr" });
    const claims = await verifyAccessToken(token);
    expect(claims.schoolId).toBeUndefined();
  });

  it("refuse un token altéré", async () => {
    const token = await signAccessToken({ sub: "s", role: "student", email: "e@x.fr" });
    await expect(verifyAccessToken(`${token}x`)).rejects.toThrow();
  });
});

describe("MFA token (défi entre les deux étapes de login)", () => {
  it("roundtrip realm + purpose", async () => {
    const token = await signMfaToken(
      { sub: "adm-1", role: "admin", realm: "admin", purpose: "mfa_verify" },
      300,
    );
    const claims = await verifyMfaToken(token);
    expect(claims.realm).toBe("admin");
    expect(claims.purpose).toBe("mfa_verify");
    expect(claims.sub).toBe("adm-1");
  });

  it("un access token n'est PAS accepté comme jeton MFA (audience)", async () => {
    const access = await signAccessToken({ sub: "s", role: "student", email: "e@x.fr" });
    await expect(verifyMfaToken(access)).rejects.toThrow();
  });

  it("un jeton MFA n'est PAS accepté comme access token (audience)", async () => {
    const mfa = await signMfaToken(
      { sub: "s", role: "school_admin", realm: "public", purpose: "mfa_enroll" },
      300,
    );
    await expect(verifyAccessToken(mfa)).rejects.toThrow();
  });
});

describe("refresh token opaque", () => {
  it("est aléatoire et hashé en SHA-256 hex pour le stockage", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).not.toBe(hashRefreshToken(b));
  });
});
