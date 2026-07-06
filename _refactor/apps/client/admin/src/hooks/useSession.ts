"use client";

import { createSessionHooks } from "@certifychain/shared/hooks/createSessionHooks";
import type { AdminSessionDTO } from "@certifychain/contract/dto";

import { adminMe } from "@/lib/api/endpoints";

export interface UseAdminSessionResult {
  session: AdminSessionDTO | null;
  loading: boolean;
  error: import("@certifychain/shared/api/client").ApiClientError | null;
}

const hooks = createSessionHooks<AdminSessionDTO>(adminMe);

/**
 * Loads the current admin session via `adminMe()` on mount.
 * A 401 means "not authenticated" (session = null, no error surfaced).
 */
export const useAdminSession: () => UseAdminSessionResult = hooks.useSession;

/** Guards a page: redirects to `/login` once loading completes without a session. */
export function useRequireAdmin(redirectTo = "/login"): UseAdminSessionResult {
  return hooks.useRequireSession(redirectTo);
}
