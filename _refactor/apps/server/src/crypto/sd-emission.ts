import { DISCLOSABLE_FIELDS, type DisclosableField } from "@certifychain/contract/enums";
import { digestOf, makeDisclosure, type Disclosure } from "./disclosures";
import { hashSdPayloadV2, hashSdPayloadV3, type SdPayloadV2, type SdPayloadV3 } from "./hashing";

/**
 * Pure `ed25519-sd-v2` emission core (v2.md §V1-4) — zero I/O, fully testable.
 *
 * ALWAYS builds the 7 disclosures, INCLUDING null-valued fields (`mention`,
 * `rncp`, `externalId`): a field absent from `_sd` would reveal by subtraction
 * that it is null (piège n°3). `_sd` is SORTED lexicographically so the digest
 * order can't leak which digest is which field (piège n°2). Salts must stay
 * secret at rest for undisclosed fields — the caller encrypts the returned dict
 * with the KeyVault before persisting.
 */

/** The disclosable values of a diploma at emission time. */
export type SdEmissionFields = Record<DisclosableField, string | null> & {
  holderName: string;
  holderEmail: string;
  programTitle: string;
  issuedAt: string;
};

export interface SdEmission {
  /** Field → disclosure (base64url [salt, name, value]) — ALL 7, to encrypt at rest. */
  disclosureByField: Record<DisclosableField, Disclosure>;
  /** The exact object that gets signed (its `_sd` is sorted). */
  sdPayload: SdPayloadV2;
  /** Hex SHA-256 of the canonical sdPayload — feed to `signDiplomaHash`. */
  payloadHash: string;
}

export function buildSdV2Emission(
  diplomaId: string,
  schoolId: string,
  fields: SdEmissionFields,
): SdEmission {
  const disclosureByField = {} as Record<DisclosableField, Disclosure>;
  for (const field of DISCLOSABLE_FIELDS) {
    disclosureByField[field] = makeDisclosure(field, fields[field]);
  }
  const sdPayload: SdPayloadV2 = {
    v: "sd-v2",
    h: "sha-256",
    id: diplomaId,
    schoolId,
    _sd: Object.values(disclosureByField).map(digestOf).sort(),
  };
  return { disclosureByField, sdPayload, payloadHash: hashSdPayloadV2(sdPayload) };
}

export interface SdV3Emission {
  /** Field → disclosure (base64url [salt, name, value]) — ALL 7, to encrypt at rest. */
  disclosureByField: Record<DisclosableField, Disclosure>;
  /** The exact object that gets signed TWICE (Ed25519 AND ML-DSA-65, same hash). */
  sdPayload: SdPayloadV3;
  /** Hex SHA-256 of the canonical sdPayload — feed to BOTH signers. */
  payloadHash: string;
}

/**
 * `ed25519-sd-v3` emission core (v2.md §V4-1) — hybrid post-quantum. Deliberately
 * a SEPARATE function from {@link buildSdV2Emission} (not a shared refactor):
 * the disclosure/digest mechanics are identical, but keeping the two emission
 * paths textually independent means a change here can never silently alter the
 * v2 path a diploma emitted years ago still depends on.
 */
export function buildSdV3Emission(
  diplomaId: string,
  schoolId: string,
  fields: SdEmissionFields,
): SdV3Emission {
  const disclosureByField = {} as Record<DisclosableField, Disclosure>;
  for (const field of DISCLOSABLE_FIELDS) {
    disclosureByField[field] = makeDisclosure(field, fields[field]);
  }
  const sdPayload: SdPayloadV3 = {
    v: "sd-v3",
    h: "sha-256",
    id: diplomaId,
    schoolId,
    _sd: Object.values(disclosureByField).map(digestOf).sort(),
  };
  return { disclosureByField, sdPayload, payloadHash: hashSdPayloadV3(sdPayload) };
}
