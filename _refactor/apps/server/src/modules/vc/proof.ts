import {
  calculateJwkThumbprint,
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
} from "jose";
import { isHolderP256Jwk } from "./keys";
import { VC_ISSUER } from "./issuer";
import { VcProtocolError } from "./protocol";
import { verifyVcNonce } from "./tokens";

const MAX_PROOF_BYTES = 16 * 1024;
const MAX_IAT_SKEW_SECONDS = 5 * 60;

export interface VerifiedHolderProof {
  holderJwk: JWK;
  jkt: string;
}

/** Verify the complete OpenID4VCI JWT key proof before consuming any offer. */
export async function verifyHolderProof(proof: string): Promise<VerifiedHolderProof> {
  if (!proof || Buffer.byteLength(proof, "utf8") > MAX_PROOF_BYTES) {
    throw new VcProtocolError("invalid_proof");
  }

  let holderJwk: JWK;
  try {
    const header = decodeProtectedHeader(proof);
    if (
      header.typ !== "openid4vci-proof+jwt" ||
      header.alg !== "ES256" ||
      header.kid !== undefined ||
      header.x5c !== undefined ||
      !isHolderP256Jwk(header.jwk)
    ) {
      throw new Error("unsupported proof header");
    }
    holderJwk = header.jwk;
  } catch {
    throw new VcProtocolError("invalid_proof");
  }

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    const key = await importJWK(holderJwk, "ES256");
    ({ payload } = await jwtVerify(proof, key, {
      audience: VC_ISSUER,
      algorithms: ["ES256"],
    }));
  } catch {
    throw new VcProtocolError("invalid_proof");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.iss !== undefined ||
    payload.aud !== VC_ISSUER ||
    typeof payload.iat !== "number" ||
    Math.abs(now - payload.iat) > MAX_IAT_SKEW_SECONDS ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length === 0
  ) {
    throw new VcProtocolError("invalid_proof");
  }

  try {
    await verifyVcNonce(payload.nonce);
  } catch {
    throw new VcProtocolError("invalid_nonce");
  }

  return {
    holderJwk,
    jkt: await calculateJwkThumbprint(holderJwk, "sha256"),
  };
}
