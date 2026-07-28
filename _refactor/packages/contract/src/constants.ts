/**
 * Upload ceilings that are part of the public CDC API contract.
 *
 * Keeping these values in the contract package lets the request schema and the
 * server's byte-oriented guards share one source of truth.
 */
export const CDC_UPLOAD_LIMITS = {
  identityCsv: 2 * 1024 * 1024,
  crt: 2 * 1024 * 1024,
} as const;

/**
 * Response headers carrying the retry delay of a 429, in the order the client
 * reads them (`unwrap` → `ApiClientError.retryAfterSeconds`, audit R6).
 *
 * NONE of them is CORS-safelisted, and the fronts call the API cross-origin
 * (`hc<AppType>(API_BASE)` → :4000, no Next rewrite). The API must therefore
 * name them in `Access-Control-Expose-Headers`, or the browser strips them and
 * the delay is silently always `undefined` — a defect no client-side spec can
 * see, because mocking `headers.get` bypasses the browser's filtering entirely.
 *
 * It lives in the CONTRACT package, not in `packages/shared/src/api/client.ts`:
 * both sides need it, but `shared/api/client` is a browser module (`document`,
 * `RequestInfo`) and the server's `tsc` has no DOM lib — importing it there
 * breaks `apps/server` typecheck. Producer:
 * `apps/server/src/middleware/security.ts`. Consumers: `unwrap` in
 * `packages/shared/src/api/client.ts`, asserted end-to-end against the real
 * CORS middleware in `apps/server/test/middleware/cors.test.ts`.
 */
export const RETRY_AFTER_HEADERS = ["Retry-After", "RateLimit-Reset"] as const;
