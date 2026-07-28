"use client";

import { type ChangeEvent, type JSX, useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  EyeOff,
  FileJson,
  Layers,
  Loader2,
  ShieldCheck,
  ShieldX,
  Upload,
  Wifi,
  XCircle,
} from "lucide-react";
import { Badge, Button } from "@certifychain/shared/ui";
import ThemeToggle from "@certifychain/shared/ui/ThemeToggle";
import type { ProofBundleDTO } from "@certifychain/contract/dto";
import {
  verifyProofBundle,
  type VerifyOutcome,
} from "@certifychain/shared/crypto/verify-bundle";
import { ApiClientError, apiErrorMessage, checkRevocation } from "@/lib/api";
import { TRUSTED_ROOTS } from "@/lib/trusted-roots";
import {
  fieldLabel,
  formatDisclosedValue,
  formatTime,
  hiddenFieldsLabel,
} from "@/lib/verify-display";
import { TransparencyPanel } from "./TransparencyPanel";

/** Result of the LOCAL (offline) crypto verification. */
type LocalState =
  | { kind: "idle" }
  | { kind: "outcome"; outcome: VerifyOutcome; bundle: ProofBundleDTO }
  | { kind: "parse-error"; message: string };

/** Result of the OPTIONAL online revocation re-check (network required). */
type RevocationState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "active"; checkedAt: string }
  | { kind: "revoked" }
  | { kind: "error"; message: string };

/** Minimal structural guard so a random JSON gives a friendly message. */
function looksLikeBundle(value: unknown): value is ProofBundleDTO {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.signature === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null &&
    typeof v.school === "object" &&
    v.school !== null
  );
}

/**
 * Public, account-less, OFFLINE verifier (`/verifier`). Paste or drop a proof
 * bundle → `verifyProofBundle` runs entirely in the browser (no network). The
 * revocation status is a separate, explicitly-online step: a button hits the
 * CertifyChain oracle, where a 404 means "revoked OR unknown".
 */
