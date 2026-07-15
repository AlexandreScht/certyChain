import { tokenizeCsv } from "../../lib/csv";
import { fail } from "../../lib/http-error";

export const CDC_IDENTITY_CSV_HEADERS = [
  "diploma_id",
  "external_id",
  "nir",
  "nom_naissance",
  "obtention_certification",
] as const;

export interface CdcIdentityCsvRow {
  diplomaId?: string;
  externalId?: string;
  nir: string;
  birthLastName: string;
  obtentionMethod: string;
}

/** Parse the dedicated CDC identity CSV with an exact, positional header. */
export function parseCdcIdentityCsv(text: string): CdcIdentityCsvRow[] {
  const rows = tokenizeCsv(text).filter(
    (cells) => cells.length > 1 || (cells[0] ?? "").trim() !== "",
  );
  const header = rows[0]?.map((cell, index) => {
    const value = cell.trim();
    return index === 0 ? value.replace(/^\uFEFF/, "") : value;
  });
  if (
    !header ||
    header.length !== CDC_IDENTITY_CSV_HEADERS.length ||
    !header.every((cell, index) => cell === CDC_IDENTITY_CSV_HEADERS[index])
  ) {
    throw fail.validation(
      `En-têtes CSV invalides. Attendu : ${CDC_IDENTITY_CSV_HEADERS.join(",")}`,
    );
  }

  return rows.slice(1).map((cells) => {
    if (cells.length > CDC_IDENTITY_CSV_HEADERS.length) {
      throw fail.validation("CSV invalide : trop de colonnes");
    }
    const diplomaId = (cells[0] ?? "").trim() || undefined;
    const externalId = (cells[1] ?? "").trim() || undefined;
    return {
      ...(diplomaId ? { diplomaId } : {}),
      ...(externalId ? { externalId } : {}),
      nir: (cells[2] ?? "").trim(),
      birthLastName: (cells[3] ?? "").trim(),
      obtentionMethod: (cells[4] ?? "").trim(),
    };
  });
}
