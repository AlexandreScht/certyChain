import type { ApiError, ErrorCode } from "@contract/errors";

/**
 * Base URL of the CertifyChain API. Overridable via `NEXT_PUBLIC_API_URL`,
 * defaults to the local dev server.
 */
export const BASE: string =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Name of the (non-HttpOnly) cookie carrying the CSRF token (admin realm). */
const CSRF_COOKIE = "cc_admin_csrf";
/** Header the API expects the CSRF token to be echoed back in. */
const CSRF_HEADER = "x-csrf-token";

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

/** A JSON-serializable request body. */
type Json = unknown;

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

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  /** Pre-built body (e.g. FormData). When set, JSON serialization is skipped. */
  rawBody?: BodyInit;
}

async function request<T>(
  method: Method,
  path: string,
  body?: Json,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const mutating = method !== "GET";

  let payload: BodyInit | undefined = options.rawBody;
  if (payload === undefined && body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (mutating) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers,
      body: payload,
    });
  } catch (cause) {
    throw new ApiClientError("Impossible de joindre le serveur.", {
      code: "network_error",
      details: cause,
    });
  }

  // 204 No Content / empty body: nothing to parse.
  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    if (isApiError(parsed)) {
      throw new ApiClientError(parsed.error.message, {
        code: parsed.error.code,
        status: res.status,
        details: parsed.error.details,
      });
    }
    throw new ApiClientError(res.statusText || "Erreur serveur.", {
      status: res.status,
      details: parsed,
    });
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function get<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function post<T>(path: string, body?: Json): Promise<T> {
  return request<T>("POST", path, body);
}

export function put<T>(path: string, body?: Json): Promise<T> {
  return request<T>("PUT", path, body);
}

export function patch<T>(path: string, body?: Json): Promise<T> {
  return request<T>("PATCH", path, body);
}

export function del<T>(path: string, body?: Json): Promise<T> {
  return request<T>("DELETE", path, body);
}

/** Sends a mutating request with a raw body (FormData / Blob), no JSON encoding. */
export function postRaw<T>(path: string, rawBody: BodyInit): Promise<T> {
  return request<T>("POST", path, undefined, { rawBody });
}
