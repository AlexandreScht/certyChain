import { Hono } from "hono";
import type { Context } from "hono";
import { RATE_LIMIT } from "../../config/constants";
import { env } from "../../config/env";
import { ChooseVerificationMethodSchema, SubmitPostalCodeSchema } from "../../contract/schemas";
import type { School } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { logger } from "../../lib/logger";
import { verifyWebhookSignature } from "../../lib/stripe";
import { zValidator } from "../../lib/validator";
import { getAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import {
  handleSubscriptionCheckoutCompleted,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "../billing/billing.service";
import { getSchoolById } from "../schools/schools.service";
import {
  chooseMethod,
  getPostalCheckoutUrl,
  getVerificationState,
  handlePostalPaid,
  handleProConnectCallback,
  startProConnect,
  submitPostalCode,
  switchMethod,
  verifyDns,
} from "./verification.service";

export const verificationRoutes = new Hono<AppEnv>();

/** Loads the authenticated school admin's establishment. */
async function currentSchool(c: Context<AppEnv>): Promise<School> {
  const { schoolId } = getAuth(c);
  if (!schoolId) throw fail.forbidden();
  const school = await getSchoolById(schoolId);
  if (!school) throw fail.notFound("Établissement introuvable");
  return school;
}

const schoolAuth = requireAuth("school_admin");
const mutating = rateLimit({ key: "verification", ...RATE_LIMIT.VERIFICATION_IP });

/* ── School-facing flow (cookie-authenticated + CSRF) ─────────────────────── */

verificationRoutes.get("/me", schoolAuth, async (c) =>
  c.json(await getVerificationState(await currentSchool(c))),
);

verificationRoutes.post(
  "/me/choose",
  schoolAuth,
  csrfProtect(),
  mutating,
  zValidator("json", ChooseVerificationMethodSchema),
  async (c) => c.json(await chooseMethod(await currentSchool(c), c.req.valid("json").method)),
);

verificationRoutes.post("/me/switch", schoolAuth, csrfProtect(), mutating, async (c) =>
  c.json(await switchMethod(await currentSchool(c))),
);

verificationRoutes.post("/me/dns/verify", schoolAuth, csrfProtect(), mutating, async (c) =>
  c.json(await verifyDns(await currentSchool(c))),
);

verificationRoutes.get("/me/postal/checkout-url", schoolAuth, async (c) =>
  c.json({ url: await getPostalCheckoutUrl(await currentSchool(c)) }),
);

verificationRoutes.post(
  "/me/postal/submit",
  schoolAuth,
  csrfProtect(),
  mutating,
  zValidator("json", SubmitPostalCodeSchema),
  async (c) => c.json(await submitPostalCode(await currentSchool(c), c.req.valid("json").code)),
);

verificationRoutes.get("/me/proconnect/start", schoolAuth, mutating, async (c) =>
  c.json({ authorizeUrl: await startProConnect(await currentSchool(c)) }),
);

/* ── ProConnect callback (public: no cookie — anti-CSRF via OIDC `state`) ──── */

verificationRoutes.get("/proconnect/callback", async (c) => {
  const base = env.WEB_ORIGIN.replace(/\/$/, "");
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.redirect(`${base}/ecole/verification?error=proconnect`);
  try {
    await handleProConnectCallback(code, state);
    return c.redirect(`${base}/ecole/verification?verified=1`);
  } catch (e) {
    logger.info("verification.proconnect_callback_rejected", { error: String(e) });
    return c.redirect(`${base}/ecole/verification?error=proconnect`);
  }
});

/**
 * Stripe webhook (public: authenticated by signature, NOT cookies).
 *
 * ONE endpoint, ONE secret, dispatching by event type — handles both the
 * one-time postal dispatch fee (mode=payment) and subscription billing
 * (mode=subscription / customer.subscription.*). Keeping a single endpoint
 * means no second webhook to register in the Stripe Dashboard.
 */
verificationRoutes.post("/stripe/webhook", async (c) => {
  const raw = await c.req.text();
  const event = verifyWebhookSignature(
    raw,
    c.req.header("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET,
  );
  if (!event) throw fail.unauthorized("Signature Stripe invalide");

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        mode?: string;
        client_reference_id?: string;
        metadata?: Record<string, unknown>;
      };
      if (session.mode === "subscription") {
        await handleSubscriptionCheckoutCompleted(session as Record<string, unknown>);
      } else {
        const verificationId =
          session.client_reference_id ??
          (typeof session.metadata?.verificationId === "string" ? session.metadata.verificationId : null);
        if (verificationId) await handlePostalPaid(verificationId);
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event.data.object);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object);
    }
  } catch (e) {
    logger.error("verification.stripe_handle_failed", { error: String(e), eventType: event.type });
  }
  return c.json({ received: true });
});
