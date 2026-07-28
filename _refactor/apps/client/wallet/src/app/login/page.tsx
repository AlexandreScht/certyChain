"use client";

import { useState, type FormEvent, type JSX } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Mail,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { requestOtp, verifyOtp } from "@/lib/api/endpoints";
import { ApiClientError, apiErrorMessage } from "@/lib/api/client";
import { Button, Card, Field, Input, useToast } from "@certifychain/shared/ui";
import { WalletLogo } from "@/components/wallet/WalletLogo";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";

type Step = "email" | "code";

const OTP_HINT = "Si un compte existe, un code a été envoyé.";

export default function WalletLoginPage(): JSX.Element {
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const handleRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await requestOtp({ email });
      // Always reveal the same neutral message (no account enumeration).
      toast.toast({ title: "Vérifiez votre boîte mail", description: OTP_HINT });
      setStep("code");
    } catch (err) {
      // Never a silent failure — including on a rate limit or an unexpected
      // exception, previously swallowed here (audit R3).
      toast.error("Envoi impossible", apiErrorMessage(err));
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
      await verifyOtp({ email, code });
      router.push("/");
    } catch (err) {
      // Never a silent failure (R3); keep the title honest when the failure
      // isn't actually about the code (e.g. a rate limit).
      const message = apiErrorMessage(err);
      setCodeError(message);
      toast.error(err instanceof ApiClientError ? "Code invalide" : "Connexion impossible", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-svh overflow-hidden bg-mesh noise">
      {/* Floating orbs */}
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

      {/* Content layer: centered; the page can scroll on short viewports
          (a clipped h-svh would make the card's top/bottom unreachable). */}
      <div className="relative z-10 min-h-svh px-5">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.55, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative mx-auto flex min-h-svh w-full max-w-md flex-col justify-center py-6"
        >
          <div className="mb-7 flex justify-center">
            <WalletLogo />
          </div>

        <Card strong halo padding="p-7 sm:p-8">
          {/* Corner control — wrapper absolutely positioned so it never shifts the layout. */}
          <div className="absolute top-4 right-4 z-20">
            <ThemeToggle />
          </div>
          <div className="inline-flex items-center gap-2 neumorph-pill rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft mb-5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-indigo-500 animate-pulse-ring" />
              <span className="relative rounded-full w-2 h-2 bg-indigo-500" />
            </span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Espace étudiant
          </div>

          <h1 className="font-display font-bold text-ink text-2xl sm:text-3xl tracking-tight leading-[1.1]">
            Accédez à votre{" "}
            <span className="grad-text-cool">portefeuille</span>
          </h1>
          <p className="mt-2.5 text-sm text-muted leading-relaxed">
            {step === "email"
              ? "Connexion sans mot de passe : recevez un code à usage unique par e-mail."
              : `Saisissez le code à 6 chiffres envoyé à ${email}.`}
          </p>

          <div className="mt-6">
            {step === "email" ? (
              <form onSubmit={handleRequest} className="flex flex-col gap-5">
                <Field
                  label="Adresse e-mail"
                  hint="Votre e-mail personnel — celui relié lors de la récupération de votre premier diplôme."
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
                  Se connecter
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
        </Card>

        <p className="mt-6 text-center text-xs text-muted-soft">
          Vos diplômes sont signés par votre école. Vous seul décidez de ce que
          vous montrez.
        </p>
        <p className="mt-2 text-center text-xs text-muted-soft">
          Premier diplôme reçu ? Utilisez le lien de récupération envoyé par
          votre établissement pour créer votre portefeuille.
        </p>
        </motion.div>
      </div>
    </main>
  );
}
