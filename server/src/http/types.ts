import type { AccessClaims } from "../lib/tokens";

export interface AppVariables {
  requestId: string;
  auth?: AccessClaims;
}

/** Hono environment for the whole app (typed context variables). */
export type AppEnv = { Variables: AppVariables };
