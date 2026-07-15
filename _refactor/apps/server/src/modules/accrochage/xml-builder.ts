import { z } from "zod";
import { validateNir } from "./nir";
import { assertXml10Text, isXml10Text } from "./xml-chars";

/** XSD 1.1.5 namespace pinned in docs/cdc. */
export const CDC_XML_NAMESPACE = "urn:cdc:cpf:pc5:schema:1.0.0";
export const XML_SCHEMA_INSTANCE_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

const ISO_DATE_RE = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const CDC_NIR_13_RE = /^[12]\d{4}(?:2[AB]|\d{2})\d{6}$/;

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const CdcDateSchema = z
  .string()
  .refine(isRealIsoDate, "Date CDC attendue au format AAAA-MM-JJ (1900–2099)");

const CdcTimestampSchema = z.date().refine((date) => {
  const year = date.getUTCFullYear();
  return year >= 1900 && year <= 2099;
}, "Horodatage CDC hors de la plage XSD 1900–2099");

const CdcNirSchema = z.string().length(15).superRefine((nir, ctx) => {
  const validation = validateNir(nir);
  if (!validation.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: validation.reason });
    return;
  }
  // The identity collector remains permissive for legitimate provisional NIRs,
  // but this builder mirrors the stricter XSD branch emitted to the CDC.
  if (!CDC_NIR_13_RE.test(nir.slice(0, 13))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le NIR n'est pas compatible avec le motif identifiantNational du XSD CDC 1.1.5",
    });
  }
});

export const CdcCreationItemSchema = z.object({
  /** Stable cdc_export_items.id, used by the CDC processing report. */
  itemId: z.string().uuid(),
  /** Stable sort key; never serialized as holder data. */
  diplomaId: z.string().uuid(),
  rncp: z.string().min(1).max(100).regex(/^RNCP\d+$/, "Code RNCP invalide"),
  issuedAt: CdcDateSchema,
  nir: CdcNirSchema,
  birthLastName: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine(isXml10Text, "Le nom contient un caractère interdit en XML 1.0"),
  obtentionMethod: z.enum(["PAR_ADMISSION", "PAR_SCORING"]),
});

export const CdcBatchSchema = z
  .object({
    /** Stable cdc_exports.id, serialized as idFlux. */
    exportId: z.string().uuid(),
    /** Frozen database timestamp reused for every regeneration. */
    generatedAt: CdcTimestampSchema,
    emitterIdClient: z
      .string()
      .length(8)
      .refine(isXml10Text, "L'identifiant émetteur contient un caractère interdit en XML 1.0"),
    certificateurIdClient: z
      .string()
      .length(8)
      .refine(
        isXml10Text,
        "L'identifiant certificateur contient un caractère interdit en XML 1.0",
      ),
    contractId: z
      .string()
      .min(1)
      .max(20)
      .refine(isXml10Text, "L'identifiant contrat contient un caractère interdit en XML 1.0"),
    items: z.array(CdcCreationItemSchema).min(1).max(500),
  })
  .superRefine((batch, ctx) => {
    const itemIds = new Set<string>();
    const diplomaIds = new Set<string>();
    batch.items.forEach((item, index) => {
      if (itemIds.has(item.itemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "itemId"],
          message: "idTechnique dupliqué dans le lot",
        });
      }
      if (diplomaIds.has(item.diplomaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "diplomaId"],
          message: "Diplôme dupliqué dans le lot",
        });
      }
      itemIds.add(item.itemId);
      diplomaIds.add(item.diplomaId);
    });
  });

export type CdcCreationItem = z.infer<typeof CdcCreationItemSchema>;
export type CdcBatch = z.infer<typeof CdcBatchSchema>;

/** Generic element AST. Domain values can only enter through `text`/attributes. */
export interface XmlElement {
  readonly name: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly children?: readonly XmlElement[];
}

