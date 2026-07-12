import type { ApiError, ErrorCode } from "@certifychain/contract/errors";

/**
 * Base URL of the CertifyChain API. Overridable via `NEXT_PUBLIC_API_URL`
 * (inlined into the client bundle at build time), defaults to the local dev server.
 */
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Header the API expects the CSRF token to be echoed back in (double-submit). */
export const CSRF_HEADER = "x-csrf-token";

/**
 * Error thrown when the API responds with a non-2xx status.
 * Carries the machine-readable {@link ApiError} payload (when present) plus the
 * HTTP status, so callers can branch on `code`/`status` without re-parsing.
 */
export class ApiClientError extends Error {
  readonly code: ErrorCode | "network_error" | "unknown";
  readonly status: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code?: ErrorCode | "network_error" | "unknown";
      status?: number;
      details?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code ?? "unknown";
    this.status = options.status ?? 0;
    this.details = options.details;
  }
}

/** Reads a cookie value by name. Returns `null` outside the browser (SSR). */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Type guard for the contract's nested `{ error: { code, message } }` shape. */
function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const err = (value as { error: unknown }).error;
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  );
}

/**
 * Pulls the first field- or form-level message out of a flattened ZodError
 * (`{ fieldErrors, formErrors }`), so a validation failure surfaces the precise
 * problem (e.g. "SIRET = 14 chiffres") instead of the generic "Données invalides".
 */
function firstDetailMessage(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const d = details as { fieldErrors?: Record<string, unknown>; formErrors?: unknown };
  for (const messages of Object.values(d.fieldErrors ?? {})) {
    if (Array.isArray(messages) && typeof messages[0] === "string") return messages[0];
  }
  if (Array.isArray(d.formErrors) && typeof d.formErrors[0] === "string") {
    return d.formErrors[0];
  }
  return null;
}

/**
 * Defensive fallback: extract a message from a raw `@hono/zod-validator` 400
 * body (`{ success:false, error:{ issues:[{ message }] } }`). The API normally
 * normalizes these into the contract shape, but this keeps the client resilient.
 */
function rawZodIssueMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const issues = (value as { error?: { issues?: unknown } }).error?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { message?: unknown };
    if (typeof first.message === "string") return first.message;
  }
  return null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Callable shape of `fetch` — what `hc(..., { fetch })` expects. */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Pathname of a request input (string | URL | Request), or "" when unparsable. */
function pathnameOf(input: RequestInfo | URL): string {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, API_BASE).pathname;
  } catch {
    return "";
  }
}

/**
 * Credential-presenting endpoints where a 401 means "wrong credentials", not
 * "expired session" — refreshing there would only waste a round-trip.
 */
function isCredentialPath(pathname: string): boolean {
  return pathname.includes("/login") || pathname.includes("/otp/");
}

/**
 * Builds the realm-bound `fetch` handed to the typed hono client (`hc`):
 * - always sends credentials (httpOnly session cookies);
 * - echoes the realm's CSRF cookie (`cc_csrf` / `cc_admin_csrf`) in the
 *   {@link CSRF_HEADER} header on mutating methods (double-submit pattern);
 * - when `refreshPath` is provided: on a 401, silently rotates the session via
 *   `POST refreshPath` (single-flight) and retries the original request ONCE —
 *   without this, the 15-minute access token silently logs everyone out even
 *   though the 30-day refresh cookie is sitting right there;
 * - maps network-level failures to `ApiClientError("network_error")` so callers
 *   never have to distinguish a thrown `fetch` from an API error shape.
 */
export function createCsrfFetch(
  csrfCookieName: string,
  opts?: { refreshPath?: string },
): FetchLike {
  const refreshPath = opts?.refreshPath ?? null;
  // Single-flight: concurrent 401s share one refresh (rotation invalidates the
  // presented token, so racing refreshes would log the user out).
  let refreshing: Promise<boolean> | null = null;

  const doFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);

    if (method !== "GET" && method !== "HEAD") {
      const csrf = readCookie(csrfCookieName);
      if (csrf) headers.set(CSRF_HEADER, csrf);
    }

    try {
      return await fetch(input, { ...init, headers, credentials: "include" });
    } catch (cause) {
      throw new ApiClientError("Impossible de joindre le serveur.", {
        code: "network_error",
        details: cause,
      });
    }
  };

  const tryRefresh = (): Promise<boolean> => {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const headers = new Headers();
          const csrf = readCookie(csrfCookieName);
          if (csrf) headers.set(CSRF_HEADER, csrf);
          const res = await fetch(`${API_BASE}${refreshPath}`, {
            method: "POST",
            headers,
            credentials: "include",
          });
          return res.ok;
        } catch {
          return false;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  };

  return async (input, init) => {
    const res = await doFetch(input, init);
    if (
      res.status !== 401 ||
      !refreshPath ||
      typeof document === "undefined" || // browser only (cookies required)
      pathnameOf(input) === refreshPath ||
      isCredentialPath(pathnameOf(input))
    ) {
      return res;
    }
    if (!(await tryRefresh())) return res;
    // Retry once with fresh cookies (the CSRF token was rotated by the refresh).
    return doFetch(input, init);
  };
}

/** Minimal structural view of a hono `ClientResponse` (or any fetch `Response`). */
export interface JsonResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}

/** JSON body of the success (2xx) branch of a typed hono `ClientResponse`. */
export type SuccessBody<R> =
  Extract<R, { ok: true }> extends never
    ? R extends { json(): Promise<infer T> }
      ? T
      : unknown
    : Extract<R, { ok: true }> extends { json(): Promise<infer T> }
      ? T
      : unknown;

/**
 * Awaits a typed hono client call and returns its parsed 2xx JSON body.
 * Non-2xx responses are converted into {@link ApiClientError}, preferring the
 * most precise message available (first Zod field error → contract message →
 * raw zod-validator issue → statusText).
 */
export async function unwrap<R extends JsonResponseLike>(
  pending: R | Promise<R>,
): Promise<SuccessBody<R>> {
  const res = await pending;

  // 204 No Content / empty body: nothing to parse.
  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    if (isApiError(parsed)) {
      throw new ApiClientError(
        firstDetailMessage(parsed.error.details) ?? parsed.error.message,
        {
          code: parsed.error.code,
          status: res.status,
          details: parsed.error.details,
        },
      );
    }
    throw new ApiClientError(
      rawZodIssueMessage(parsed) ?? (res.statusText || "Erreur serveur."),
      { status: res.status, details: parsed },
    );
  }

  return parsed as SuccessBody<R>;
}
