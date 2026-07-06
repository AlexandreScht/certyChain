import type { DiplomaStatus } from "@certifychain/contract/enums";
import type { BadgeTone } from "@certifychain/shared/ui";

/** Formats an ISO date string to a localized French long date. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Extracts the year (graduation promotion) from an ISO date string. */
export function formatYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return String(date.getFullYear());
}

interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

/** Maps a diploma status to its French label and badge tone. */
export function diplomaStatusMeta(status: DiplomaStatus): StatusMeta {
  switch (status) {
    case "active":
      return { label: "Valide", tone: "success" };
    case "revoked":
      return { label: "Révoqué", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}
