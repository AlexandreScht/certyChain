import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CertifyChain — Diplômes numériques infalsifiables pour votre établissement",
  description:
    "CertifyChain permet aux écoles, universités et organismes de formation d'émettre des diplômes numériques authentifiés par cryptographie Zero-Knowledge. Vérification instantanée, confidentielle et sans fraude possible.",
  keywords: [
    "diplôme numérique",
    "certification blockchain",
    "vérification diplôme",
    "zero-knowledge proof",
    "anti-fraude diplôme",
    "école",
    "université",
    "SaaS éducation",
  ],
  openGraph: {
    title: "CertifyChain — Diplômes numériques infalsifiables",
    description:
      "Rendez la fraude aux diplômes techniquement impossible. Vérification en moins de 10 secondes.",
    type: "website",
    locale: "fr_FR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="scroll-smooth">
      <body className="antialiased">{children}</body>
    </html>
  );
}
