"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { ToastProvider, Spinner } from "@/components/ui";
import { useRequireRole } from "@/hooks/useSession";
import { SchoolSessionProvider } from "@/hooks/useSchoolSession";
import { AppShell } from "@/components/school";

/** Routes that render WITHOUT the role guard or the app chrome. */
const PUBLIC_ROUTES = new Set<string>(["/ecole/login", "/ecole/register"]);

function GuardedApp({ children }: { children: ReactNode }) {
  // Redirects to /ecole/login when the visitor is not an approved school admin.
  const sessionState = useRequireRole("school_admin", "/ecole/login");

  if (sessionState.loading) {
    return (
      <div className="min-h-svh bg-mesh noise grid place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Spinner size="lg" className="text-indigo-600" />
          <span className="text-sm font-medium">Vérification de la session…</span>
        </div>
      </div>
    );
  }

  return (
    <SchoolSessionProvider value={sessionState}>
      <AppShell>{children}</AppShell>
    </SchoolSessionProvider>
  );
}

/**
 * School portal layout (route group `(school)`, URLs under `/ecole`).
 *
 * - `/ecole/login` and `/ecole/register` render bare (no guard, no chrome) so
 *   they stay reachable to unauthenticated visitors.
 * - Every other `/ecole/*` page is wrapped in the guarded `AppShell`.
 * - The whole subtree is wrapped in a single `<ToastProvider>` so `useToast`
 *   works everywhere (including the auth screens).
 */
export default function SchoolLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  return (
    <ToastProvider>
      {isPublic ? children : <GuardedApp>{children}</GuardedApp>}
    </ToastProvider>
  );
}
