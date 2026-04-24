import type { Metadata } from "next";
import { Inter, Space_Grotesk, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-elegant",
  display: "swap",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "CertifyChain — Diplômes numériques infalsifiables pour votre établissement",
  description:
    "Plateforme SaaS de délivrance et vérification de diplômes via preuves Zero-Knowledge. Rendez la fraude techniquement impossible, vérifiable en moins de 10 secondes.",
  keywords: [
    "diplôme numérique",
    "vérification diplôme",
    "Zero-Knowledge Proof",
    "PKI éducation",
    "SaaS école",
    "anti-fraude diplôme",
    "blockchain diplôme",
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
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${spaceGrotesk.variable} ${outfit.variable} scroll-smooth`}
    >
      <body className="antialiased bg-ivory text-ink">{children}</body>
    </html>
  );
}
