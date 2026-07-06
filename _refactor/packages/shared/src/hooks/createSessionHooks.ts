"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError } from "../api/client";

export interface SessionState<TSession> {
  session: TSession | null;
  loading: boolean;
  error: ApiClientError | null;
}

/**
 * Builds the session hooks for one auth realm (public `cc_*` or admin
 * `cc_admin_*`). `fetchMe` is the realm's `/auth/.../me` endpoint.
 *
 * A 401 is treated as "not authenticated" (session = null, no error surfaced);
 * any other failure is exposed through `error`.
 */
export function createSessionHooks<TSession>(fetchMe: () => Promise<TSession>) {
  function useSession(): SessionState<TSession> {
    const [session, setSession] = useState<TSession | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<ApiClientError | null>(null);

    useEffect(() => {
      let active = true;

      fetchMe()
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
            setError(new ApiClientError("Erreur inattendue.", { details: err }));
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
   * Guards a page. Redirects to `redirectTo` once loading completes and the
   * visitor is either unauthenticated or rejected by `isAllowed` (e.g. wrong role).
   */
  function useRequireSession(
    redirectTo: string,
    isAllowed: (session: TSession) => boolean = () => true,
  ): SessionState<TSession> {
    const router = useRouter();
    const state = useSession();

    useEffect(() => {
      if (state.loading) return;
      if (!state.session || !isAllowed(state.session)) {
        router.replace(redirectTo);
      }
      // `isAllowed` is typically an inline closure — the guard is idempotent, so
      // re-running on identity change is harmless and keeps the check fresh.
    }, [state.loading, state.session, redirectTo, router, isAllowed]);

    return state;
  }

  return { useSession, useRequireSession };
}
