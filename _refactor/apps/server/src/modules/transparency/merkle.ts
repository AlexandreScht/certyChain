import {
  consistencyProofHex,
  inclusionProofHex,
  merkleLeafHash,
  merkleRootHex,
} from "@certifychain/shared/crypto/merkle";
import { bytesToHex } from "@certifychain/shared/crypto/primitives";
import { canonicalize } from "../../crypto/hashing";

/**
 * Server-side Merkle facade for the transparency log (v2.md §V3-2). The tree
 * math is the SINGLE shared RFC 6962 implementation in `packages/shared`
 * (piège n°6 — same module the browser verifier runs); this file only
 * re-exports it and adds the leaf builder, which needs the server-side
 * `canonicalize` and Buffer.
 */

export { consistencyProofHex, inclusionProofHex, merkleLeafHash, merkleRootHex };

/** Feuille du journal (v2.md §V3-1) : canonicalize + hash feuille RFC 6962. AUCUNE PII. */
export function buildIssuanceLeaf(args: {
  diplomaId: string;
  schoolId: string;
  payloadHash: string;
  signature: string;
  issuedAt: string;
}): { leafBytes: Buffer; leafHashHex: string } {
  const leafBytes = Buffer.from(
    canonicalize({
      diplomaId: args.diplomaId,
      schoolId: args.schoolId,
      payloadHash: args.payloadHash,
      signature: args.signature,
      issuedAt: args.issuedAt,
    }),
    "utf8",
  );
  return { leafBytes, leafHashHex: bytesToHex(merkleLeafHash(leafBytes)) };
}
