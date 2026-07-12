"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CreditCard,
  CheckCircle2,
  Check,
  Mail,
  Sparkles,
  ExternalLink,
  Building2,
} from "lucide-react";

import { getBillingState, startCheckout, startBillingPortal } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import { Button, Card, PageHeader, Skeleton, useToast } from "@certifychain/shared/ui";
import { FadeIn } from "@/components/school";
import { cn } from "@certifychain/shared/lib/cn";
import type { BillingPlanInfo, BillingStateDTO } from "@certifychain/contract/dto";

/** Sales contact for the Enterprise offer (no self-serve checkout — cahier des
    charges §5.1: "399 €+, accompagnement"). Placeholder — confirm the real
    address before going live. */
const SALES_EMAIL = "contact@certifychain.fr";

const STATUS_LABEL: Record<string, { label: string; tone: "good" | "warn" | "bad" }> = {
  active: { label: "Actif", tone: "good" },
  trialing: { label: "Période d'essai", tone: "good" },
  past_due: { label: "Paiement en retard", tone: "warn" },
  incomplete: { label: "Paiement incomplet", tone: "warn" },
  unpaid: { label: "Impayé", tone: "bad" },
  canceled: { label: "Résilié", tone: "bad" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BillingSettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { success, error: toastError, toast } = useToast();

  const [state, setState] = useState<BillingStateDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getBillingState());
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Chargement impossible", err.message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  // Handle return-from-Stripe-Checkout query params, once.
  useEffect(() => {
    const checkout = params.get("checkout");
    if (checkout === "success") success("Abonnement activé", "Merci ! Votre offre est en cours d'activation.");
    else if (checkout === "canceled")
      toast({ title: "Abonnement annulé", description: "Vous pouvez réessayer quand vous le souhaitez.", tone: "info" });
    if (checkout) router.replace("/ecole/parametres");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = state?.subscriptionStatus ? STATUS_LABEL[state.subscriptionStatus] : null;

  // A live Stripe subscription exists → plan changes MUST go through the
  // Billing Portal. A fresh Checkout would create a SECOND subscription
  // billed in parallel (Checkout never replaces the current one).
  const hasLiveSubscription = Boolean(
    state?.currentPlan &&
      state.subscriptionStatus &&
      state.subscriptionStatus !== "canceled",
  );

  async function openPortal() {
    if (busy) return;
    setBusy("portal");
    try {
      const { url } = await startBillingPortal();
      window.location.href = url;
    } catch (err) {
      if (err instanceof ApiClientError) toastError("Action impossible", err.message);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Paramètres"
          title="Abonnement &"
          gradient="facturation"
          cool
          subtitle="Choisissez l'offre adaptée à votre établissement et gérez votre moyen de paiement."
        />
      </FadeIn>

      {loading || !state ? (
        <Skeleton width="100%" height={140} />
      ) : (
        <FadeIn>
          <Card strong className="p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <span className="grid place-items-center w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-600 to-cyan-500 text-white shrink-0">
                <CreditCard className="w-7 h-7" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-display font-bold text-ink text-lg">
                    {state.currentPlan
                      ? `Offre ${state.currentPlan === "starter" ? "Starter" : state.currentPlan === "pro" ? "Pro" : "Enterprise"}`
                      : "Aucun abonnement actif"}
                  </h2>
                  {status && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        // -700 in light / -300 in dark: the vivid -500 accents fail
                        // WCAG AA as text on these pale tints (see Badge.tsx).
                        status.tone === "good" && "bg-success/12 text-emerald-700 dark:text-emerald-300",
                        status.tone === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        status.tone === "bad" && "bg-danger/12 text-red-700 dark:text-red-300",
                      )}
                    >
                      {status.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted leading-relaxed">
                  {state.currentPlan
                    ? state.currentPeriodEnd
                      ? `Prochaine échéance le ${formatDate(state.currentPeriodEnd)}.`
                      : "Choisissez une offre ci-dessous pour commencer."
                    : "Choisissez une offre ci-dessous pour commencer."}
                </p>
              </div>
              {state.hasStripeCustomer && (
                <Button
                  variant="subtle"
                  onClick={openPortal}
                  loading={busy === "portal"}
                  leftIcon={<ExternalLink className="w-4 h-4" />}
                  className="shrink-0"
                >
                  Gérer le moyen de paiement
                </Button>
              )}
            </div>
          </Card>
        </FadeIn>
      )}

      {loading || !state ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton height={360} className="rounded-[1.75rem]" />
          <Skeleton height={360} className="rounded-[1.75rem]" />
          <Skeleton height={360} className="rounded-[1.75rem]" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {state.plans.map((plan, i) => (
            <FadeIn key={plan.id} index={i}>
              <PlanCard
                plan={plan}
                isCurrent={state.currentPlan === plan.id}
                switchViaPortal={hasLiveSubscription}
                onPortal={openPortal}
                busy={busy}
                onChoose={async () => {
                  if (busy) return;
                  const planId = plan.id as "starter" | "pro";
                  setBusy(`checkout:${planId}`);
                  try {
                    const { url } = await startCheckout({ plan: planId });
                    window.location.href = url;
                  } catch (err) {
                    if (err instanceof ApiClientError) toastError("Abonnement impossible", err.message);
                    setBusy(null);
                  }
                }}
              />
            </FadeIn>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  isCurrent,
  switchViaPortal,
  onPortal,
  busy,
  onChoose,
}: {
  plan: BillingPlanInfo;
  isCurrent: boolean;
  /** True when a live subscription exists → changes go through the Billing Portal. */
  switchViaPortal: boolean;
  onPortal: () => void;
  busy: string | null;
  onChoose: () => void;
}) {
  return (
    <Card
      strong={isCurrent}
      glow={isCurrent}
      className={cn("p-6 h-full flex flex-col gap-5", isCurrent && "ring-2 ring-indigo-500/40")}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-display font-bold text-ink text-lg">{plan.label}</h3>
          {isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">
              <Sparkles className="w-3 h-3" /> Offre actuelle
            </span>
          )}
        </div>
        <p className="text-2xl font-display font-bold grad-text-cool">{plan.priceLabel}</p>
        <p className="text-xs text-muted mt-1">{plan.target}</p>
      </div>

      <ul className="flex flex-col gap-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-ink-soft">
            <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {!plan.selfServe ? (
          <Button
            as="a"
            href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("Offre Enterprise — CertifyChain")}`}
            fullWidth
            variant="subtle"
            leftIcon={<Mail className="w-4.5 h-4.5" />}
          >
            Nous contacter
          </Button>
        ) : isCurrent ? (
          <Button fullWidth variant="subtle" disabled leftIcon={<CheckCircle2 className="w-4.5 h-4.5" />}>
            Offre actuelle
          </Button>
        ) : switchViaPortal ? (
          <div className="flex flex-col gap-1.5">
            <Button
              fullWidth
              variant="subtle"
              onClick={onPortal}
              loading={busy === "portal"}
              leftIcon={<ExternalLink className="w-4.5 h-4.5" />}
            >
              Changer via le portail
            </Button>
            <p className="text-[11px] text-muted-soft text-center">
              Le changement d&apos;offre se fait dans le portail Stripe (évite un
              double abonnement).
            </p>
          </div>
        ) : plan.available ? (
          <Button
            fullWidth
            onClick={onChoose}
            loading={busy === `checkout:${plan.id}`}
            leftIcon={<Building2 className="w-4.5 h-4.5" />}
          >
            Choisir cette offre
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Button fullWidth variant="subtle" disabled>
              Indisponible
            </Button>
            <p className="text-[11px] text-muted-soft text-center">Configuration en attente.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
