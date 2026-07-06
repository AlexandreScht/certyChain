"use client";

import { use, useEffect, useState, type FormEvent, type JSX } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Mail,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  GraduationCap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  LogIn,
} from "lucide-react";

import {
  getClaimInfo,
  requestClaimOtp,
  verifyClaimOtp,
  resendClaim,
} from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import type { ClaimInfoDTO } from "@certifychain/contract/dto";
import { Button, Card, Field, Input, Spinner, useToast } from "@certifychain/shared/ui";
import { WalletLogo } from "@/components/wallet/WalletLogo";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";

interface PageProps {
  params: Promise<{ token: string }>;
}

type Step = "email" | "code";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; info: ClaimInfoDTO }
  | { status: "error"; message: string };

const OTP_HINT = "Vérifiez votre boîte mail pour le code à 6 chiffres.";

function diplomaCountLabel(n: number): string {
  return n <= 1 ? "un diplôme" : `${n} diplômes`;
}

export default function ClaimPage({ params }: PageProps): JSX.Element {
  const { token } = use(params);
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getClaimInfo(token)
      .then((info) => {
        if (active) setState({ status: "ready", info });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message =
          err instanceof ApiClientError ? err.message : "Impossible de charger ce lien.";
        setState({ status: "error", message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleResend = async () => {
    setResend("sending");
    try {
      await resendClaim(token);
      setResend("sent");
    } catch (err) {
      setResend("idle");
      if (err instanceof ApiClientError) toast.error("Envoi impossible", err.message);
    }
  };

  const handleRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await requestClaimOtp(token, { email });
      toast.toast({ title: "Vérifiez votre boîte mail", description: OTP_HINT });
      setStep("code");
    } catch (err) {
      if (err instanceof ApiClientError) toast.error("Envoi impossible", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setCodeError(null);
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Saisissez le code à 6 chiffres.");
      return;
    }
    setSubmitting(true);
    try {
      await verifyClaimOtp(token, { email, code });
      toast.toast({ title: "Diplôme récupéré", description: "Bienvenue dans votre portefeuille." });
      router.push("/");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCodeError(err.message);
        toast.error("Code invalide", err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative h-svh overflow-hidden bg-mesh noise">
      <div
        aria-hidden
        className="absolute -top-24 -left-16 w-[380px] h-[380px] rounded-full animate-float-slow animate-morph"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          filter: "blur(44px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -right-16 w-[420px] h-[420px] rounded-full animate-float-slower animate-morph"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.38), rgba(6,182,212,0) 70%)",
          filter: "blur(48px)",
        }}
      />

      <div className="relative z-10 h-full overflow-hidden px-5">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.55, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative mx-auto flex min-h-full w-full max-w-md flex-col justify-center py-6"
        >
          <div className="mb-7 flex justify-center">
            <WalletLogo />
          </div>

          <Card strong halo padding="p-7 sm:p-8">
            <div className="absolute top-4 right-4 z-20">
              <ThemeToggle />
            </div>

            {state.status === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted">
                <Spinner size="lg" />
                <p className="text-sm">Chargement…</p>
              </div>
            )}

            {state.status === "error" && (
              <ClaimNotice
                icon={<AlertTriangle />}
                badge="Lien invalide"
                title="Une erreur est survenue"
                description={state.message}
                cta="Aller à la connexion"
                onCta={() => router.push("/login")}
              />
            )}

            {state.status === "ready" && state.info.status === "not_found" && (
              <ClaimNotice
                icon={<AlertTriangle />}
                badge="Lien invalide"
                title="Lien introuvable"
                description="Ce lien de récupération n'existe pas ou a été mal copié. Vérifiez l'e-mail reçu de votre établissement, ou connectez-vous si vous avez déjà un portefeuille."
                cta="Aller à la connexion"
                onCta={() => router.push("/login")}
              />
            )}

            {state.status === "ready" && state.info.status === "claimed" && (
              <ClaimNotice
                icon={<CheckCircle2 />}
                badge="Déjà récupéré"
                title="Ce diplôme est déjà relié"
                description="Vous avez déjà relié ce diplôme à un e-mail personnel. Connectez-vous avec cette adresse pour y accéder."
                cta="Se connecter"
                ctaIcon={<LogIn className="w-4.5 h-4.5" />}
                onCta={() => router.push("/login")}
              />
            )}

            {state.status === "ready" && state.info.status === "expired" && (
              <ClaimNotice
                icon={<AlertTriangle />}
                badge="Lien expiré"
                title="Ce lien a expiré"
                description="Pas d'inquiétude : demandez un nouveau lien, envoyé à la même adresse que celle utilisée par votre établissement."
                cta={resend === "sent" ? "Lien envoyé !" : "Renvoyer un lien"}
                ctaIcon={
                  resend === "sent" ? (
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  ) : (
                    <RefreshCw className="w-4.5 h-4.5" />
                  )
                }
                onCta={handleResend}
                ctaLoading={resend === "sending"}
                ctaDisabled={resend === "sent"}
              />
            )}

            {state.status === "ready" && state.info.status === "pending" && (
              <>
                <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-indigo-500 animate-pulse-ring" />
                    <span className="relative rounded-full w-2 h-2 bg-indigo-500" />
                  </span>
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                  {state.info.schoolName ?? "Votre établissement"}
                </div>

                <h1 className="font-display font-bold text-ink text-2xl sm:text-3xl tracking-tight leading-[1.1]">
                  Récupérez votre{" "}
                  <span className="grad-text-cool">
                    {diplomaCountLabel(state.info.diplomaCount)}
                  </span>
                </h1>
                <p className="mt-2.5 text-sm text-muted leading-relaxed">
                  {step === "email" ? (
                    <>
                      Délivré à <strong className="text-ink-soft">{state.info.maskedEmail}</strong>{" "}
                      — reliez-le une bonne fois pour toutes à votre e-mail personnel, pour ne
                      jamais en perdre l&apos;accès.
                    </>
                  ) : (
                    `Saisissez le code à 6 chiffres envoyé à ${email}.`
                  )}
                </p>

                <div className="mt-6">
                  {step === "email" ? (
                    <form onSubmit={handleRequest} className="flex flex-col gap-5">
                      <Field
                        label="Votre e-mail personnel"
                        hint="Indépendant de celui de votre établissement — c'est celui-ci qui vous servira à vous connecter."
                      >
                        <Input
                          type="email"
                          name="email"
                          autoComplete="email"
                          required
                          autoFocus
                          placeholder="vous@exemple.fr"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          leftIcon={<Mail aria-hidden />}
                        />
                      </Field>

                      <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        loading={submitting}
                        rightIcon={<ArrowRight className="w-4.5 h-4.5" />}
                      >
                        Recevoir mon code
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerify} className="flex flex-col gap-5">
                      <Field
                        label="Code de vérification"
                        error={codeError ?? undefined}
                        hint="Le code expire après quelques minutes."
                      >
                        <Input
                          type="text"
                          inputMode="numeric"
                          name="code"
                          autoComplete="one-time-code"
                          required
                          autoFocus
                          maxLength={6}
                          placeholder="123456"
                          value={code}
                          onChange={(e) => {
                            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                            setCodeError(null);
                          }}
                          className="tracking-[0.5em] text-center font-mono text-lg"
                          leftIcon={<KeyRound aria-hidden />}
                        />
                      </Field>

                      <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        loading={submitting}
                        rightIcon={<ShieldCheck className="w-4.5 h-4.5" />}
                      >
                        Relier et accéder à mon portefeuille
                      </Button>

                      <button
                        type="button"
                        onClick={() => {
                          setStep("email");
                          setCode("");
                          setCodeError(null);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-muted hover:text-ink transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Modifier l&apos;adresse e-mail
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </Card>

          <p className="mt-6 text-center text-xs text-muted-soft">
            <Sparkles className="inline w-3.5 h-3.5 -mt-0.5 mr-1 text-indigo-500" />
            Vos diplômes sont protégés par des preuves à divulgation nulle (ZKP).
          </p>
        </motion.div>
      </div>
    </main>
  );
}

interface ClaimNoticeProps {
  icon: JSX.Element;
  badge: string;
  title: string;
  description: string;
  cta: string;
  ctaIcon?: JSX.Element;
  onCta: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
}

/** Shared non-interactive-form state (invalid / claimed / expired / error). */
function ClaimNotice({
  icon,
  badge,
  title,
  description,
  cta,
  ctaIcon,
  onCta,
  ctaLoading,
  ctaDisabled,
}: ClaimNoticeProps): JSX.Element {
  return (
    <>
      <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5 [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:text-indigo-600">
        {icon}
        {badge}
      </div>
      <h1 className="font-display font-bold text-ink text-2xl sm:text-3xl tracking-tight leading-[1.1]">
        {title}
      </h1>
      <p className="mt-2.5 text-sm text-muted leading-relaxed">{description}</p>
      <Button
        type="button"
        size="lg"
        fullWidth
        className="mt-6"
        loading={ctaLoading}
        disabled={ctaDisabled}
        rightIcon={ctaIcon}
        onClick={onCta}
      >
        {cta}
      </Button>
    </>
  );
}
