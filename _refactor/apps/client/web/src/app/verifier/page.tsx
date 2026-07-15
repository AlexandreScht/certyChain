import type { Metadata } from "next";
import { OfflineVerifier } from "@/components/verify/OfflineVerifier";

export const metadata: Metadata = {
  title: "Vérificateur hors ligne — CertifyChain",
  description:
    "Vérifiez une preuve de diplôme CertifyChain vous-même : la vérification cryptographique s'exécute entièrement dans votre navigateur, sans compte et sans réseau.",
};

/**
 * Public, account-less, offline verifier. Static Server Component shell that
 * hands off to the interactive (client) verifier — the demonstration that a
 * CertifyChain proof does not depend on us to be checked.
 */
export default function VerifierPage() {
  return <OfflineVerifier />;
}
