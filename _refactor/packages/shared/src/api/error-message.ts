import { ApiClientError } from "./client";

/**
 * Generic, non-technical fallback shown when an API call throws something
 * other than an {@link ApiClientError} (a network hiccup, a bug, a thrown
 * non-Error value) — never a raw exception message or a server stack trace.
 * Wording matches the pattern already used on the school portal
 * (`apps/client/web/src/app/(school)/ecole/login/page.tsx`).
 */
export const GENERIC_API_ERROR_MESSAGE =
  "Une erreur inattendue est survenue. Réessayez dans quelques instants.";

/** Renders a `Retry-After` delay (seconds) as a short, human-readable phrase. */
function formatRetryDelay(seconds: number): string {
  if (seconds <= 1) return "quelques secondes";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.ceil(minutes / 60)} h`;
}

/**
 * Turns any thrown value from an API call into a short, user-safe message —
 * ready to hand straight to a `Toast` description. Never surfaces a raw
 * exception, a stack trace, or a bare server detail:
 * - a 429 rate-limit with a known delay (the `Retry-After` header, read by
 *   `unwrap` into {@link ApiClientError.retryAfterSeconds}) gets a message
 *   naming the concrete wait, replacing the generic server text (audit R6);
 * - any other `ApiClientError` (including the account-lockout 429, whose
 *   message already spells out its own delay in words) surfaces its own
 *   message unchanged;
 * - anything else — a network hiccup, an unexpected exception, a thrown
 *   non-Error value — falls back to {@link GENERIC_API_ERROR_MESSAGE} instead
 *   of leaking internals (audit R3).
 */
export function apiErrorMessage(
  error: unknown,
  fallback: string = GENERIC_API_ERROR_MESSAGE,
): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.code === "rate_limited" && typeof error.retryAfterSeconds === "number") {
    return `Trop de requêtes. Réessayez dans ${formatRetryDelay(error.retryAfterSeconds)}.`;
  }
  return error.message;
}
