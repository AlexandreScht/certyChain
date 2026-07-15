import { SignJWT, jwtVerify } from "jose";
import { VC } from "../../config/constants";
import { env } from "../../config/env";
import { uuid } from "../../lib/ids";
import { VC_ISSUER } from "./issuer";

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const VC_ACCESS_AUDIENCE = "vc";
const VC_NONCE_AUDIENCE = "vc-nonce";

export async function signVcAccessToken(offerId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(offerId)
    .setIssuer(VC_ISSUER)
    .setAudience(VC_ACCESS_AUDIENCE)
    .setIssuedAt()
    .setJti(uuid())
    .setExpirationTime(`${VC.TOKEN_TTL_SEC}s`)
    .sign(secret);
}

export async function verifyVcAccessToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: VC_ISSUER,
    audience: VC_ACCESS_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("VC access token has no subject");
  }
  return payload.sub;
}

/** Stateless, short-lived challenge used only inside an ES256 holder proof. */
export async function signVcNonce(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(VC_ISSUER)
    .setAudience(VC_NONCE_AUDIENCE)
    .setIssuedAt()
    .setJti(uuid())
    .setExpirationTime(`${VC.NONCE_TTL_SEC}s`)
    .sign(secret);
}

export async function verifyVcNonce(nonce: string): Promise<void> {
  const { payload } = await jwtVerify(nonce, secret, {
    issuer: VC_ISSUER,
    audience: VC_NONCE_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    throw new Error("VC nonce has no identifier");
  }
}
