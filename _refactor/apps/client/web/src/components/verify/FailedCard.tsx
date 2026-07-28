"use client";

import { type JSX } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FileQuestion } from "lucide-react";
import { Button } from "@certifychain/shared/ui";
import type { VerificationResult } from "@certifychain/contract/enums";

/** A non-"verified" outcome (i.e. anything we render as a failure state). */
export type FailedResult = Exclude<VerificationResult, "verified">;

interface FailedCardProps {
  /**
   * The internal 5-state result (`not_found` | `revoked` | `expired` |
   * `invalid`) — PLAN.md P6 / audit R1 / `docs/architecture.md` §12.1-§12.2.
   * The 5 states stay real everywhere that matters (the API response, the
   * audit log, the school's own dashboard): this prop is threaded through so
   * call sites keep passing the value they actually have, but it is
   * DELIBERATELY not used to change what is rendered below. Telling an
   * anonymous verifier apart WHY a diploma didn't verify — revoked vs
   * expired-link vs unknown vs tampered-proof — is exactly the oracle a
   * public, account-less surface must not hand out; it's the same
   * anti-enumeration reasoning as the uniform 404 already used on
   * `GET /verify/revocation/:id`. Every non-verified outcome renders the
   * SAME "introuvable" card — one message, one tone, one icon.
   */
  result: FailedResult;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Fused public failure state (P6: 5 → 2). Neutral tone on purpose, not red:
 * "introuvable" covers an expired link as often as a genuine tampering
 * attempt, and we cannot honestly tell the recruiter which one it is — so we
 * don't perform alarm we can't back up. Offers a single retry action;
 * reduced-motion safe.
 */
export function FailedCard({
  result: _result,
  onRetry,
  retrying,
}: FailedCardProps): JSX.Element {
  const reduce = useReducedMotion();

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
          <span aria-hidden className="absolute w-20 h-20 rounded-full bg-muted-soft/15" />
          <motion.div
            initial={reduce ? { scale: 1 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 240,
              damping: 18,
              delay: reduce ? 0 : 0.1,
            }}
            className="relative w-[4.5rem] h-[4.5rem] rounded-full grid place-items-center text-white bg-linear-to-br from-muted to-muted-soft shadow-[0_14px_34px_-10px_rgba(91,100,116,0.45)]"
          >
            <FileQuestion className="w-8 h-8" />
          </motion.div>
        </div>

        <h1 className="font-display font-bold text-ink text-[clamp(1.5rem,4vw,2rem)] leading-tight">
          Diplôme introuvable
        </h1>
        <p className="mt-3 text-muted text-sm sm:text-base max-w-md mx-auto">
          Aucune preuve valide n&apos;a été trouvée pour ce lien. Il peut être
          invalide, expiré ou révoqué, ou l&apos;établissement peut l&apos;avoir
          retiré — demandez au titulaire un lien à jour.
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
