"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type JSX,
} from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Check,
  Clock3,
  Copy,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  WalletCards,
} from "lucide-react";

import type { EudiOfferDTO } from "@certifychain/contract/dto";
import { Button, Modal, Spinner } from "@certifychain/shared/ui";

import { apiErrorMessage } from "@/lib/api/client";
import { createEudiOffer } from "@/lib/api/endpoints";

export interface EudiExportActionProps {
  diplomaId: string;
  /** Server-computed capability: the client deliberately repeats no eligibility rule. */
  available: boolean;
}

type OfferState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; offer: EudiOfferDTO }
  | { status: "error"; message: string };

const OFFER_SCHEME = "openid-credential-offer://";

function secondsUntil(isoDate: string): number {
  const expiresAt = Date.parse(isoDate);
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000));
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/** Reject malformed API payloads before handing anything to a third-party wallet. */
function isUsableOffer(offer: EudiOfferDTO): boolean {
  return (
    offer.offerDeepLink.startsWith(OFFER_SCHEME) &&
    /^\d{5}$/.test(offer.txCode) &&
    secondsUntil(offer.expiresAt) > 0
  );
}

function errorMessage(error: unknown): string {
  // Delegates to the shared helper — a rate limit (this route is capped per
  // student, see `VC_OFFER` in `apps/server/src/config/constants.ts`) now
  // names its concrete delay instead of falling back to a generic sentence.
  return apiErrorMessage(error, "Impossible de générer l’offre EUDI. Réessayez dans quelques instants.");
}

/**
 * Server-driven EUDI Wallet export action for a diploma detail page.
 * Transaction codes are kept in component memory only and cleared on close.
 */
export function EudiExportAction({
  diplomaId,
  available,
}: EudiExportActionProps): JSX.Element | null {
  const titleId = useId();
  const requestVersion = useRef(0);
  const copyResetTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OfferState>({ status: "idle" });
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const generateOffer = useCallback(async (): Promise<void> => {
    const version = ++requestVersion.current;
    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = null;
    }
    setState({ status: "loading" });
    setCopyState("idle");

    try {
      const offer = await createEudiOffer(diplomaId);
      if (version !== requestVersion.current) return;
      if (!isUsableOffer(offer)) {
        setState({
          status: "error",
          message: "L’offre reçue est invalide ou déjà expirée. Régénérez-la.",
        });
        setRemainingSeconds(0);
        return;
      }
      setRemainingSeconds(secondsUntil(offer.expiresAt));
      setState({ status: "ready", offer });
    } catch (error: unknown) {
      if (version !== requestVersion.current) return;
      setState({ status: "error", message: errorMessage(error) });
      setRemainingSeconds(0);
    }
  }, [diplomaId]);

  useEffect(
    () => () => {
      requestVersion.current += 1;
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open || state.status !== "ready") return;

    const update = (): void => {
      setRemainingSeconds(secondsUntil(state.offer.expiresAt));
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [open, state]);

  const handleOpen = (): void => {
    setOpen(true);
    void generateOffer();
  };

  const handleClose = (): void => {
    requestVersion.current += 1;
    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = null;
    }
    setOpen(false);
    setState({ status: "idle" });
    setRemainingSeconds(0);
    setCopyState("idle");
  };

  const copyTransactionCode = async (): Promise<void> => {
    if (state.status !== "ready" || remainingSeconds === 0) return;
    try {
      await navigator.clipboard.writeText(state.offer.txCode);
      setCopyState("copied");
      copyResetTimer.current = window.setTimeout(() => {
        copyResetTimer.current = null;
        setCopyState("idle");
      }, 2_000);
    } catch {
      setCopyState("error");
    }
  };

  if (!available) return null;

  const expired = state.status === "ready" && remainingSeconds === 0;

  return (
    <section
      aria-labelledby={titleId}
      className="glass-strong rounded-[1.75rem] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          <WalletCards className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="font-display text-base font-bold text-ink"
          >
            Portefeuille européen
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Exportez ce diplôme vers une application compatible EUDI Wallet.
          </p>
        </div>
      </div>

      <Button
        fullWidth
        className="mt-4"
        leftIcon={<Smartphone className="h-4.5 w-4.5" aria-hidden />}
        onClick={handleOpen}
      >
        Ajouter à mon portefeuille européen (EUDI)
      </Button>

      <Modal
        open={open}
        onClose={handleClose}
        title="Ajouter ce diplôme à votre EUDI Wallet"
        description="Compatible avec les portefeuilles d’identité européens (EUDI Wallet) — standards ouverts OpenID4VCI / SD-JWT VC."
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        footer={
          <>
            <Button variant="ghost" onClick={handleClose}>
              Fermer
            </Button>
            <Button
              variant="subtle"
              loading={state.status === "loading"}
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
              onClick={() => void generateOffer()}
            >
              Régénérer l’offre
            </Button>
          </>
        }
      >
        {state.status === "loading" && (
          <div className="grid min-h-64 place-items-center text-indigo-600">
            <div className="flex flex-col items-center gap-3 text-center">
              <Spinner size="lg" label="Génération de l’offre EUDI…" />
              <p className="text-sm text-muted">Préparation de l’offre sécurisée…</p>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/20 bg-danger/8 p-4 text-danger"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden />
              <p>{state.message}</p>
            </div>
          </div>
        )}

        {state.status === "ready" && !expired && (
          <div className="flex flex-col items-center">
            <div className="rounded-2xl border border-hairline bg-white p-3 shadow-sm">
              <QRCodeCanvas
                value={state.offer.offerDeepLink}
                size={184}
                level="M"
                marginSize={1}
                fgColor="#0A0F2C"
                bgColor="#FFFFFF"
                role="img"
                aria-label="QR code de l’offre EUDI"
                data-testid="eudi-offer-qr"
              />
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-muted">
              Scannez le QR code avec votre application portefeuille, puis saisissez
              ce code de transaction&nbsp;:
            </p>

            <button
              type="button"
              onClick={() => void copyTransactionCode()}
              aria-label="Copier le code de transaction"
              className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-indigo-800 transition-colors hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200"
            >
              <span className="font-display text-3xl font-bold tracking-[0.3em] tabular-nums">
                {state.offer.txCode}
              </span>
              {copyState === "copied" ? (
                <Check className="h-5 w-5 text-success" aria-hidden />
              ) : (
                <Copy className="h-5 w-5" aria-hidden />
              )}
            </button>

            <p
              role="status"
              aria-live="polite"
              className="mt-2 min-h-5 text-xs text-muted"
            >
              {copyState === "copied" && "Code copié."}
            </p>
            {copyState === "error" && (
              <p role="alert" className="-mt-5 text-xs text-danger">
                Copie impossible. Saisissez le code manuellement.
              </p>
            )}

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink dark:bg-white/8">
              <Clock3 className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
              Expire dans
              <span
                role="timer"
                aria-label={`${remainingSeconds} secondes restantes`}
                className="font-mono tabular-nums"
              >
                {formatCountdown(remainingSeconds)}
              </span>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>
                Le code se saisit dans votre application portefeuille. Ne le
                partagez pas.
              </p>
            </div>
          </div>
        )}

        {expired && (
          <div
            role="status"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
          >
            Cette offre a expiré. Régénérez-la pour obtenir un nouveau QR code et
            un nouveau code de transaction.
          </div>
        )}
      </Modal>
    </section>
  );
}
