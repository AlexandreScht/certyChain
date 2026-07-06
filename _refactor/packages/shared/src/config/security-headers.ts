/**
 * Shared HTTP security headers for the three Next.js apps (web / wallet / admin).
 * The CSP was byte-identical across the apps; only the Referrer-Policy and the
 * indexing policy differ per surface — hence the two options.
 *
 * NOTE: imported from each app's `next.config.ts` via a RELATIVE path (the Next
 * config loader does not transpile workspace-package imports reliably).
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

export interface SecurityHeadersOptions {
  /** Origin of the API the browser talks to (CSP `connect-src`). */
  apiOrigin: string;
  /** Dev builds need `'unsafe-eval'` (react-refresh). */
  isDev: boolean;
  /** "strict-origin-when-cross-origin" (public web) / "no-referrer" (wallet, admin). */
  referrerPolicy?: string;
  /** Private surfaces (wallet, admin): emit `X-Robots-Tag: noindex`. */
  noindex?: boolean;
}

/**
 * Content-Security-Policy notes:
 * - `unsafe-inline` (styles) is required by Tailwind + the design system's inline `style={{}}`.
 * - `unsafe-inline` (scripts) is an MVP compromise; tighten later with a
 *   nonce-based CSP via middleware (tracked in PLAN.md › sécurité, audit #5).
 */
export function buildSecurityHeaders(options: SecurityHeadersOptions): SecurityHeader[] {
  const {
    apiOrigin,
    isDev,
    referrerPolicy = "strict-origin-when-cross-origin",
    noindex = false,
  } = options;

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `connect-src 'self' ${apiOrigin}`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: referrerPolicy },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];

  if (noindex) {
    // Private surface: never index, never follow — defense in depth on top of
    // the network gating (loopback bind / VPN for the admin portal).
    headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" });
  }

  // HSTS — only meaningful over HTTPS; harmless in dev.
  headers.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });

  return headers;
}
