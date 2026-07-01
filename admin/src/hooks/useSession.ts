"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { adminMe } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import type { AdminSessionDTO } from "@contract/dto";

export interface UseAdminSessionResult {
  session: AdminSessionDTO | null;
  loading: boolean;
  error: ApiClientError | null;
}

/**
 * Loads the current admin session via `adminMe()` on mount.
 * A 401 means "not authenticated" (session = null, no error surfaced).
 */
export function useAdminSession(): UseAdminSessionResult {
  const [session, setSession] = useState<AdminSessionDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  useEffect(() => {
    let active = true;

    adminMe()
      .then((data) => {
        if (!active) return;
        setSession(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSession(null);
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

/** Guards a page: redirects to `/login` once loading completes without a session. */
export function useRequireAdmin(redirectTo = "/login"): UseAdminSessionResult {
  const router = useRouter();
  const state = useAdminSession();

  useEffect(() => {
    if (state.loading) return;
    if (!state.session) router.replace(redirectTo);
  }, [state.loading, state.session, redirectTo, router]);

  return state;
}
