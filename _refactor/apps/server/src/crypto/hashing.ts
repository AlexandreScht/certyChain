import { createHash } from "node:crypto";

/** Deterministic canonical JSON (recursively sorted keys, no whitespace). */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** The exact, signed representation of a diploma. Changing this breaks signatures. */
export interface DiplomaPayload {
  id: string;
  schoolId: string;
  holderName: string;
  holderEmail: string;
  programTitle: string;
  mention: string | null;
  /** RNCP code of the certified title (part of the signed, attested content). */
  rncp: string | null;
  issuedAt: string; // YYYY-MM-DD
  externalId: string | null;
}

/** Hex SHA-256 of the canonical diploma payload (the value schools sign). */
export function hashDiplomaPayload(payload: DiplomaPayload): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}

/**
 * The `ed25519-sd-v2` signed object (v2.md §V1-2). Only `id`/`schoolId` stay
 * permanently visible (the verifier needs them to resolve the school before any
 * check); every disclosable field is represented ONLY by its salted digest in
 * `_sd`. `_sd` MUST be sorted lexicographically — otherwise the digest order
 * would leak which digest is which field (a security requirement, not style).
 */
export interface SdPayloadV2 {
  v: "sd-v2";
  h: "sha-256";
  id: string;
  schoolId: string;
  /** Salted per-field digests, sorted lexicographically. */
  _sd: string[];
}

/** Hex SHA-256 of the canonical SdPayloadV2 (the value v2 schools sign). */
export function hashSdPayloadV2(p: SdPayloadV2): string {
  return createHash("sha256").update(canonicalize(p), "utf8").digest("hex");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
