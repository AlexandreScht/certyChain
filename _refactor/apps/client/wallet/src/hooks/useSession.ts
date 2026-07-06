"use client";

import { createSessionHooks } from "@certifychain/shared/hooks/createSessionHooks";
import type { SessionDTO } from "@certifychain/contract/dto";
import type { Role } from "@certifychain/contract/enums";

import { me } from "@/lib/api/endpoints";

export interface UseSessionResult {
  session: SessionDTO | null;
  loading: boolean;
  error: import("@certifychain/shared/api/client").ApiClientError | null;
}

const hooks = createSessionHooks<SessionDTO>(me);

/**
 * Loads the current session via `me()` on mount.
 * A 401 is treated as "not authenticated" (session = null, no error surfaced);
 * any other failure is exposed through `error`.
 */
export const useSession: () => UseSessionResult = hooks.useSession;

/**
 * Guards a page by role. Redirects to `redirectTo` once loading completes and
 * the visitor is either unauthenticated or holds a different role.
 */
export function useRequireRole(role: Role, redirectTo: string): UseSessionResult {
  return hooks.useRequireSession(redirectTo, (session) => session.role === role);
}
