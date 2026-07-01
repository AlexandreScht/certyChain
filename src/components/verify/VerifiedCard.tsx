"use client";

import { type JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Award,
  BadgeCheck,
  CalendarDays,
  Check,
  GraduationCap,
  ShieldCheck,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui";
import type { VerificationResultDTO } from "@contract/dto";
import { Confetti } from "./Confetti";

type VerifiedDiploma = NonNullable<VerificationResultDTO["diploma"]>;

interface VerifiedCardProps {
  diploma: VerifiedDiploma;
  engine: string;
}

/** Formats an ISO date as a readable French long date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * Triumphant GREEN state: a glass-strong diploma card surfacing the minimal
 * disclosed fields, an authenticity badge, the issuer-certificate status and
 * the proof engine id. Confetti + checkmark draw are reduced-motion safe.
 */
export function VerifiedCard({
  diploma,
  engine,
}: VerifiedCardProps): JSX.Element {
  const reduce = useReducedMotion();
  const certValid = diploma.issuerCertificateValid;

  const fields: { icon: typeof UserRound; label: string; value: string }[] = [
    { icon: UserRound, label: "Titulaire", value: diploma.holderName },
    { icon: GraduationCap, label: "Diplôme", value: diploma.programTitle },
    {
      icon: Award,
      label: "Mention",
      value: diploma.mention ?? "—",
    },
    // RNCP shown only when the certified title is registered (many are not).
    ...(diploma.rncp
      ? [{ icon: BadgeCheck, label: "Titre RNCP", value: diploma.rncp }]
      : []),
    {
      icon: CalendarDays,
      label: "Date d'obtention",
      value: formatDate(diploma.issuedAt),
    },
  ];

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0.2 : 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative w-full"
    >
      <Confetti />

      {/* Animated success ring + checkmark */}
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
          Diplôme <span className="grad-text-cool">authentique</span>
        </h1>
        <p className="mt-2 text-muted text-sm sm:text-base max-w-md mx-auto">
          La signature cryptographique a été vérifiée avec succès. Ce diplôme est
          bien celui émis par l&apos;établissement.
        </p>
      </div>

      {/* Diploma card */}
      <div className="relative glass-strong rounded-[1.75rem] p-6 sm:p-7 overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-px left-6 right-6 h-px bg-linear-to-r from-transparent via-success/50 to-transparent"
        />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-xl grid place-items-center bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_6px_16px_-6px_rgba(79,70,229,0.6)]">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                Établissement émetteur
              </div>
              <div className="font-display font-bold text-ink truncate">
                {diploma.schoolName}
              </div>
            </div>
          </div>
          <Badge tone="success" dot pulse className="shrink-0">
            Authenticité vérifiée
          </Badge>
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          {fields.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className="rounded-2xl neumorph-inset px-4 py-3 flex items-start gap-3"
              >
                <span className="shrink-0 w-7 h-7 rounded-lg grid place-items-center bg-white/70 dark:bg-white/10 text-indigo-600">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-soft font-semibold">
                    {f.label}
                  </div>
                  <div className="text-sm font-semibold text-ink break-words">
                    {f.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Issuer certificate status */}
        <div
          className={[
            "mt-4 rounded-2xl px-4 py-3 flex items-center gap-3",
            certValid ? "bg-success/10" : "bg-amber-500/10",
          ].join(" ")}
        >
          <span
            className={[
              "shrink-0 w-8 h-8 rounded-lg grid place-items-center text-white",
              certValid ? "bg-success" : "bg-amber-500",
            ].join(" ")}
          >
            {certValid ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <ShieldAlert className="w-4 h-4" />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">
              {certValid
                ? "Certificat établissement valide"
                : "Certificat établissement non valide"}
            </div>
            <div className="text-xs text-muted">
              {certValid
                ? "L'identité de l'établissement émetteur est certifiée (PKI)."
                : "L'identité de l'établissement émetteur n'a pas pu être confirmée."}
            </div>
          </div>
          {certValid && (
            <Check className="ml-auto w-4 h-4 text-success shrink-0" />
          )}
        </div>

        {/* Engine footer */}
        <div className="mt-5 pt-4 border-t border-hairline flex items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted font-medium">
            <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />
            Preuve à divulgation nulle vérifiée
          </div>
          <div className="font-mono text-muted-soft truncate">
            moteur · {engine}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
