"use client";

import type { JSX, ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ToastProvider, Spinner } from "@certifychain/shared/ui";
import { useRequireRole } from "@/hooks/useSession";
import { WalletShell } from "./WalletShell";

/**
 * Routes that render WITHOUT the student guard or chrome.
 * `/claim/*` is public by prefix: a first-time claimer has NO session yet
 * (they prove a personal email via OTP to CREATE one), so gating it behind the
 * student guard would bounce them straight to /login and make the emailed claim
 * link unreachable — the whole point of the flow.
 */
const PUBLIC_ROUTES = new Set<string>(["/login"]);

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname) || pathname.startsWith("/claim");
}

function GuardedApp({ children }: { children: ReactNode }): JSX.Element {
  const { session, loading } = useRequireRole("student", "/login");

  if (loading || !session) {
    return (
      <div className="min-h-svh grid place-items-center bg-mesh noise">
        <Spinner size="lg" className="text-indigo-500" />
      </div>
    );
  }

  return <WalletShell>{children}</WalletShell>;
}

/** Toast context + role guard for the whole wallet app (login renders bare). */
export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const isPublic = isPublicRoute(pathname);

  return (
    <ToastProvider>{isPublic ? children : <GuardedApp>{children}</GuardedApp>}</ToastProvider>
  );
}