export function OfflineVerifier(): JSX.Element {
  const [raw, setRaw] = useState("");
  const [local, setLocal] = useState<LocalState>({ kind: "idle" });
  const [revocation, setRevocation] = useState<RevocationState>({ kind: "idle" });
  const [verifying, setVerifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runLocalVerify = useCallback(async () => {
    setRevocation({ kind: "idle" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setLocal({ kind: "parse-error", message: "Ce texte n'est pas un JSON valide." });
      return;
    }
    if (!looksLikeBundle(parsed)) {
      setLocal({
        kind: "parse-error",
        message: "Ce fichier n'est pas une preuve CertifyChain (structure inattendue).",
      });
      return;
    }
    setVerifying(true);
    try {
      const outcome = await verifyProofBundle(parsed, TRUSTED_ROOTS);
      setLocal({ kind: "outcome", outcome, bundle: parsed });
    } finally {
      setVerifying(false);
    }
  }, [raw]);

  const onFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      setRaw(text);
      setLocal({ kind: "idle" });
      setRevocation({ kind: "idle" });
    });
  }, []);

  const runRevocationCheck = useCallback(async (diplomaId: string) => {
    setRevocation({ kind: "checking" });
    try {
      const { checkedAt } = await checkRevocation(diplomaId);
      setRevocation({ kind: "active", checkedAt });
    } catch (err) {
      // A uniform 404 = revoked OR unknown (anti-enumeration). Anything else is
      // a transport problem we surface as such — including a 429 from this
      // endpoint's own IP rate-limit (RATE_LIMIT.VERIFY_REVOCATION_IP), which
      // `apiErrorMessage` turns into a concrete "réessayez dans Xs" (audit R6)
      // instead of the flat generic text this used to show unconditionally.
      if (err instanceof ApiClientError && err.status === 404) {
        setRevocation({ kind: "revoked" });
      } else {
        setRevocation({
          kind: "error",
          message: apiErrorMessage(
            err,
            "Impossible de joindre le service de révocation. Réessayez plus tard.",
          ),
        });
      }
    }
  }, []);

  return (
    <main className="relative min-h-svh flex flex-col bg-mesh noise overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(99,102,241,0.28), rgba(99,102,241,0) 70%)",
          filter: "blur(44px)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group cursor-pointer shrink-0">
          <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-linear-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.7)]">
            <ShieldCheck className="w-5 h-5" strokeWidth={2.2} />
          </span>
          <span className="font-display font-bold text-ink text-lg tracking-tight">
            Certify<span className="grad-text-cool">Chain</span>
          </span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 w-full max-w-2xl mx-auto px-6 py-10 sm:py-14">
        <div className="text-center mb-8">
          <span className="inline-flex glass rounded-full px-3 py-1.5 items-center gap-1.5 text-xs font-medium text-ink-soft">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            Vérificateur hors ligne
          </span>
          <h1 className="mt-4 font-display font-bold text-ink text-[clamp(1.6rem,4vw,2.25rem)] leading-tight">
            Vérifiez une preuve <span className="grad-text-cool">vous-même</span>
          </h1>
          <p className="mt-3 text-muted text-sm sm:text-base max-w-lg mx-auto">
            Déposez ou collez un fichier de preuve. La vérification cryptographique
            s&apos;exécute{" "}
            <span className="font-semibold text-ink-soft">
              entièrement dans votre navigateur
            </span>
            , sans compte et sans réseau. Le statut de révocation, lui, nécessite
            une requête à CertifyChain.
          </p>
        </div>

        {/* Input card */}
        <div className="glass-strong rounded-[1.75rem] p-6 sm:p-7">
          <label
            htmlFor="bundle-input"
            className="text-[11px] uppercase tracking-wider text-muted-soft font-semibold"
          >
            Preuve (JSON)
          </label>
          <textarea
            id="bundle-input"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setLocal({ kind: "idle" });
              setRevocation({ kind: "idle" });
            }}
            spellCheck={false}
            rows={7}
            placeholder='{ "engine": "ed25519-sd-v2", "payload": { … }, … }'
            className="mt-2 w-full rounded-2xl neumorph-inset bg-transparent px-4 py-3 font-mono text-xs text-ink placeholder:text-muted-soft resize-y focus:outline-2 focus:outline-indigo-500 focus:outline-offset-2"
          />

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <Button
              onClick={runLocalVerify}
              disabled={raw.trim().length === 0}
              loading={verifying}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Vérifier hors ligne
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={onFile}
              className="hidden"
              aria-label="Charger un fichier de preuve JSON"
            />
            <Button
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Upload className="w-4 h-4" />}
            >
              Charger un fichier
            </Button>
          </div>
        </div>

        {/* Local (offline) result */}
        {local.kind === "parse-error" && (
          <div
            role="alert"
            className="mt-5 glass rounded-2xl px-5 py-4 flex items-start gap-3"
          >
            <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-amber-500 text-white">
              <FileJson className="w-4 h-4" />
            </span>
            <p className="text-sm text-ink-soft">{local.message}</p>
          </div>
        )}

        {local.kind === "outcome" && !local.outcome.ok && (
          <div
            role="alert"
            className="mt-5 glass-strong rounded-[1.5rem] p-6 text-center"
          >
            <div className="mx-auto w-14 h-14 rounded-full grid place-items-center bg-linear-to-br from-danger to-rose-500 text-white">
              <XCircle className="w-7 h-7" />
            </div>
            <h2 className="mt-4 font-display font-bold text-ink text-lg">
              Preuve invalide
            </h2>
            <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
              La vérification cryptographique a échoué. Cette preuve est invalide
              ou a été altérée.
            </p>
            <p className="mt-3 text-[11px] font-mono text-muted-soft break-words">
              motif · {local.outcome.reason}
            </p>
          </div>
        )}

        {local.kind === "outcome" && local.outcome.ok && (
          <OfflineVerifiedResult
            outcome={local.outcome}
            bundle={local.bundle}
            revocation={revocation}
            onCheckRevocation={runRevocationCheck}
          />
        )}

        <p className="mt-8 text-center text-xs text-muted-soft max-w-md mx-auto">
          Cette page fonctionne même hors ligne : la validité cryptographique ne
          dépend pas de nos serveurs. C&apos;est la preuve que votre diplôme vous
          appartient vraiment.
        </p>
      </div>
    </main>
  );
}

/* ── Verified (offline) sub-view ─────────────────────────────────────────── */

