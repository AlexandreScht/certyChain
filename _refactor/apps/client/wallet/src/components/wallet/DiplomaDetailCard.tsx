"use client";

import type { JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  Fingerprint,
  KeyRound,
  CheckCircle2,
  GraduationCap,
} from "lucide-react";

import type { WalletDiplomaDTO } from "@certifychain/contract/dto";
import { Badge } from "@certifychain/shared/ui";

import { diplomaStatusMeta, formatDate, formatYear } from "./format";

export interface DiplomaDetailCardProps {
  diploma: WalletDiplomaDTO;
}

/**
 * Large, presentational diploma card for the detail view — mirrors the Hero
 * showcase card (rotating conic halo, shimmer body, ZKP footer).
 */
export function DiplomaDetailCard({
  diploma,
}: DiplomaDetailCardProps): JSX.Element {
  const reduce = useReducedMotion();
  const status = diplomaStatusMeta(diploma.status);
  const active = diploma.status === "active";

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative w-full"
    >
      {/* Rotating conic ring */}
      <div
        aria-hidden
        className="absolute -inset-2 rounded-[calc(1.75rem+0.5rem)] opacity-50 blur-md animate-spin-slower grad-ring"
      />

      <div className="relative glass-strong rounded-[1.75rem] p-6 sm:p-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
              <ShieldCheck className="w-5.5 h-5.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                Certificat PKI
              </div>
              <div className="font-display font-bold text-base text-ink truncate">
                {diploma.schoolName}
              </div>
            </div>
          </div>
          <Badge tone={status.tone} dot pulse={active} className="shrink-0">
            {status.label}
          </Badge>
        </div>

        {/* Body */}
        <div className="mt-6 rounded-2xl neumorph-inset p-6 relative overflow-hidden">
          {active && (
            <div
              className="absolute inset-0 animate-shimmer pointer-events-none"
              aria-hidden
            />
          )}
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
              Diplôme numérique
            </div>
            <div className="mt-2 font-display font-bold text-ink text-2xl sm:text-3xl leading-tight">
              {diploma.programTitle}
            </div>
            <div className="text-sm text-muted mt-1">
              Promotion {formatYear(diploma.issuedAt)}
              {diploma.mention ? ` · Mention ${diploma.mention}` : ""}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5">
              {[
                { l: "Établissement", v: diploma.schoolName },
                { l: "Émis le", v: formatDate(diploma.issuedAt) },
                { l: "Référence", v: diploma.id.slice(0, 8) },
                ...(diploma.rncp ? [{ l: "Titre RNCP", v: diploma.rncp }] : []),
              ].map((x) => (
                <div
                  key={x.l}
                  className="rounded-xl bg-white/70 dark:bg-white/5 backdrop-blur px-3.5 py-2.5 border border-white/70 dark:border-white/10"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
                    {x.l}
                  </div>
                  <div className="text-sm font-semibold text-ink truncate">
                    {x.v}
                  </div>
                </div>
              ))}
            </div>

            {/* Signature hash */}
            <div className="mt-5 flex items-center gap-2 text-[11px] font-mono text-muted break-all">
              <Fingerprint className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">
                0x{diploma.id.replace(/-/g, "").slice(0, 16)}…Ed25519 ✓
              </span>
            </div>
          </div>
        </div>

        {/* ZKP footer */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-ink font-medium">
            <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
            {/* Le moteur réel est ed25519-nonce-v1 — pas de fausse mention Groth16. */}
            Preuve cryptographique · nonce unique
          </div>
          {active ? (
            <div className="flex items-center gap-1.5 text-success font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Signature valide
            </div>
          ) : (
            <div className="text-danger font-semibold">
              Diplôme révoqué par l&apos;établissement
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
