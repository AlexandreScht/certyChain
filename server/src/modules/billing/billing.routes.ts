import { Hono } from "hono";
import type { Context } from "hono";
import { RATE_LIMIT } from "../../config/constants";
import { StartCheckoutSchema } from "../../contract/schemas";
import type { School } from "../../db/schema";
import type { AppEnv } from "../../http/types";
import { fail } from "../../lib/http-error";
import { zValidator } from "../../lib/validator";
import { getAuth, requireAuth } from "../../middleware/auth";
import { csrfProtect } from "../../middleware/csrf";
import { rateLimit } from "../../middleware/rate-limit";
import { getSchoolById } from "../schools/schools.service";
import { startBillingPortal, startPlanCheckout, toBillingStateDTO } from "./billing.service";

export const billingRoutes = new Hono<AppEnv>();

/** Loads the authenticated school admin's establishment. */
async function currentSchool(c: Context<AppEnv>): Promise<School> {
  const { schoolId } = getAuth(c);
  if (!schoolId) throw fail.forbidden();
  const school = await getSchoolById(schoolId);
  if (!school) throw fail.notFound("Établissement introuvable");
  return school;
}

const schoolAuth = requireAuth("school_admin");
const mutating = rateLimit({ key: "billing", ...RATE_LIMIT.BILLING_IP });

// Billing is independent of the ownership-proof gate (pending/provisional
// schools may subscribe while their KYB/verification is still in progress).

billingRoutes.get("/me", schoolAuth, async (c) =>
  c.json(toBillingStateDTO(await currentSchool(c))),
);

billingRoutes.post(
  "/me/checkout",
  schoolAuth,
  csrfProtect(),
  mutating,
  zValidator("json", StartCheckoutSchema),
  async (c) => c.json(await startPlanCheckout(await currentSchool(c), c.req.valid("json").plan)),
);

billingRoutes.post("/me/portal", schoolAuth, csrfProtect(), mutating, async (c) =>
  c.json(await startBillingPortal(await currentSchool(c))),
);
