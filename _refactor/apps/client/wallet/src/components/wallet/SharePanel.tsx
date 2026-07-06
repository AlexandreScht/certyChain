"use client";

import { useMemo, useState, type JSX } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Share2,
  Link2,
  Copy,
  Check,
  Trash2,
  QrCode,
  Clock,
  Infinity as InfinityIcon,
} from "lucide-react";

import { createShareLink, revokeShareLink } from "@/lib/api/endpoints";
import { ApiClientError } from "@/lib/api/client";
import type { ShareLinkDTO } from "@certifychain/contract/dto";
import {
  Badge,
  Button,
  Field,
  Select,
  useToast,
  type SelectOption,
} from "@certifychain/shared/ui";
import { cn } from "@certifychain/shared/lib/cn";

import { formatDate } from "./format";

export interface SharePanelProps {
  diplomaId: string;
  /** Existing share links loaded by the page. */
  initialLinks: ShareLinkDTO[];
}

/** Expiry presets mapped to `CreateShareLinkInput.expiresInDays`. */
const EXPIRY_OPTIONS: SelectOption[] = [
  { label: "Lien permanent (sans expiration)", value: "permanent" },
  { label: "Expire dans 7 jours", value: "7" },
  { label: "Expire dans 30 jours", value: "30" },
  { label: "Expire dans 90 jours", value: "90" },
];

/** True when the link has an expiry in the past (still `revoked: false` server-side). */
function isExpired(link: ShareLinkDTO): boolean {
  return link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now();
}

function CopyButton({ value }: { value: string }): JSX.Element {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible", "Copiez le lien manuellement.");
    }
  };

  return (
    <Button
      variant="subtle"
      size="sm"
      onClick={copy}
      leftIcon={
        copied ? (
          <Check className="w-4 h-4 text-success" />
        ) : (
          <Copy className="w-4 h-4" />
        )
      }
    >
      {copied ? "Copié" : "Copier"}
    </Button>
  );
}

function ShareLinkRow({
  link,
  onRevoke,
  revoking,
}: {
  link: ShareLinkDTO;
  onRevoke: (token: string) => void;
  revoking: boolean;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
      transition={{ duration: reduce ? 0 : 0.25 }}
      className="rounded-2xl neumorph-inset p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {link.revoked ? (
              <Badge tone="danger" dot>
                Révoqué
              </Badge>
            ) : isExpired(link) ? (
              <Badge tone="neutral" dot>
                Expiré
              </Badge>
            ) : (
              <Badge tone="success" dot pulse>
                Actif
              </Badge>
            )}
            <Badge tone="neutral">
              {link.expiresAt ? (
                <>
                  <Clock className="w-3 h-3" />
                  Expire le {formatDate(link.expiresAt)}
                </>
              ) : (
                <>
                  <InfinityIcon className="w-3 h-3" />
                  Permanent
                </>
              )}
            </Badge>
          </div>
          <div className="mt-2 text-xs font-mono text-muted truncate">
            {link.url}
          </div>
          <div className="mt-1 text-[11px] text-muted-soft">
            Créé le {formatDate(link.createdAt)}
          </div>
        </div>
        {!link.revoked && (
          <Button
            variant="ghost"
            size="sm"
            loading={revoking}
            onClick={() => onRevoke(link.token)}
            leftIcon={<Trash2 className="w-4 h-4 text-danger" />}
            className="shrink-0"
          >
            Révoquer
          </Button>
        )}
      </div>
    </motion.li>
  );
}

export function SharePanel({
  diplomaId,
  initialLinks,
}: SharePanelProps): JSX.Element {
  const toast = useToast();
  const reduce = useReducedMotion();

  // Newest first — matches how freshly created links are prepended below
  // (the API returns them oldest-first).
  const [links, setLinks] = useState<ShareLinkDTO[]>(() =>
    [...initialLinks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  const [expiry, setExpiry] = useState<string>("permanent");
  const [creating, setCreating] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  // The most recently created SHAREABLE link (active, not expired) drives the
  // QR preview — an expired link must never be the one handed to a recruiter.
  const featured = useMemo(
    () => links.find((l) => !l.revoked && !isExpired(l)) ?? null,
    [links],
  );

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    const expiresInDays = expiry === "permanent" ? null : Number(expiry);
    try {
      const link = await createShareLink(diplomaId, { expiresInDays });
      setLinks((prev) => [link, ...prev]);
      toast.success("Lien de partage créé", "Vous pouvez maintenant le partager.");
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast.error("Création impossible", err.message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    setRevokingToken(token);
    try {
      await revokeShareLink(token);
      setLinks((prev) =>
        prev.map((l) => (l.token === token ? { ...l, revoked: true } : l)),
      );
      toast.success("Lien révoqué", "Ce lien n'est plus accessible.");
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast.error("Révocation impossible", err.message);
      }
    } finally {
      setRevokingToken(null);
    }
  };

  return (
    <div className="glass-strong rounded-[1.75rem] p-6 sm:p-7">
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-cyan-100 text-cyan-700 dark:text-cyan-300">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-display font-bold text-ink text-lg leading-tight">
            Partager ce diplôme
          </h2>
          <p className="text-xs text-muted">
            Générez un lien de vérification à transmettre à un recruteur.
          </p>
        </div>
      </div>

      {/* Create */}
      <div className="mt-6 flex flex-col gap-4">
        <Field label="Durée de validité">
          <Select
            options={EXPIRY_OPTIONS}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </Field>
        <Button
          size="md"
          fullWidth
          loading={creating}
          onClick={handleCreate}
          leftIcon={<Link2 className="w-4.5 h-4.5" />}
        >
          Créer un lien de partage
        </Button>
      </div>

      {/* QR + featured link */}
      <AnimatePresence initial={false}>
        {featured && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-6 rounded-2xl neumorph-inset p-5 flex flex-col sm:flex-row gap-5 items-center">
              <div className="shrink-0 rounded-2xl bg-white p-3 border border-hairline shadow-sm">
                <QRCodeCanvas
                  value={featured.url}
                  size={132}
                  level="M"
                  marginSize={1}
                  fgColor="#0A0F2C"
                  bgColor="#FFFFFF"
                />
              </div>
              <div className="min-w-0 flex-1 w-full">
                <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-soft font-semibold">
                  <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                  Lien de vérification
                </div>
                <div
                  className={cn(
                    "mt-2 rounded-xl bg-white/70 border border-white/70 px-3 py-2",
                    "dark:bg-white/5 dark:border-white/10",
                    "text-xs font-mono text-ink break-all",
                  )}
                >
                  {featured.url}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <CopyButton value={featured.url} />
                  <Button
                    as="a"
                    href={featured.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="ghost"
                    size="sm"
                  >
                    Ouvrir
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing links */}
      <div className="mt-7">
        <h3 className="text-sm font-semibold text-ink-soft mb-3">
          Liens existants
        </h3>
        {links.length === 0 ? (
          <p className="text-sm text-muted rounded-2xl neumorph-inset p-4">
            Aucun lien de partage pour le moment.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {links.map((link) => (
                <ShareLinkRow
                  key={link.token}
                  link={link}
                  onRevoke={handleRevoke}
                  revoking={revokingToken === link.token}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
