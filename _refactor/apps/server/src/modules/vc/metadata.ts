import type { JWK } from "jose";
import { VC } from "../../config/constants";
import {
  VC_CREDENTIAL_CONFIGURATION_ID,
  VC_ISSUER,
  VC_PRE_AUTHORIZED_GRANT,
} from "./issuer";

const claim = (name: string, label: string) => ({
  path: [name],
  display: [{ name: label, locale: "fr-FR" }],
});

export function credentialIssuerMetadata() {
  return {
    credential_issuer: VC_ISSUER,
    credential_endpoint: `${VC_ISSUER}/vc/credential`,
    nonce_endpoint: `${VC_ISSUER}/vc/nonce`,
    display: [{ name: "CertifyChain", locale: "fr-FR" }],
    credential_configurations_supported: {
      [VC_CREDENTIAL_CONFIGURATION_ID]: {
        format: "dc+sd-jwt",
        vct: VC.VCT,
        cryptographic_binding_methods_supported: ["jwk"],
        credential_signing_alg_values_supported: ["ES256"],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ["ES256"] },
        },
        credential_metadata: {
          display: [{ name: "Diplôme certifié", locale: "fr-FR" }],
          claims: [
            claim("holder_name", "Titulaire"),
            claim("program_title", "Intitulé de la certification"),
            claim("mention", "Mention"),
            claim("rncp", "Code RNCP"),
            claim("issued_at", "Date d’obtention"),
            claim("school_name", "Établissement"),
            claim("school_siret", "SIRET de l’établissement"),
            claim("diploma_id", "Identifiant du diplôme"),
          ],
        },
      },
    },
  } as const;
}

export function authorizationServerMetadata() {
  return {
    issuer: VC_ISSUER,
    token_endpoint: `${VC_ISSUER}/vc/oauth/token`,
    grant_types_supported: [VC_PRE_AUTHORIZED_GRANT],
    token_endpoint_auth_methods_supported: ["none"],
    "pre-authorized_grant_anonymous_access_supported": true,
  } as const;
}

export function jwtVcIssuerMetadata(keys: JWK[]) {
  return { issuer: VC_ISSUER, jwks: { keys } };
}
