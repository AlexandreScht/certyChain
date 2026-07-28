import { createHash } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { env } from "../config/env";

/**
 * Client IP for rate-limiting and audit.
 *
 * SECURITY: forwarding headers are attacker-controlled and are trusted ONLY when
 * `TRUST_PROXY=true` (i.e. the API really sits behind a trusted reverse proxy).
 * Otherwise we use the real TCP peer address — a spoofed `X-Forwarded-For` must
 * never be allowed to rotate rate-limit buckets (security audit finding #1).
 */
export function clientIp(c: Context): string {
  if (env.TRUST_PROXY) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      // Behind a single trusted proxy, the right-most entry is the one the proxy
      // appended (the peer it actually saw); client-injected values sit to its left.
      const ip = parts[parts.length - 1];
      if (ip) return ip;
    }
    const real = c.req.header("x-real-ip");
    if (real) return real;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Bucket key for per-IP rate-limiting. Keeps the full IPv4 address (a /24 would
 * lump a whole ISP block together and over-block), but truncates IPv6 to its /64
 * — a single customer controls a whole /64 (or more) and could otherwise rotate
 * addresses within it to evade the limit.
 */
export function rateLimitIpKey(ip: string): string {
  if (ip.includes(":")) return `${ip.split(":").slice(0, 4).join(":")}::/64`;
  return ip;
}

/** Reduce an IP to its network prefix (/24 IPv4, /48 IPv6) for k-anonymity. */
function ipNetworkPrefix(ip: string): string {
  if (ip.includes(":")) {
    return `${ip.split(":").slice(0, 3).join(":")}::/48`;
  }
  const octets = ip.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
  return ip; // "unknown" or unexpected → hash as-is
}

/**
 * Salted hash of the IP *network prefix* — RGPD: audit logs store no raw IP and
 * truncation provides k-anonymity within the subnet. This is pseudonymization,
 * not irreversible anonymization. Salt is `AUDIT_IP_SALT` (P5/PLAN.md) —
 * required, dedicated, never shared with OTP_PEPPER.
 */
export function anonymizeIp(ip: string): string {
  return createHash("sha256")
    .update(`${ipNetworkPrefix(ip)}|${env.AUDIT_IP_SALT}`)
    .digest("hex")
    .slice(0, 32);
}

/** Truncated User-Agent for audit (avoid storing huge / fingerprinting strings). */
export function shortUserAgent(c: Context): string {
  return (c.req.header("user-agent") ?? "").slice(0, 180);
}
