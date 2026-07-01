import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env";
import { sha256Hex } from "../crypto/hashing";
import type { Role } from "../contract/enums";

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = "certifychain";
const AUDIENCE = "certifychain-web";
const MFA_AUDIENCE = "certifychain-mfa";

export interface AccessClaims {
  sub: string;
  role: Role;
  email: string;
  schoolId?: string;
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, email: claims.email, schoolId: claims.schoolId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return {
    sub: String(payload.sub),
    role: payload.role as Role,
    email: String(payload.email),
    schoolId: (payload.schoolId as string | undefined) ?? undefined,
  };
}

/** Refresh tokens are opaque random strings, stored only as a SHA-256 hash. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}
export function hashRefreshToken(token: string): string {
  return sha256Hex(token);
}

/* ── MFA "pending" token (between the password and TOTP login steps) ──────── */

export interface MfaClaims {
  sub: string;
  role: Role;
  realm: "public" | "admin";
  purpose: "mfa_enroll" | "mfa_verify";
}

export async function signMfaToken(claims: MfaClaims, ttlSeconds: number): Promise<string> {
  return new SignJWT({ role: claims.role, realm: claims.realm, purpose: claims.purpose })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(accessSecret);
}

export async function verifyMfaToken(token: string): Promise<MfaClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: MFA_AUDIENCE,
  });
  return {
    sub: String(payload.sub),
    role: payload.role as Role,
    realm: payload.realm as "public" | "admin",
    purpose: payload.purpose as "mfa_enroll" | "mfa_verify",
  };
}
