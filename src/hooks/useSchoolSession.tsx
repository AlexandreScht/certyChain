"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UseSessionResult } from "./useSession";

const SchoolSessionContext = createContext<UseSessionResult | null>(null);

export interface SchoolSessionProviderProps {
  value: UseSessionResult;
  children: ReactNode;
}

/**
 * Shares the school session already loaded by the portal's role guard
 * (`layout.tsx`) so individual pages/components don't each re-fetch `/auth/me`
 * just to read `schoolStatus`.
 */
export function SchoolSessionProvider({ value, children }: SchoolSessionProviderProps) {
  return <SchoolSessionContext.Provider value={value}>{children}</SchoolSessionContext.Provider>;
}

/** Safe default outside the provider: treated as "still loading", never null. */
const FALLBACK: UseSessionResult = { session: null, loading: true, error: null };

export function useSchoolSession(): UseSessionResult {
  return useContext(SchoolSessionContext) ?? FALLBACK;
}

/**
 * True only once the establishment has PROVEN ownership and holds PKI keys —
 * the single status allowed to emit diplomas. `pending`/`provisional`
 * (existence confirmed, ownership not yet proven) and everything else stay
 * locked. Defaults to `false` while the session is still loading (locked is
 * the safe direction — never flashes an enabled control that then locks).
 */
export function useCanEmit(): boolean {
  const { session } = useSchoolSession();
  return session?.schoolStatus === "approved";
}
