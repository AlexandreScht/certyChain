import type { Metadata } from "next";
import { VerifyExperience } from "@/components/verify/VerifyExperience";

export const metadata: Metadata = {
  title: "Vérification d'un diplôme — CertifyChain",
  description:
    "Vérifiez instantanément l'authenticité d'un diplôme numérique via une preuve à divulgation nulle (ZKP). Aucune inscription requise.",
  robots: { index: false, follow: false },
};

interface VerifyPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Public verification page (recruiter, no login).
 * Server Component: resolves the route token, then hands off to the
 * interactive client experience.
 */
export default async function VerifyPage({ params }: VerifyPageProps) {
  const { token } = await params;
  return <VerifyExperience token={token} />;
}