const XML_NAME_RE = /^(?:[A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*$/;

function assertXmlName(name: string): void {
  if (!XML_NAME_RE.test(name)) throw new Error(`Invalid XML name: ${name}`);
}

/** The sole path by which text values enter the serialized document. */
export function escapeXmlText(value: string): string {
  assertXml10Text(value);
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function serializeElement(element: XmlElement, depth: number): string {
  assertXmlName(element.name);
  if (element.text !== undefined && element.children !== undefined) {
    throw new Error("Mixed XML content is not supported");
  }

  const indent = "  ".repeat(depth);
  const attributes = Object.entries(element.attributes ?? {})
    .sort(([left], [right]) => compareText(left, right))
    .map(([name, value]) => {
      assertXmlName(name);
      return " " + name + '="' + escapeXmlText(value) + '"';
    })
    .join("");
  const open = indent + "<" + element.name + attributes;

  if (element.text !== undefined) {
    return open + ">" + escapeXmlText(element.text) + "</" + element.name + ">";
  }

  const children = element.children ?? [];
  if (children.length === 0) return open + "/>";
  return (
    open +
    ">\n" +
    children.map((child) => serializeElement(child, depth + 1)).join("\n") +
    "\n" +
    indent +
    "</" +
    element.name +
    ">"
  );
}

/** Serializes a strict, element-only AST with stable LF line endings. */
export function serializeXmlDocument(root: XmlElement): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeElement(root, 0) + "\n";
}

// Tag and attribute names are closed constants. No caller-provided value can
// become markup; all values flow through the AST serializer's escaping path.
const TAG = {
  flux: "cpf:flux",
  idFlux: "cpf:idFlux",
  horodatage: "cpf:horodatage",
  action: "cpf:action",
  emetteur: "cpf:emetteur",
  idClient: "cpf:idClient",
  certificateurs: "cpf:certificateurs",
  certificateur: "cpf:certificateur",
  idContrat: "cpf:idContrat",
  certifications: "cpf:certifications",
  certification: "cpf:certification",
  type: "cpf:type",
  code: "cpf:code",
  natureDeposant: "cpf:natureDeposant",
  passageCertifications: "cpf:passageCertifications",
  passageCertification: "cpf:passageCertification",
  idTechnique: "cpf:idTechnique",
  obtentionCertification: "cpf:obtentionCertification",
  donneeCertifiee: "cpf:donneeCertifiee",
  dateDebutValidite: "cpf:dateDebutValidite",
  dateFinValidite: "cpf:dateFinValidite",
  presenceNiveauLangueEuro: "cpf:presenceNiveauLangueEuro",
  presenceNiveauNumeriqueEuro: "cpf:presenceNiveauNumeriqueEuro",
  scoring: "cpf:scoring",
  mentionValidee: "cpf:mentionValidee",
  modalitesInscription: "cpf:modalitesInscription",
  modaliteAcces: "cpf:modaliteAcces",
  identificationTitulaire: "cpf:identificationTitulaire",
  identifiantNational: "cpf:identifiantNational",
  nir: "cpf:nir",
  nomNaissance: "cpf:nomNaissance",
} as const;

const ATTR = {
  xmlnsCpf: "xmlns:cpf",
  xmlnsXsi: "xmlns:xsi",
  xsiNil: "xsi:nil",
} as const;

const textNode = (name: string, text: string): XmlElement => ({ name, text });
const parentNode = (name: string, children: readonly XmlElement[]): XmlElement => ({
  name,
  children,
});
const nilNode = (name: string): XmlElement => ({
  name,
  attributes: { [ATTR.xsiNil]: "true" },
});

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Formats xsd:dateTime exactly as required by the CDC pattern (UTC, no millis). */
export function formatCdcTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19) + "+00:00";
}

function passageNode(item: CdcCreationItem): XmlElement {
  return parentNode(TAG.passageCertification, [
    textNode(TAG.idTechnique, item.itemId),
    textNode(TAG.obtentionCertification, item.obtentionMethod),
    textNode(TAG.donneeCertifiee, "true"),
    textNode(TAG.dateDebutValidite, item.issuedAt),
    nilNode(TAG.dateFinValidite),
    textNode(TAG.presenceNiveauLangueEuro, "false"),
    textNode(TAG.presenceNiveauNumeriqueEuro, "false"),
    nilNode(TAG.scoring),
    nilNode(TAG.mentionValidee),
    parentNode(TAG.modalitesInscription, [nilNode(TAG.modaliteAcces)]),
    parentNode(TAG.identificationTitulaire, [
      parentNode(TAG.identifiantNational, [
        // The encrypted application value includes its 2-digit checksum; XSD
        // 1.1.5 explicitly requires only the 13-character national identifier.
        textNode(TAG.nir, item.nir.slice(0, 13)),
        textNode(TAG.nomNaissance, item.birthLastName),
      ]),
    ]),
  ]);
}

function certificationNodes(items: readonly CdcCreationItem[]): XmlElement[] {
  const grouped = new Map<string, CdcCreationItem[]>();
  for (const item of items) {
    const group = grouped.get(item.rncp);
    if (group) group.push(item);
    else grouped.set(item.rncp, [item]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([rncp, group]) => {
      const passages = [...group]
        .sort(
          (left, right) =>
            compareText(left.diplomaId, right.diplomaId) || compareText(left.itemId, right.itemId),
        )
        .map(passageNode);
      return parentNode(TAG.certification, [
        textNode(TAG.type, "RNCP"),
        textNode(TAG.code, rncp),
        textNode(TAG.natureDeposant, "CERTIFICATEUR"),
        parentNode(TAG.passageCertifications, passages),
      ]);
    });
}

/**
 * Builds the deterministic CDC CREATION document emitted by CertifyChain.
 * The input is parsed through the exact product subset of XSD 1.1.5 first.
 */
export function buildCdcCreationXml(input: CdcBatch): string {
  const batch = CdcBatchSchema.parse(input);
  const root: XmlElement = {
    name: TAG.flux,
    attributes: {
      [ATTR.xmlnsCpf]: CDC_XML_NAMESPACE,
      [ATTR.xmlnsXsi]: XML_SCHEMA_INSTANCE_NAMESPACE,
    },
    children: [
      textNode(TAG.idFlux, batch.exportId),
      textNode(TAG.horodatage, formatCdcTimestamp(batch.generatedAt)),
      textNode(TAG.action, "CREATION"),
      parentNode(TAG.emetteur, [
        textNode(TAG.idClient, batch.emitterIdClient),
        parentNode(TAG.certificateurs, [
          parentNode(TAG.certificateur, [
            textNode(TAG.idClient, batch.certificateurIdClient),
            textNode(TAG.idContrat, batch.contractId),
            parentNode(TAG.certifications, certificationNodes(batch.items)),
          ]),
        ]),
      ]),
    ],
  };
  return serializeXmlDocument(root);
}
