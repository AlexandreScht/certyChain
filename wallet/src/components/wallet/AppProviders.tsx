"use client";

import type { JSX, ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ToastProvider, Spinner } from "@/components/ui";
import { useRequireRole } from "@/hooks/useSession";
import { WalletShell } from "./WalletShell";

/** Routes that render WITHOUT the student guard or chrome. */
const PUBLIC_ROUTES = new Set<string>(["/login"]);

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
  const isPublic = PUBLIC_ROUTES.has(pathname);

  return (
    <ToastProvider>{isPublic ? children : <GuardedApp>{children}</GuardedApp>}</ToastProvider>
  );
}
