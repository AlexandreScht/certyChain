import type { Metadata } from "next";
import { Inter, Space_Grotesk, Outfit } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProviders } from "@/components/admin";

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

// Private back-office: never indexed (defense in depth on top of network gating).
export const metadata: Metadata = {
  title: "CertifyChain — Administration",
  description: "Console d'administration CertifyChain (accès restreint).",
  robots: { index: false, follow: false, nocache: true },
};

// Runs before first paint to set the theme (no flash of the wrong theme).
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
      <body className="antialiased bg-ivory text-ink">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
