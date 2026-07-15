"use client";

import { type JSX } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Download,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button } from "@certifychain/shared/ui";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import {
  downloadProofBundle,
  fieldLabel,
  formatDisclosedValue,
  formatTime,
  hiddenFieldsLabel,
} from "@/lib/verify-display";
import { Confetti } from "./Confetti";
import { TransparencyPanel } from "./TransparencyPanel";

interface VerifiedBundleCardProps {
  /** The raw bundle (for the JSON download and the school/revocation metadata). */
  bundle: ProofBundleDTO;
  /** Fields the BROWSER verifier recovered — the displayed verdict is client-side. */
  disclosed: Record<string, unknown>;
  /** Number of fields the holder chose to keep hidden. */
  hidden: number;
}

/**
 * v2 « Vérifié » state (ed25519-sd-v2). The verdict shown here is the one the
 * recruiter's BROWSER computed (`verifyProofBundle`), NOT the server's — the page
 * only reaches this card when the client outcome is `ok` AND revocation is active.
 *
 * It states honestly WHAT was checked locally (signature + PKI chain + how many
 * fields are hidden), surfaces the revocation timestamp separately (that fact
 * needed the network), and never reveals a hidden field — only their count.
 */
export function VerifiedBundleCard({
  bundle,
  disclosed,
  hidden,
}: VerifiedBundleCardProps): JSX.Element {
  const reduce = useReducedMotion();
  const entries = Object.entries(disclosed);

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0.2 : 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative w-full"
    >
      <Confetti />

      {/* Success ring + checkmark draw */}
      <div className="relative grid place-items-center mb-7">
        <span
          aria-hidden
          className="absolute w-24 h-24 rounded-full bg-success/25 animate-pulse-ring"
        />
        <motion.div
          initial={reduce ? { scale: 1 } : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 18,
            delay: reduce ? 0 : 0.15,
          }}
          className="relative w-20 h-20 rounded-full grid place-items-center bg-linear-to-br from-success to-emerald-400 text-white shadow-[0_14px_34px_-10px_rgba(16,185,129,0.6)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-9 h-9"
            aria-hidden
          >
            <motion.path
              d="M5 13l4 4L19 7"
              initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.4 }}
            />
          </svg>
        </motion.div>
      </div>

      <div className="text-center mb-6">
        <h1 className="font-display font-bold text-ink text-[clamp(1.6rem,4vw,2.25rem)] leading-tight">
          Diplôme <span className="grad-text-cool">vérifié</span>
        </h1>
        <p className="mt-2 text-muted text-sm sm:text-base max-w-md mx-auto">
          La preuve a été vérifiée dans votre navigateur. Ce diplôme est bien
          celui émis par l&apos;établissement.
        </p>
      </div>

      <div className="relative glass-strong rounded-[1.75rem] p-6 sm:p-7 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-px left-6 right-6 h-px bg-linear-to-r from-transparent via-success/50 to-transparent"
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
              Établissement émetteur
            </div>
            <div className="font-display font-bold text-ink truncate">
              {bundle.school.name}
            </div>
          </div>
          <Badge tone="success" dot pulse className="shrink-0">
            Authenticité vérifiée
          </Badge>
        </div>

        {/* Disclosed fields (only what the holder chose to reveal) */}
        {entries.length > 0 && (
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {entries.map(([name, value]) => (
              <div
                key={name}
                className="rounded-2xl neumorph-inset px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
                  {fieldLabel(name)}
                </div>
                <div className="text-sm font-semibold text-ink break-words">
                  {formatDisclosedValue(name, value)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hidden-field count — the value proposition made tangible */}
        {hidden > 0 && (
          <div className="mt-3 rounded-2xl bg-indigo-500/8 px-4 py-3 flex items-center gap-3">
            <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-indigo-100 text-indigo-600">
              <EyeOff className="w-4 h-4" />
            </span>
            <div className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">
                {hiddenFieldsLabel(hidden)}
              </span>{" "}
              par le titulaire — leur contenu ne vous est pas transmis.
            </div>
          </div>
        )}

        {/* What was verified LOCALLY (the honest selling point) */}
        <div className="mt-4 rounded-2xl bg-success/10 px-4 py-3 flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-success text-white">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0 text-sm text-ink-soft">
            Signature de l&apos;école vérifiée{" "}
            <span className="font-semibold text-ink">dans votre navigateur</span>{" "}
            · certificat validé contre la racine CertifyChain ·{" "}
            {hiddenFieldsLabel(hidden)} par le titulaire.
          </div>
        </div>

        {/* Revocation status — a fact posterior to signing (needed the network) */}
        <div className="mt-3 rounded-2xl neumorph-inset px-4 py-3 flex items-center gap-3">
          <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-white/70 dark:bg-white/10 text-indigo-600">
            <BadgeCheck className="w-4 h-4" />
          </span>
          <div className="text-sm text-ink-soft">
            Statut de révocation :{" "}
            <span className="font-semibold text-ink">
              vérifié auprès de CertifyChain à {formatTime(bundle.revocation.checkedAt)}
            </span>
          </div>
        </div>

        {/* Registre public de transparence (v2.md §V3) — absent si le diplôme
            est antérieur au registre ; vérifié dans CE navigateur. */}
        <TransparencyPanel bundle={bundle} />

        {/* Actions */}
        <div className="mt-5 pt-4 border-t border-hairline flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={() => downloadProofBundle(bundle)}
          >
            Télécharger la preuve (JSON)
          </Button>
          <Link
            href="/verifier"
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Vérifier vous-même, hors ligne
            <ArrowRight className="w-4 h-4" />
          </Link>
          <span className="sm:ml-auto flex items-center gap-1.5 text-[11px] font-mono text-muted-soft">
            <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />
            moteur · {bundle.engine}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
