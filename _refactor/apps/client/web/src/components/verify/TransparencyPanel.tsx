"use client";

import { type JSX, useEffect, useState } from "react";
import { AlertTriangle, Anchor, Clock3, EyeOff, ScrollText } from "lucide-react";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import {
  verifyTransparency,
  type TransparencyOutcome,
} from "@certifychain/shared/crypto/verify-transparency";
import { TRUSTED_ROOTS } from "@/lib/trusted-roots";

/** Date + heure locales FR d'un timestamp ISO (repli : la chaîne brute). */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface TransparencyPanelProps {
  /** The full bundle — `verifyTransparency` re-checks the proof IN THIS BROWSER. */
  bundle: ProofBundleDTO;
}

/**
 * Registre public de transparence (v2.md §V3) — panneau piloté par le CLIENT.
 *
 * Rien n'est affiché quand `bundle.transparency` est absent/null (diplôme émis
 * avant le registre — pas de message négatif). Sinon `verifyTransparency`
 * (100 % local, zéro réseau) s'exécute dans le navigateur :
 *   • ok → position dans le registre + racine signée + statut d'ancrage. On ne
 *     dit JAMAIS « confirmé »/« ancré » avant `otsUpgradedAt` (v2.md §V3-5).
 *   • binding "hash-only" (date d'émission masquée) → note discrète, sans
 *     jamais afficher ni deviner la valeur masquée.
 *   • échec → avertissement NON bloquant : le verdict crypto principal de la
 *     page reste strictement inchangé.
 */
export function TransparencyPanel({ bundle }: TransparencyPanelProps): JSX.Element | null {
  const transparency = bundle.transparency ?? null;
  const [outcome, setOutcome] = useState<TransparencyOutcome | null>(null);

  useEffect(() => {
    if (!transparency) return;
    let cancelled = false;
    void verifyTransparency(bundle, TRUSTED_ROOTS).then((result) => {
      if (!cancelled) setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [bundle, transparency]);

  // Diplôme antérieur au registre → aucun panneau. Vérification en cours → rien
  // non plus (elle est quasi instantanée et purement locale).
  if (!transparency || outcome === null) return null;

  if (!outcome.ok) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-2xl bg-amber-500/10 px-4 py-3 flex items-start gap-3"
      >
        <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-amber-500 text-white">
          <AlertTriangle className="w-4 h-4" />
        </span>
        <div className="min-w-0 text-sm text-ink-soft">
          <span className="font-semibold text-ink">
            L&apos;inscription au registre public n&apos;a pas pu être vérifiée.
          </span>{" "}
          Le verdict de vérification du diplôme ci-dessus reste inchangé.
        </div>
      </div>
    );
  }

  const position = outcome.leafIndex + 1;
  const confirmed = outcome.otsUpgradedAt !== null;

  return (
    <div className="mt-3 rounded-2xl neumorph-inset px-4 py-3 flex items-start gap-3">
      <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-cyan-100 text-cyan-700">
        <ScrollText className="w-4 h-4" />
      </span>
      <div className="min-w-0 text-sm text-ink-soft">
        <div>
          <span className="font-semibold text-ink">
            Inscrit au registre public horodaté
          </span>{" "}
          — position {position.toLocaleString("fr-FR")} (arbre de{" "}
          {outcome.treeSize.toLocaleString("fr-FR")} émission
          {outcome.treeSize > 1 ? "s" : ""}) · racine signée le{" "}
          {formatDateTime(outcome.checkpointTimestamp)}.
        </div>

        {confirmed ? (
          <div className="mt-1.5 flex items-start gap-1.5">
            <Anchor className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-700" aria-hidden />
            <span>
              Horodatage Bitcoin :{" "}
              <span className="font-semibold text-ink">
                confirmé le {formatDateTime(outcome.otsUpgradedAt as string)}
              </span>{" "}
              — racine ancrée dans Bitcoin, zéro donnée personnelle on-chain.
            </span>
          </div>
        ) : (
          <div className="mt-1.5 flex items-start gap-1.5">
            <Clock3 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-soft" aria-hidden />
            <span>
              Ancrage Bitcoin :{" "}
              <span className="font-semibold text-ink">
                en attente de confirmation
              </span>{" "}
              (quelques heures). Zéro donnée personnelle on-chain.
            </span>
          </div>
        )}

        {outcome.binding === "hash-only" && (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-soft">
            <EyeOff className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
            <span>
              Liaison partielle : la date d&apos;émission est masquée,
              l&apos;empreinte reste inscrite au registre.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
