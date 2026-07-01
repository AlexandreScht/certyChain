"use client";

import type { JSX } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, Fingerprint, ArrowUpRight } from "lucide-react";

import type { WalletDiplomaDTO } from "@contract/dto";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

import { diplomaStatusMeta, formatDate, formatYear } from "./format";

export interface DiplomaCardProps {
  diploma: WalletDiplomaDTO;
  /** Entrance animation index for staggered grid reveals. */
  index?: number;
}

/**
 * Wallet diploma card — reuses the Hero diploma-card visual language
 * (glass-strong surface, ShieldCheck medallion, mono signature line).
 * Renders as a link to the diploma detail page.
 */
export function DiplomaCard({
  diploma,
  index = 0,
}: DiplomaCardProps): JSX.Element {
  const reduce = useReducedMotion();
  const status = diplomaStatusMeta(diploma.status);

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.5,
        ease: [0.2, 0.8, 0.2, 1],
        delay: reduce ? 0 : Math.min(index * 0.07, 0.42),
      }}
    >
      <Link
        href={`/${diploma.id}`}
        className="group block rounded-[1.75rem] focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-3"
        aria-label={`Voir le diplôme ${diploma.programTitle}`}
      >
        <div className="relative glass-strong glass-sheen rounded-[1.75rem] p-6 overflow-hidden lift">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
                <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                  Diplôme numérique
                </div>
                <div className="font-display font-bold text-sm text-ink truncate">
                  {diploma.schoolName}
                </div>
              </div>
            </div>
            <Badge
              tone={status.tone}
              dot
              pulse={diploma.status === "active"}
              className="shrink-0"
            >
              {status.label}
            </Badge>
          </div>

          {/* Body */}
          <div className="mt-5 rounded-2xl neumorph-inset p-5">
            <div className="font-display font-bold text-ink text-xl leading-tight">
              {diploma.programTitle}
            </div>
            <div className="text-sm text-muted mt-1">
              Promotion {formatYear(diploma.issuedAt)}
              {diploma.mention ? ` · Mention ${diploma.mention}` : ""}
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-muted">
              <Fingerprint className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">
                Émis le {formatDate(diploma.issuedAt)} · ZKP Groth16
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between text-[11px]">
            <span className="text-muted-soft uppercase tracking-wider font-semibold">
              Réf. {diploma.id.slice(0, 8)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 font-semibold text-indigo-600",
                "transition-transform group-hover:translate-x-0.5",
              )}
            >
              Voir le détail
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
