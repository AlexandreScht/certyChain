import { env } from "../../config/env";

/** Canonical origin used by every OID4VCI URL, audience and issuer claim. */
export const VC_ISSUER = new URL(env.PUBLIC_API_ORIGIN).origin;

export const VC_CREDENTIAL_CONFIGURATION_ID = "certifychain-diploma";
export const VC_PRE_AUTHORIZED_GRANT =
  "urn:ietf:params:oauth:grant-type:pre-authorized_code";
