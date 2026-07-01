import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import type { BillingPlanInfo, BillingStateDTO } from "../../contract/dto";
import type { SchoolPlan, SelfServePlan } from "../../contract/enums";
import { db } from "../../db/client";
import { type School, schools } from "../../db/schema";
import { fail } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { createBillingPortalSession, createSubscriptionCheckoutSession } from "../../lib/stripe";
import { recordAudit } from "../audit/audit.service";

/**
 * Subscription billing (cahier des charges §5.1) via Stripe Checkout
 * (subscribe) + the Stripe-hosted Billing Portal (payment method, invoices,
 * cancellation — zero card data ever reaches this app). Starter/Pro are
 * self-serve; Enterprise is contact-sales (custom pricing/SLA, no checkout).
 */

/** Static pricing table — display copy only. Stripe is the source of truth
    for the actual charged amount (configured per-plan Price object). */
const PLAN_CATALOG: Omit<BillingPlanInfo, "available">[] = [
  {
    id: "starter",
    label: "Starter",
    priceLabel: "49 €/mois",
    target: "Petites écoles, CFA",
    features: ["500 diplômes émis / an", "1 administrateur"],
    selfServe: true,
  },
  {
    id: "pro",
    label: "Pro",
    priceLabel: "149 €/mois",
    target: "Écoles de taille moyenne",
    features: ["Diplômes illimités", "5 administrateurs", "Statistiques avancées"],
    selfServe: true,
  },
  {
    id: "enterprise",
    label: "Enterprise",
    priceLabel: "À partir de 399 €/mois",
    target: "Universités, réseaux d'écoles",
    features: ["API dédiée", "SSO", "SLA garanti", "Accompagnement personnalisé"],
    selfServe: false,
  },
];

function priceIdFor(plan: SelfServePlan): string | null {
  return (plan === "starter" ? env.STRIPE_PRICE_STARTER : env.STRIPE_PRICE_PRO) || null;
}

function planFromPriceId(priceId: string | undefined): SchoolPlan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  return null;
}

export function listBillingPlans(): BillingPlanInfo[] {
  return PLAN_CATALOG.map((p) => ({
    ...p,
    // Enterprise has no self-serve price — its "contact sales" CTA is always
    // actionable. Starter/Pro depend on a configured Stripe Price (degrades
    // cleanly, same pattern as SIRENE/Gemini/ProConnect).
    available: p.selfServe ? env.billingPlansConfigured[p.id as SelfServePlan] : true,
  }));
}

export function toBillingStateDTO(school: School): BillingStateDTO {
  return {
    currentPlan: school.plan,
    subscriptionStatus: school.subscriptionStatus,
    currentPeriodEnd: school.subscriptionCurrentPeriodEnd
      ? school.subscriptionCurrentPeriodEnd.toISOString()
      : null,
    hasStripeCustomer: school.stripeCustomerId != null,
    plans: listBillingPlans(),
  };
}

/** Starts a self-serve subscription Checkout for the given plan. */
export async function startPlanCheckout(
  school: School,
  plan: SelfServePlan,
): Promise<{ url: string }> {
  const priceId = priceIdFor(plan);
  if (!priceId) throw fail.serviceUnavailable("Cette offre n'est pas encore disponible en ligne.");
  if (!school.contactEmail) throw fail.validation("E-mail de contact requis pour l'abonnement.");

  const base = env.WEB_ORIGIN.replace(/\/$/, "");
  const session = await createSubscriptionCheckoutSession({
    schoolId: school.id,
    priceId,
    customerId: school.stripeCustomerId,
    customerEmail: school.contactEmail,
    successUrl: `${base}/ecole/parametres?checkout=success`,
    cancelUrl: `${base}/ecole/parametres?checkout=canceled`,
  });
  return { url: session.url };
}

/** Returns the Stripe-hosted Billing Portal URL (payment method, invoices, cancel). */
export async function startBillingPortal(school: School): Promise<{ url: string }> {
  if (!school.stripeCustomerId) {
    throw fail.verificationUnavailable("Aucun abonnement actif — choisissez d'abord une offre.");
  }
  const base = env.WEB_ORIGIN.replace(/\/$/, "");
  return createBillingPortalSession({
    customerId: school.stripeCustomerId,
    returnUrl: `${base}/ecole/parametres`,
  });
}

/* ── Webhook handlers (called from the shared /verification/stripe/webhook) ── */

/** `checkout.session.completed` with `mode=subscription`. Idempotent. */
export async function handleSubscriptionCheckoutCompleted(
  session: Record<string, unknown>,
): Promise<void> {
  const metadata = session.metadata as Record<string, unknown> | undefined;
  const schoolId =
    typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : typeof metadata?.schoolId === "string"
        ? metadata.schoolId
        : null;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  if (!schoolId || !customerId || !subscriptionId) {
    logger.error("billing.checkout_completed_malformed", { schoolId, customerId, subscriptionId });
    return;
  }

  await db
    .update(schools)
    .set({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId })
    .where(eq(schools.id, schoolId));
  await recordAudit({ type: "subscription_started", schoolId, metadata: { subscriptionId } });
}

/** `customer.subscription.created` / `.updated` — syncs plan/status/period-end
    (covers upgrades/downgrades made through the Billing Portal too). */
export async function handleSubscriptionUpdated(sub: Record<string, unknown>): Promise<void> {
  const subscriptionId = typeof sub.id === "string" ? sub.id : null;
  const customerId = typeof sub.customer === "string" ? sub.customer : null;
  if (!subscriptionId || !customerId) return;

  const [school] = await db
    .select()
    .from(schools)
    .where(eq(schools.stripeCustomerId, customerId))
    .limit(1);
  if (!school) {
    logger.error("billing.subscription_updated_unknown_customer", { customerId });
    return;
  }

  const status = typeof sub.status === "string" ? sub.status : null;
  const periodEndUnix = typeof sub.current_period_end === "number" ? sub.current_period_end : null;
  const items = (sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data;
  const plan = planFromPriceId(items?.[0]?.price?.id) ?? school.plan;

  await db
    .update(schools)
    .set({
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      plan,
    })
    .where(eq(schools.id, school.id));
  await recordAudit({ type: "subscription_updated", schoolId: school.id, metadata: { status, plan } });
}

/** `customer.subscription.deleted` — status flips to canceled; `plan` kept as history. */
export async function handleSubscriptionDeleted(sub: Record<string, unknown>): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : null;
  if (!customerId) return;
  const [school] = await db
    .select()
    .from(schools)
    .where(eq(schools.stripeCustomerId, customerId))
    .limit(1);
  if (!school) return;

  await db.update(schools).set({ subscriptionStatus: "canceled" }).where(eq(schools.id, school.id));
  await recordAudit({ type: "subscription_canceled", schoolId: school.id });
}
