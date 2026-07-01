"use client";

import { type JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, FileX2, ShieldX, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import type { VerificationResult } from "@contract/enums";

/** A non-"verified" outcome (i.e. anything we render as a failure state). */
export type FailedResult = Exclude<VerificationResult, "verified">;

interface FailureCopy {
  title: string;
  explanation: string;
  icon: LucideIcon;
  /** `danger` → red treatment, `neutral` → muted treatment. */
  tone: "danger" | "neutral";
}

/**
 * Maps each non-verified outcome to its French message (per the cahier) and a
 * single-line explanation. Document content is NEVER surfaced here.
 */
const COPY: Record<FailedResult, FailureCopy> = {
  not_found: {
    title: "Diplôme introuvable ou révoqué",
    explanation:
      "Aucun diplôme valide ne correspond à ce lien, ou il a été révoqué par l'établissement.",
    icon: FileX2,
    tone: "danger",
  },
  revoked: {
    title: "Diplôme révoqué",
    explanation:
      "Ce diplôme a été révoqué par l'établissement émetteur et n'est plus valide.",
    icon: ShieldX,
    tone: "danger",
  },
  expired: {
    title: "Lien expiré",
    explanation:
      "Ce lien de vérification a expiré. Demandez au titulaire de partager un nouveau lien.",
    icon: Clock,
    tone: "neutral",
  },
  invalid: {
    title: "Vérification invalide",
    explanation:
      "La preuve cryptographique n'a pas pu être validée. Le lien est invalide ou altéré.",
    icon: XCircle,
    tone: "danger",
  },
};

interface FailedCardProps {
  result: FailedResult;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Clear failure state. Red for tampering/revocation, neutral for an expired
 * link. Offers a single retry action; reduced-motion safe.
 */
export function FailedCard({
  result,
  onRetry,
  retrying,
}: FailedCardProps): JSX.Element {
  const reduce = useReducedMotion();
  const copy = COPY[result];
  const Icon = copy.icon;
  const danger = copy.tone === "danger";

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0.2 : 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="w-full"
      role="alert"
    >
      <div className="glass-strong rounded-[1.75rem] p-7 sm:p-9 text-center">
        <div className="relative grid place-items-center mb-6">
          <span
            aria-hidden
            className={[
              "absolute w-20 h-20 rounded-full",
              danger ? "bg-danger/15" : "bg-muted-soft/15",
            ].join(" ")}
          />
          <motion.div
            initial={reduce ? { scale: 1 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 240,
              damping: 18,
              delay: reduce ? 0 : 0.1,
            }}
            className={[
              "relative w-[4.5rem] h-[4.5rem] rounded-full grid place-items-center text-white",
              danger
                ? "bg-linear-to-br from-danger to-rose-500 shadow-[0_14px_34px_-10px_rgba(239,68,68,0.55)]"
                : "bg-linear-to-br from-muted to-muted-soft shadow-[0_14px_34px_-10px_rgba(91,100,116,0.45)]",
            ].join(" ")}
          >
            <Icon className="w-8 h-8" />
          </motion.div>
        </div>

        <h1 className="font-display font-bold text-ink text-[clamp(1.5rem,4vw,2rem)] leading-tight">
          {copy.title}
        </h1>
        <p className="mt-3 text-muted text-sm sm:text-base max-w-md mx-auto">
          {copy.explanation}
        </p>

        <p className="mt-5 text-xs text-muted-soft max-w-sm mx-auto">
          Pour votre protection, aucun contenu du document n&apos;est affiché
          lorsqu&apos;une vérification échoue.
        </p>

        <div className="mt-7 flex justify-center">
          <Button variant="ghost" onClick={onRetry} loading={retrying}>
            Réessayer la vérification
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