function OfflineVerifiedResult({
  outcome,
  bundle,
  revocation,
  onCheckRevocation,
}: {
  outcome: Extract<VerifyOutcome, { ok: true }>;
  bundle: ProofBundleDTO;
  revocation: RevocationState;
  onCheckRevocation: (diplomaId: string) => void;
}): JSX.Element {
  const entries = Object.entries(outcome.disclosed);
  return (
    <div className="mt-5 glass-strong rounded-[1.75rem] p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="shrink-0 w-11 h-11 rounded-full grid place-items-center bg-linear-to-br from-success to-emerald-400 text-white shadow-[0_10px_26px_-10px_rgba(16,185,129,0.6)]">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div>
            <div className="font-display font-bold text-ink">Preuve valide</div>
            <div className="text-xs text-muted">
              Signature et certificat vérifiés dans votre navigateur.
            </div>
          </div>
        </div>
        <Badge tone="success" dot className="shrink-0">
          Vérifiée localement
        </Badge>
      </div>

      {entries.length > 0 && (
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          {entries.map(([name, value]) => (
            <div key={name} className="rounded-2xl neumorph-inset px-4 py-3">
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

      {outcome.hidden > 0 && (
        <div className="mt-3 rounded-2xl bg-indigo-500/8 px-4 py-3 flex items-center gap-3">
          <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-indigo-100 text-indigo-600">
            <EyeOff className="w-4 h-4" />
          </span>
          <div className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">
              {hiddenFieldsLabel(outcome.hidden)}
            </span>{" "}
            par le titulaire.
          </div>
        </div>
      )}

      {/* Double signature post-quantique (v2.md §V4-1) — seulement pour un
          bundle "sd-v3" (`engine === "ed25519-sd-v3"`). Constat factuel sur
          CETTE preuve vérifiée hors ligne, pas une promesse marketing (copy.md
          §D/§4, `PQ_POLICY` reste `off` par défaut) ; rien n'est affiché pour
          un bundle v2 — une preuve v2 n'est pas « faible », juste antérieure
          au post-quantique. */}
      {bundle.engine === "ed25519-sd-v3" && (
        <div className="mt-3 rounded-2xl bg-indigo-500/8 px-4 py-3 flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center bg-indigo-100 text-indigo-600">
            <Layers className="w-4 h-4" />
          </span>
          <div className="min-w-0 text-sm text-ink-soft">
            <span className="font-semibold text-ink">Double signature vérifiée</span>{" "}
            — cette preuve porte deux signatures indépendantes, Ed25519 et
            post-quantique (ML-DSA-65), toutes deux validées hors ligne dans
            votre navigateur.
          </div>
        </div>
      )}

      {/* Registre public de transparence — vérification 100 % locale, comme le
          reste de cette page : aucun appel réseau. */}
      <TransparencyPanel bundle={bundle} />

      {/* Optional online revocation re-check */}
      <div className="mt-5 pt-4 border-t border-hairline">
        <div className="flex items-center gap-2 text-xs text-muted-soft mb-3">
          <Wifi className="w-3.5 h-3.5" />
          Le statut de révocation nécessite une requête réseau à CertifyChain.
        </div>

        {revocation.kind === "idle" && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<BadgeCheck className="w-4 h-4" />}
            onClick={() => onCheckRevocation(bundle.payload.id)}
          >
            Vérifier la révocation
          </Button>
        )}
        {revocation.kind === "checking" && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Interrogation de CertifyChain…
          </div>
        )}
        {revocation.kind === "active" && (
          <div className="rounded-2xl bg-success/10 px-4 py-3 flex items-center gap-3">
            <BadgeCheck className="w-5 h-5 text-success shrink-0" />
            <div className="text-sm text-ink-soft">
              Diplôme{" "}
              <span className="font-semibold text-ink">actif</span> — vérifié à{" "}
              {formatTime(revocation.checkedAt)}.
            </div>
          </div>
        )}
        {revocation.kind === "revoked" && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 flex items-center gap-3">
            <ShieldX className="w-5 h-5 text-danger shrink-0" />
            <div className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">Révoqué ou inconnu</span> —
              CertifyChain ne reconnaît pas ce diplôme comme actif. La preuve reste
              cryptographiquement valide, mais le diplôme n&apos;est plus valable.
            </div>
          </div>
        )}
        {revocation.kind === "error" && (
          <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-ink-soft">
            {revocation.message}
          </div>
        )}
      </div>
    </div>
  );
}
