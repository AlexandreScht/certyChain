import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Minimal Stripe client over the REST API (no SDK dependency). Mirrors the
 * fetch + graceful-degradation style of the INSEE/Gemini clients. Two uses:
 *  • the one-time postal dispatch fee (verify.md §2)
 *  • recurring subscription billing (cahier des charges §5.1) — Checkout for
 *    Starter/Pro + the Stripe-hosted Billing Portal (payment method, invoices,
 *    cancellation — zero card data ever touches this app).
 *
 * Plus: verify the webhook signature, so a forged event can never trigger a
 * dispatch or unlock a plan.
 */

export interface CheckoutSession {
  id: string;
  url: string;
}

/** Creates a one-time Checkout Session for the postal dispatch fee. */
export async function createCheckoutSession(opts: {
  verificationId: string;
  schoolName: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", opts.successUrl);
  body.set("cancel_url", opts.cancelUrl);
  body.set("client_reference_id", opts.verificationId);
  body.set("metadata[verificationId]", opts.verificationId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", env.POSTAL_VERIFICATION_CURRENCY);
  body.set("line_items[0][price_data][unit_amount]", String(env.POSTAL_VERIFICATION_PRICE_CENTS));
  body.set(
    "line_items[0][price_data][product_data][name]",
    `Vérification postale — ${opts.schoolName}`.slice(0, 250),
  );

  const res = await fetch(`${env.STRIPE_API_BASE.replace(/\/$/, "")}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    logger.error("stripe.checkout_failed", { status: res.status });
    throw new Error(`Stripe checkout creation failed (${res.status})`);
  }
  const json = (await res.json()) as { id?: string; url?: string };
  if (!json.id || !json.url) throw new Error("Stripe: malformed checkout session");
  return { id: json.id, url: json.url };
}

/**
 * Creates a recurring subscription Checkout Session for a self-serve plan.
 * Reuses an existing Stripe Customer when the school already has one (e.g.
 * switching plans), otherwise lets Stripe create one from `customerEmail`.
 */
export async function createSubscriptionCheckoutSession(opts: {
  schoolId: string;
  priceId: string;
  customerId: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", opts.successUrl);
  body.set("cancel_url", opts.cancelUrl);
  body.set("client_reference_id", opts.schoolId);
  body.set("metadata[schoolId]", opts.schoolId);
  body.set("subscription_data[metadata][schoolId]", opts.schoolId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price]", opts.priceId);
  if (opts.customerId) body.set("customer", opts.customerId);
  else body.set("customer_email", opts.customerEmail);

  const res = await fetch(`${env.STRIPE_API_BASE.replace(/\/$/, "")}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    logger.error("stripe.subscription_checkout_failed", { status: res.status });
    throw new Error(`Stripe subscription checkout creation failed (${res.status})`);
  }
  const json = (await res.json()) as { id?: string; url?: string };
  if (!json.id || !json.url) throw new Error("Stripe: malformed checkout session");
  return { id: json.id, url: json.url };
}

/**
 * Creates a Stripe-hosted Billing Portal session — the school manages its
 * payment method, views invoices, changes/cancels its plan there. No card
 * data ever reaches this app (avoids PCI scope entirely).
 */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const body = new URLSearchParams();
  body.set("customer", opts.customerId);
  body.set("return_url", opts.returnUrl);

  const res = await fetch(`${env.STRIPE_API_BASE.replace(/\/$/, "")}/v1/billing_portal/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    logger.error("stripe.billing_portal_failed", { status: res.status });
    throw new Error(`Stripe billing portal creation failed (${res.status})`);
  }
  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("Stripe: malformed billing portal session");
  return { url: json.url };
}

/** Parsed Stripe event (only the fields we consume). */
export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * Verifies a Stripe webhook signature (`Stripe-Signature: t=…,v1=…`) against the
 * raw request body using the endpoint secret. Constant-time compare; rejects
 * stale timestamps. Returns the parsed event, or null when verification fails.
 * Pure (no I/O) — this is the security gate before any dispatch is triggered.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): StripeEvent | null {
  if (!signatureHeader || !secret) return null;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v ?? null;
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return null;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return null;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expBuf = Buffer.from(expected);
  const matched = signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
  if (!matched) return null;

  try {
    return JSON.parse(rawBody) as StripeEvent;
  } catch {
    return null;
  }
}
