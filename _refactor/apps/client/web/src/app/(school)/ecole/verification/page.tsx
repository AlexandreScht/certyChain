"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Globe,
  Mail,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  ArrowRight,
  Clock,
  Users,
  AlertTriangle,
} from "lucide-react";

import {
  getVerificationState,
  chooseVerificationMethod,
  switchVerificationMethod,
  verifyDnsOwnership,
  submitPostalCode,
  startProConnect,
} from "@/lib/api/endpoints";
import { apiErrorMessage } from "@/lib/api/client";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  useToast,
} from "@certifychain/shared/ui";
import { FadeIn } from "@/components/school";
import type {
  VerificationStateDTO,
  VerificationMethodInfo,
  CurrentVerificationDTO,
} from "@certifychain/contract/dto";
import type { VerificationMethod } from "@certifychain/contract/enums";

/* ── Static method descriptions + tutorials (verify.md) ───────────────────── */

interface MethodMeta {
  label: string;
  icon: ReactNode;
  tagline: string;
  who: string;
  duration: string;
  steps: string[];
}

const METHODS: Record<VerificationMethod, MethodMeta> = {
  dns: {
    label: "Enregistrement DNS",
    icon: <Globe className="w-6 h-6" />,
    tagline: "Prouvez que vous contrôlez le domaine de votre établissement.",
    who: "Votre DSI / responsable informatique (accès au domaine).",
    duration: "5 à 30 minutes",
    steps: [
      "Copiez le code unique que nous vous fournissons.",
      "Ajoutez-le comme enregistrement TXT chez votre hébergeur de domaine (OVH, Cloudflare, Gandi…).",
      "Revenez ici et cliquez « Vérifier ».",
      "Nous vérifions automatiquement en quelques secondes.",
    ],
  },
  postal: {
    label: "Courrier postal",
    icon: <Mail className="w-6 h-6" />,
    tagline: "Recevez un code à l'adresse officielle de l'établissement.",
    who: "Secrétariat / direction (réception du courrier officiel).",
    duration: "Selon délai d'acheminement",
    steps: [
      "Confirmez l'adresse partielle affichée.",
      "Réglez les frais d'envoi en ligne (paiement sécurisé Stripe).",
      "Recevez un courrier contenant un code unique.",
      "Saisissez ce code ici pour valider.",
    ],
  },
  proconnect: {
    label: "ProConnect",
    icon: <Landmark className="w-6 h-6" />,
    tagline: "Identité professionnelle vérifiée par l'État (SIRET).",
    who: "Un agent rattaché à l'établissement.",
    duration: "Moins de 2 minutes",
    steps: [
      "Cliquez « Se connecter avec ProConnect ».",
      "Identifiez-vous et sélectionnez votre établissement.",
      "ProConnect confirme votre SIRET → validation automatique.",
    ],
  },
};

