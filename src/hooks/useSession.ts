"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { me } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import type { SessionDTO } from "@contract/dto";
import type { Role } from "@contract/enums";

export interface UseSessionResult {
  session: SessionDTO | null;
  loading: boolean;
  error: ApiClientError | null;
}

/**
 * Loads the current session via `me()` on mount.
 * A 401 is treated as "not authenticated" (session = null, no error surfaced);
 * any other failure is exposed through `error`.
 */
export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  useEffect(() => {
    let active = true;

    me()
      .then((data) => {
        if (!active) return;
        setSession(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSession(null);
        // 401 / unauthorized simply means "no session", not an error to show.
        if (err instanceof ApiClientError && err.status === 401) {
          setError(null);
        } else if (err instanceof ApiClientError) {
          setError(err);
        } else {
          setError(
            new ApiClientError("Erreur inattendue.", { details: err }),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return { session, loading, error };
}

/**
 * Guards a page by role. Redirects to `redirectTo` once loading completes and
 * the visitor is either unauthenticated or holds a different role.
 */
export function useRequireRole(
  role: Role,
  redirectTo: string,
): UseSessionResult {
  const router = useRouter();
  const state = useSession();

  useEffect(() => {
    if (state.loading) return;
    if (!state.session || state.session.role !== role) {
      router.replace(redirectTo);
    }
  }, [state.loading, state.session, role, redirectTo, router]);

  return state;
}
