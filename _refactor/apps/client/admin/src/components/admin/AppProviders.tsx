"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ToastProvider, Spinner } from "@certifychain/shared/ui";
import { useRequireAdmin } from "@/hooks/useSession";
import { AdminShell } from "./AdminShell";

/** Routes that render WITHOUT the admin guard or chrome. */
const PUBLIC_ROUTES = new Set<string>(["/login"]);

function GuardedApp({ children }: { children: ReactNode }) {
  const { loading, session } = useRequireAdmin("/login");

  if (loading || !session) {
    return (
      <div className="min-h-svh bg-mesh noise grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Spinner size="lg" className="text-indigo-600" />
          <span className="text-sm font-medium">Vérification de la session…</span>
        </div>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}

/** Toast context + role guard for the whole admin app (login renders bare). */
export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  return (
    <ToastProvider>{isPublic ? children : <GuardedApp>{children}</GuardedApp>}</ToastProvider>
  );
}