/* ── Small helpers ────────────────────────────────────────────────────────── */

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copier ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg neumorph-pill px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors cursor-pointer shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copié" : "Copier"}
    </button>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-muted leading-relaxed">
          <span className="grid place-items-center w-5 h-5 shrink-0 rounded-full bg-indigo-100 text-indigo-600 text-[11px] font-bold">
            {i + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function VerificationPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { success, error: toastError, toast } = useToast();

  const [state, setState] = useState<VerificationStateDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const load = useCallback(async () => {
    try {
      setState(await getVerificationState());
    } catch (err) {
      toastError("Chargement impossible", apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  // Handle return-from-redirect query params (Stripe / ProConnect), once.
  useEffect(() => {
    const verified = params.get("verified");
    const paid = params.get("paid");
    const canceled = params.get("canceled");
    const errParam = params.get("error");
    if (verified) success("Établissement vérifié", "Vos clés PKI ont été générées.");
    else if (paid)
      toast({
        title: "Paiement reçu",
        description: "Votre courrier de vérification est en préparation.",
        tone: "info",
      });
    else if (canceled)
      toast({
        title: "Paiement annulé",
        description: "Vous pouvez réessayer quand vous le souhaitez.",
        tone: "info",
      });
    else if (errParam === "proconnect")
      toastError("ProConnect", "La vérification a échoué. Réessayez ou changez de méthode.");
    if (verified || paid || canceled || errParam) router.replace("/ecole/verification");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(key: string, fn: () => Promise<VerificationStateDTO>) {
    if (busy) return;
    setBusy(key);
    try {
      const next = await fn();
      setState(next);
      if (next.schoolStatus === "approved") {
        success("Établissement vérifié", "Vous pouvez désormais émettre des diplômes.");
      }
    } catch (err) {
      toastError("Action impossible", apiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const current = state?.current ?? null;

  // Switching away from a PAID postal attempt cancels it: the dispatch fee is
  // lost and the mailed code becomes useless — never do that on a single click.
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const paidPostal =
    current?.method === "postal" && current.postal?.paymentStatus === "paid";

  function requestSwitch() {
    if (paidPostal) setConfirmingSwitch(true);
    else void runAction("switch", switchVerificationMethod);
  }

  return (
    <div className="flex flex-col gap-7">
      <FadeIn>
        <PageHeader
          eyebrow="Vérification de propriété"
          title="Prouvez que vous"
          gradient="contrôlez l'établissement"
          cool
          subtitle="L'existence de votre établissement est confirmée. Choisissez une méthode pour prouver que vous le contrôlez réellement — c'est la dernière étape avant d'émettre des diplômes."
          actions={
            <Button
              variant="subtle"
              size="sm"
              onClick={() => void load()}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              disabled={loading}
            >
              Actualiser
            </Button>
          }
        />
      </FadeIn>

      {loading || !state ? (
        <Skeleton width="100%" height={220} />
      ) : state.schoolStatus === "approved" ? (
        <SuccessPanel />
      ) : !state.needsOwnershipProof ? (
        <BlockedPanel status={state.schoolStatus} />
      ) : !current ? (
        <MethodChooser
          methods={state.methods}
          busy={busy}
          onChoose={(m) => runAction(`choose:${m}`, () => chooseVerificationMethod({ method: m }))}
        />
      ) : current.status === "failed" ? (
        <FailedPanel
          current={current}
          busy={busy}
          onSwitch={() => runAction("switch", switchVerificationMethod)}
        />
      ) : (
        <CurrentPanel
          current={current}
          busy={busy}
          code={code}
          setCode={setCode}
          onSwitch={requestSwitch}
          onVerifyDns={() => runAction("dns", verifyDnsOwnership)}
          onSubmitCode={() => runAction("postal", () => submitPostalCode(code))}
          onStartProConnect={async () => {
            if (busy) return;
            setBusy("proconnect");
            try {
              const { authorizeUrl } = await startProConnect();
              window.location.href = authorizeUrl;
            } catch (err) {
              toastError("ProConnect", apiErrorMessage(err));
              setBusy(null);
            }
          }}
        />
      )}

      {/* Guard: abandoning a paid postal dispatch is irreversible. */}
      <Modal
        open={confirmingSwitch}
        onClose={() => setConfirmingSwitch(false)}
        title="Abandonner l'envoi postal payé ?"
        description="Votre courrier de vérification est déjà payé (et peut-être déjà expédié). Changer de méthode annule cette tentative : les frais ne sont pas remboursés et le code du courrier deviendra inutilisable."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingSwitch(false)}>
              Conserver l&apos;envoi postal
            </Button>
            <Button
              onClick={() => {
                setConfirmingSwitch(false);
                void runAction("switch", switchVerificationMethod);
              }}
              leftIcon={<AlertTriangle className="w-4.5 h-4.5" />}
              style={{
                background:
                  "linear-gradient(135deg, #EF4444 0%, #F43F5E 50%, #EC4899 100%)",
              }}
            >
              Changer de méthode
            </Button>
          </>
        }
      />
    </div>
  );
}

/* ── Sub-panels ───────────────────────────────────────────────────────────── */

function MethodChooser({
  methods,
  busy,
  onChoose,
}: {
  methods: VerificationMethodInfo[];
  busy: string | null;
  onChoose: (m: VerificationMethod) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {methods.map((info, i) => {
        const meta = METHODS[info.method];
        return (
          <FadeIn key={info.method} index={i}>
            <Card className="p-6 h-full flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-12 h-12 rounded-2xl neumorph-sm text-indigo-600 shrink-0">
                  {meta.icon}
                </span>
                <div>
                  <h3 className="font-display font-bold text-ink text-base">{meta.label}</h3>
                  <p className="text-xs text-muted mt-0.5">{meta.tagline}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-xs text-muted-soft">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {meta.who}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> {meta.duration}
                </span>
              </div>

              <div className="rounded-2xl neumorph-inset p-4">
                <Steps steps={meta.steps} />
              </div>

              <div className="mt-auto">
                {info.available ? (
                  <Button
                    fullWidth
                    onClick={() => onChoose(info.method)}
                    loading={busy === `choose:${info.method}`}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Choisir cette méthode
                  </Button>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Button fullWidth variant="subtle" disabled>
                      Indisponible
                    </Button>
                    {info.reason && (
                      <p className="text-[11px] text-muted-soft text-center">{info.reason}</p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </FadeIn>
        );
      })}
    </div>
  );
}

function SwitchButton({ busy, onSwitch }: { busy: string | null; onSwitch: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onSwitch}
      loading={busy === "switch"}
      leftIcon={<RefreshCw className="w-4 h-4" />}
    >
      Choisir une autre méthode
    </Button>
  );
}

function CurrentPanel({
  current,
  busy,
  code,
  setCode,
  onSwitch,
  onVerifyDns,
  onSubmitCode,
  onStartProConnect,
}: {
  current: CurrentVerificationDTO;
  busy: string | null;
  code: string;
  setCode: (v: string) => void;
  onSwitch: () => void;
  onVerifyDns: () => void;
  onSubmitCode: () => void;
  onStartProConnect: () => void;
}) {
  const meta = METHODS[current.method];
  return (
    <FadeIn>
      <Card strong className="p-6 sm:p-7 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-600 to-cyan-500 text-white shrink-0">
              {meta.icon}
            </span>
            <div>
              <h2 className="font-display font-bold text-ink text-lg">{meta.label}</h2>
              <p className="text-xs text-muted">Vérification en cours</p>
            </div>
          </div>
          <SwitchButton busy={busy} onSwitch={onSwitch} />
        </div>

        {current.method === "dns" && current.dns && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted leading-relaxed">
              Créez l&apos;enregistrement DNS suivant sur votre domaine, puis cliquez sur
              « Vérifier ». Seul le gestionnaire du domaine peut le faire.
            </p>
            <div className="rounded-2xl neumorph-inset p-4 flex flex-col gap-3">
              <DnsRow label="Nom" value={current.dns.recordName} />
              <DnsRow label="Type" value={current.dns.recordType} copyable={false} />
              <DnsRow label="Valeur" value={current.dns.recordValue} />
            </div>
            <div>
              <Button
                onClick={onVerifyDns}
                loading={busy === "dns"}
                leftIcon={<ShieldCheck className="w-5 h-5" />}
              >
                Vérifier
              </Button>
            </div>
          </div>
        )}

        {current.method === "postal" && current.postal && (
          <div className="flex flex-col gap-4">
            {current.postal.paymentStatus !== "paid" ? (
              <>
                <p className="text-sm text-muted leading-relaxed">
                  Un courrier sera envoyé à l&apos;adresse officielle de votre établissement
                  (affichage partiel pour des raisons de sécurité) :
                </p>
                <div className="rounded-2xl neumorph-inset p-4 text-sm text-ink-soft font-semibold">
                  {[current.postal.streetNo, current.postal.postalCode, current.postal.city]
                    .filter(Boolean)
                    .join(" — ") || "Adresse officielle"}
                </div>
                <p className="text-xs text-muted-soft">
                  Frais d&apos;envoi : {current.postal.priceLabel}. Délai maximum de livraison :{" "}
                  {current.postal.maxDeliveryDays} jours ouvrés (aucune date précise n&apos;est
                  communiquée).
                </p>
                <div>
                  <Button
                    onClick={() => {
                      if (current.postal?.checkoutUrl) window.location.href = current.postal.checkoutUrl;
                    }}
                    disabled={!current.postal.checkoutUrl}
                    leftIcon={<Mail className="w-5 h-5" />}
                  >
                    Payer et commander l&apos;envoi
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted leading-relaxed">
                  Votre courrier est en route (délai maximum {current.postal.maxDeliveryDays} jours
                  ouvrés). Saisissez le code à 6 chiffres qu&apos;il contient :
                </p>
                <div className="max-w-xs">
                  <Field label="Code de vérification">
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </Field>
                </div>
                <div>
                  <Button
                    onClick={onSubmitCode}
                    loading={busy === "postal"}
                    disabled={code.length !== 6}
                    leftIcon={<ShieldCheck className="w-5 h-5" />}
                  >
                    Valider le code
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {current.method === "proconnect" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted leading-relaxed">
              Connectez-vous via ProConnect et sélectionnez votre établissement. Nous comparons le
              SIRET attesté par l&apos;État à celui que vous avez déclaré.
            </p>
            <div>
              <Button
                onClick={onStartProConnect}
                loading={busy === "proconnect"}
                leftIcon={<Landmark className="w-5 h-5" />}
              >
                Se connecter avec ProConnect
              </Button>
            </div>
          </div>
        )}
      </Card>
    </FadeIn>
  );
}

function DnsRow({ label, value, copyable = true }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">{label}</div>
        <code className="text-sm text-ink break-all font-mono">{value}</code>
      </div>
      {copyable && <CopyButton value={value} label={label} />}
    </div>
  );
}

function FailedPanel({
  current,
  busy,
  onSwitch,
}: {
  current: CurrentVerificationDTO;
  busy: string | null;
  onSwitch: () => void;
}) {
  return (
    <FadeIn>
      <Card className="p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5">
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-danger/12 text-danger shrink-0">
          <AlertTriangle className="w-7 h-7" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-ink text-lg">La vérification a échoué</h2>
          <p className="text-sm text-muted mt-0.5">
            La méthode « {METHODS[current.method].label} » n&apos;a pas abouti. Vous pouvez réessayer
            avec une autre méthode — vous n&apos;êtes jamais bloqué.
          </p>
        </div>
        <div className="shrink-0">
          <SwitchButton busy={busy} onSwitch={onSwitch} />
        </div>
      </Card>
    </FadeIn>
  );
}

function SuccessPanel() {
  return (
    <FadeIn>
      <Card strong glow className="p-7 flex flex-col sm:flex-row sm:items-center gap-5">
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-success/12 text-success shrink-0">
          <CheckCircle2 className="w-7 h-7" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-ink text-lg">Établissement vérifié</h2>
          <p className="text-sm text-muted mt-0.5">
            La propriété est prouvée et vos clés PKI sont générées. Vous pouvez désormais émettre des
            diplômes.
          </p>
        </div>
        <Button as="a" href="/ecole/diplomes/nouveau" rightIcon={<ArrowRight className="w-4.5 h-4.5" />}>
          Émettre un diplôme
        </Button>
      </Card>
    </FadeIn>
  );
}

function BlockedPanel({ status }: { status: string }) {
  const map: Record<string, { title: string; body: string }> = {
    pending: {
      title: "En attente de validation",
      body: "L'existence de votre établissement est en cours de vérification. La preuve de propriété sera disponible une fois cette étape franchie.",
    },
    rejected: {
      title: "Établissement refusé",
      body: "Votre établissement n'a pas été validé. Contactez le support pour plus d'informations.",
    },
    revoked: {
      title: "Établissement révoqué",
      body: "L'accès de votre établissement a été révoqué. Contactez le support.",
    },
  };
  const m = map[status] ?? map.pending;
  return (
    <FadeIn>
      <Card className="p-7 flex items-start gap-4">
        <span className="grid place-items-center w-12 h-12 rounded-2xl neumorph-sm text-indigo-600 shrink-0">
          <Clock className="w-6 h-6" />
        </span>
        <div>
          <h2 className="font-display font-bold text-ink text-base">{m.title}</h2>
          <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">{m.body}</p>
        </div>
      </Card>
    </FadeIn>
  );
}
