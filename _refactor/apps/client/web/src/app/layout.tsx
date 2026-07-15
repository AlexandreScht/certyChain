import type { Metadata } from "next";
import { Inter, Space_Grotesk, Outfit } from "next/font/google";
import Script from "next/script";
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
    "Diplômes numériques signés par leur école et vérifiables dans le navigateur du recruteur, en moins de 10 secondes, sans compte. L'élève choisit les informations qu'il partage.",
  keywords: [
    "diplôme numérique",
    "vérification diplôme",
    "signature Ed25519",
    "PKI éducation",
    "SaaS école",
    "anti-fraude diplôme",
    "diplôme infalsifiable",
    "EUDI Wallet",
    "eIDAS 2.0",
    "SD-JWT VC",
    "accrochage CDC",
    "passeport de compétences",
  ],
  openGraph: {
    title: "CertifyChain — Diplômes numériques infalsifiables",
    description:
      "Rendez la fraude aux diplômes techniquement impossible. Vérification en moins de 10 secondes.",
    type: "website",
    locale: "fr_FR",
  },
};

// Runs before first paint to set the theme (no flash of the wrong theme).
// Honors a saved choice, else the OS preference.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${outfit.variable} scroll-smooth`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
      </head>
      <body className="antialiased bg-ivory text-ink">{children}</body>
    </html>
  );
}
