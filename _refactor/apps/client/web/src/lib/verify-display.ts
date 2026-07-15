/**
 * Présentation des champs divulgués (partagée entre `/verify/[token]` et la page
 * `/verifier` hors ligne). Aucun état, aucune dépendance framework : juste des
 * libellés FR, un formatage de valeur et le téléchargement du bundle brut.
 */
import type { ProofBundleDTO } from "@certifychain/contract/dto";

/** Libellé FR pour chacun des 7 champs divulgables (`DISCLOSABLE_FIELDS`). */
const FIELD_LABELS: Record<string, string> = {
  holderName: "Titulaire",
  holderEmail: "Email du titulaire",
  programTitle: "Diplôme",
  mention: "Mention",
  rncp: "Titre RNCP",
  issuedAt: "Date d'obtention",
  externalId: "Identifiant interne",
};

/** Libellé lisible d'un champ divulgué (repli : le nom brut). */
export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

/** Formate une date ISO en date longue FR ; renvoie l'entrée telle quelle sinon. */
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
 * Rend une valeur divulguée pour l'affichage. `null`/`undefined` → « — » (un
 * champ divulgué mais vide, ex. `mention`) ; `issuedAt` est formatée en date FR.
 */
export function formatDisclosedValue(name: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (name === "issuedAt" && typeof value === "string") return formatDate(value);
  if (typeof value === "string") return value;
  return String(value);
}

/** Libellé « N champ(s) masqué(s) » accordé au nombre (une seule chaîne). */
export function hiddenFieldsLabel(hidden: number): string {
  const plural = hidden > 1 ? "s" : "";
  return `${hidden} champ${plural} masqué${plural}`;
}

/** Heure locale HH:MM d'un timestamp ISO (statut de révocation « à HH:MM »). */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

/**
 * Télécharge le bundle brut en JSON (blob local, aucun réseau). La révocation de
 * l'object URL est différée après le clic (même précaution que l'export CDC).
 */
export function downloadProofBundle(bundle: ProofBundleDTO): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `preuve-${bundle.payload.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
