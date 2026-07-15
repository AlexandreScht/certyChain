"use client";

import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Button, ToastProvider, useToast } from "@certifychain/shared/ui";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";
import { ApiClientError, verifyChallenge, verifyProof } from "@/lib/api";
import type { VerificationResultDTO } from "@certifychain/contract/dto";
import {
  verifyProofBundle,
  type VerifyOutcome,
} from "@certifychain/shared/crypto/verify-bundle";
import { VerifyScan } from "./VerifyScan";
import { VerifiedCard } from "./VerifiedCard";
import { VerifiedBundleCard } from "./VerifiedBundleCard";
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
      <VerifyExperienceInner token={token} />
    </ToastProvider>
  );
}

function VerifyExperienceInner({ token }: VerifyExperienceProps): JSX.Element {
  const reduce = useReducedMotion();
  const { error: toastError } = useToast();

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<VerificationResultDTO | null>(null);
  // v2 only: the verdict computed by THIS browser (`verifyProofBundle`). It, not
  // the server, decides whether we show "Vérifié". Null for v1 legacy diplomas.
  const [clientOutcome, setClientOutcome] = useState<VerifyOutcome | null>(null);
  const inFlight = useRef(false);

  const runVerification = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("loading");
    setResult(null);
    setClientOutcome(null);

    try {
      const { nonce } = await verifyChallenge(token);
      const verdict = await verifyProof(token, { nonce });
      // v2: re-run the FULL crypto verification locally, in the browser. The
      // displayed verdict is this outcome — never the server's word alone.
      const outcome = verdict.proofBundle
        ? await verifyProofBundle(verdict.proofBundle)
        : null;
      setResult(verdict);
      setClientOutcome(outcome);
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

        {/* Right cluster: the theme toggle lives IN the header flow (was a fixed
            overlay that covered this badge on every viewport < ~1088px). The
            reassurance badge is decorative → hidden on the smallest screens. */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex glass rounded-full px-3 py-1.5 items-center gap-1.5 text-xs font-medium text-ink-soft">
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            Vérification sécurisée
          </span>
          <ThemeToggle />
        </div>
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
            <ResultCard
              key="result"
              result={result}
              clientOutcome={clientOutcome}
              onRetry={runVerification}
            />
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
          Vérifié dans votre navigateur · sans inscription · sans nous faire confiance
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

/**
 * Chooses which outcome card to render.
 *
 * v2 (`proofBundle` present): the verdict is DRIVEN BY THE CLIENT outcome. We
 * show "Vérifié" only when the browser said `ok` AND revocation is active. A
 * `revoked` server result OR `revocation.status === "revoked"` is a DISTINCT
 * revoked state (crypto valid ≠ diploma valid — never show "Vérifié" on crypto
 * alone). Any other case (client `ok:false`) is an invalid verdict.
 *
 * v1 (`proofBundle === null`): strictly the historical behaviour, untouched.
 */
function ResultCard({
  result,
  clientOutcome,
  onRetry,
}: {
  result: VerificationResultDTO;
  clientOutcome: VerifyOutcome | null;
  onRetry: () => void;
}): JSX.Element {
  const bundle = result.proofBundle;

  // ── v2 selective-disclosure path ────────────────────────────────────────
  if (bundle) {
    const revoked =
      result.result === "revoked" || bundle.revocation.status === "revoked";

    if (revoked) {
      return (
        <motion.div key="revoked" className="w-full">
          <FailedCard result="revoked" onRetry={onRetry} retrying={false} />
        </motion.div>
      );
    }
    if (clientOutcome?.ok && bundle.revocation.status === "active") {
      return (
        <motion.div key="verified-v2" className="w-full">
          <VerifiedBundleCard
            bundle={bundle}
            disclosed={clientOutcome.disclosed}
            hidden={clientOutcome.hidden}
          />
        </motion.div>
      );
    }
    // The browser could NOT validate the proof → invalid, whatever the server said.
    return (
      <motion.div key="invalid-v2" className="w-full">
        <FailedCard result="invalid" onRetry={onRetry} retrying={false} />
      </motion.div>
    );
  }

  // ── v1 legacy path (unchanged) ──────────────────────────────────────────
  if (result.result === "verified" && result.diploma) {
    return (
      <motion.div key="verified" className="w-full">
        <VerifiedCard diploma={result.diploma} engine={result.engine} />
      </motion.div>
    );
  }
  return (
    <motion.div key="failed" className="w-full">
      <FailedCard
        result={result.result as FailedResult}
        onRetry={onRetry}
        retrying={false}
      />
    </motion.div>
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
