"use client";

import { type JSX, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";

/** Reassuring step copy, surfaced one after another during the proof check. */
const STEPS = [
  { icon: Fingerprint, label: "Génération d'un nonce unique…" },
  { icon: KeyRound, label: "Vérification de la signature Ed25519…" },
  { icon: ShieldCheck, label: "Contrôle du certificat établissement…" },
] as const;

/**
 * Cryptographic "scan" animation shown while the signature is verified
 * server-side. Rotating conic ring + vertical scan beam + pulse halo, with the
 * step copy cycling for reassurance. Fully reduced-motion safe.
 */
export function VerifyScan(): JSX.Element {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduce) {
      setActive(STEPS.length - 1);
      return;
    }
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length);
    }, 1400);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="flex flex-col items-center text-center">
      {/* Crypto core — rotating ring + pulse halo + scan beam */}
      <div className="relative grid place-items-center w-40 h-40 sm:w-48 sm:h-48">
        {/* Pulse halo */}
        <span
          aria-hidden
          className="absolute inset-6 rounded-full bg-indigo-500/30 animate-pulse-ring"
        />
        {/* Rotating conic ring */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full grad-ring opacity-70 blur-[2px] animate-spin-slower"
        />
        <div
          aria-hidden
          className="absolute inset-[3px] rounded-full bg-ivory/80"
        />
        {/* Glass core with scan beam */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full glass-strong grid place-items-center overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-x-0 h-1/3 bg-linear-to-b from-transparent via-cyan-500/40 to-transparent animate-scan"
          />
          <motion.div
            animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
            transition={
              reduce
                ? undefined
                : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
            }
            className="relative w-12 h-12 rounded-2xl grid place-items-center bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_22px_-8px_rgba(79,70,229,0.7)]"
          >
            <ShieldCheck className="w-6 h-6" />
          </motion.div>
        </div>
      </div>

      <h2 className="mt-7 font-display font-bold text-ink text-[clamp(1.25rem,3vw,1.6rem)]">
        Vérification en cours…
      </h2>

      {/* Step list */}
      <ul className="mt-5 w-full max-w-xs space-y-2.5" aria-live="polite">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = reduce || i < active;
          const current = !reduce && i === active;
          return (
            <li
              key={step.label}
              className="flex items-center gap-3 text-left"
              data-state={done ? "done" : current ? "active" : "pending"}
            >
              <span
                className={[
                  "shrink-0 w-7 h-7 rounded-lg grid place-items-center transition-colors duration-300",
                  done || current
                    ? "bg-indigo-100 text-indigo-600"
                    : "neumorph-inset text-muted-soft",
                ].join(" ")}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span
                className={[
                  "text-sm font-medium transition-colors duration-300",
                  done || current ? "text-ink-soft" : "text-muted-soft",
                ].join(" ")}
              >
                {step.label}
              </span>
              {current && (
                <span className="relative ml-auto flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-indigo-500 animate-pulse-ring" />
                  <span className="relative rounded-full w-1.5 h-1.5 bg-indigo-500" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs text-muted-soft max-w-xs">
        Vérification de la signature dans votre navigateur. Aucune donnée ne nous
        est envoyée.
      </p>
    </div>
  );
}
