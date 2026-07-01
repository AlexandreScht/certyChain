"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Button, ToastProvider, useToast } from "@/components/ui";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { ApiClientError, verifyChallenge, verifyProof } from "@/lib/api";
import type { VerificationResultDTO } from "@contract/dto";
import { VerifyScan } from "./VerifyScan";
import { VerifiedCard } from "./VerifiedCard";
import { FailedCard, type FailedResult } from "./FailedCard";

/** Local UI phase. `error` covers a transport/network failure (not a verdict). */
type Phase = "idle" | "loading" | "result" | "error";

interface VerifyExperienceProps {
  token: string;
}

/**
 * Public verification experience. Runs the challenge → proof handshake against
 * the API and renders the animated outcome. No login, no document content.
 */
export function VerifyExperience({ token }: VerifyExperienceProps): JSX.Element {
  return (
    <ToastProvider>
      <ThemeToggle className="fixed top-4 right-4 z-50" />
      <VerifyExperienceInner token={token} />
    </ToastProvider>
  );
}

function VerifyExperienceInner({ token }: VerifyExperienceProps): JSX.Element {
  const reduce = useReducedMotion();
  const { error: toastError } = useToast();

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VerificationResultDTO | null>(null);
  const inFlight = useRef(false);

  const runVerification = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("loading");
    setResult(null);

    try {
      const { nonce } = await verifyChallenge(token);
      const verdict = await verifyProof(token, { nonce });
      setResult(verdict);
      setPhase("result");
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "Une erreur inattendue est survenue.";
      toastError("Vérification impossible", message);
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, [token, toastError]);

  // Auto-run on mount.
  useEffect(() => {
    void runVerification();
  }, [runVerification]);

  const isVerified = result?.result === "verified";

  return (
    <main className="relative min-h-svh flex flex-col bg-mesh noise overflow-hidden">
      {/* Floating orbs */}
      <div
        aria-hidden
        className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full animate-float-slow animate-morph"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)",
          filter: "blur(44px)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-[-10%] -right-24 w-[460px] h-[460px] rounded-full animate-float-slower animate-morph"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.35), rgba(6,182,212,0) 70%)",
          filter: "blur(48px)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 group cursor-pointer shrink-0"
        >
          <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
            <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
          </span>
          <span className="font-display font-bold text-ink text-lg tracking-tight">
            Certify<span className="grad-text-cool">Chain</span>
          </span>
        </Link>

        <span className="glass rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft">
          <Lock className="w-3.5 h-3.5 text-indigo-600" />
          Vérification sécurisée
        </span>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 w-full max-w-2xl mx-auto px-6 py-10 sm:py-14 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === "idle" || phase === "loading" ? (
            <motion.div
              key="loading"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.4 }}
              className="w-full"
            >
              <VerifyScan />
            </motion.div>
          ) : phase === "result" && result ? (
            isVerified && result.diploma ? (
              <motion.div key="verified" className="w-full">
                <VerifiedCard diploma={result.diploma} engine={result.engine} />
              </motion.div>
            ) : (
              <motion.div key="failed" className="w-full">
                <FailedCard
                  result={result.result as FailedResult}
                  onRetry={runVerification}
                  retrying={false}
                />
              </motion.div>
            )
          ) : (
            <motion.div
              key="error"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.4 }}
              className="w-full"
            >
              <ErrorState onRetry={runVerification} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prominent verify action (re-run) */}
        {phase !== "loading" && phase !== "idle" && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.3 }}
            className="mt-8"
          >
            <Button
              size="lg"
              onClick={runVerification}
              rightIcon={<ArrowRight className="w-5 h-5" />}
            >
              Vérifier le diplôme
            </Button>
          </motion.div>
        )}

        {/* Reassurance footnote */}
        <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-soft text-center">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          Vérification par preuve à divulgation nulle · sans inscription
        </p>
      </div>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-6 py-6 text-center text-xs text-muted-soft">
        <p>
          Propulsé par{" "}
          <Link
            href="/"
            className="font-semibold text-ink-soft hover:text-indigo-600 transition-colors"
          >
            CertifyChain
          </Link>{" "}
          — diplômes numériques infalsifiables.
        </p>
      </footer>
    </main>
  );
}

/** Transport/network error (distinct from a negative verdict). */
function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="glass-strong rounded-[1.75rem] p-7 sm:p-9 text-center">
      <div className="relative grid place-items-center mb-5">
        <span
          aria-hidden
          className="absolute w-16 h-16 rounded-full bg-amber-500/15"
        />
        <div className="relative w-14 h-14 rounded-full grid place-items-center bg-linear-to-br from-amber-500 to-orange-500 text-white">
          <ShieldCheck className="w-6 h-6" />
        </div>
      </div>
      <h1 className="font-display font-bold text-ink text-[clamp(1.4rem,4vw,1.9rem)] leading-tight">
        Vérification indisponible
      </h1>
      <p className="mt-3 text-muted text-sm sm:text-base max-w-md mx-auto">
        Le service de vérification n&apos;a pas pu être joint. Vérifiez votre
        connexion et réessayez dans un instant.
      </p>
      <div className="mt-7 flex justify-center">
        <Button onClick={onRetry}>Réessayer</Button>
      </div>
    </div>
  );
}
