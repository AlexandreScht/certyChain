import type { JSX } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/**
 * CertifyChain wordmark + shield medallion, matching the marketing Navbar.
 * Links back to the wallet home.
 */
export function WalletLogo(): JSX.Element {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 group cursor-pointer shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-3"
    >
      <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
        <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-lime-500 ring-2 ring-white">
          <span className="absolute inset-0 rounded-full bg-lime-500 animate-pulse-ring" />
        </span>
      </span>
      <span className="font-display font-bold text-ink text-lg tracking-tight">
        Certify<span className="grad-text-cool">Chain</span>
      </span>
    </Link>
  );
}
