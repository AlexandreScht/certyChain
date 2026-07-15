import { CDC_UPLOAD_LIMITS } from "@certifychain/contract/constants";
import { fail } from "../../lib/http-error";
import { isXml10Text } from "./xml-chars";

const MAX_DEPTH = 40;
const MAX_NODES = 10_000;

interface XmlNode {
  name: string;
  text: string[];
  children: XmlNode[];
}

export interface CdcCrtResult {
  idTechnique: string;
  accepted: boolean;
  code?: string;
  reason?: string;
}

function localName(name: string): string {
  return (name.split(":").pop() ?? name).toLowerCase();
}

function decodeXmlText(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(value)) {
    throw fail.validation("Compte rendu XML invalide : entité non autorisée");
  }
  const decodeCodePoint = (raw: string, radix: number): string => {
    const codePoint = Number.parseInt(raw, radix);
    // XML 1.0 valid characters are TAB/LF/CR, U+0020–D7FF,
    // U+E000–FFFD and U+10000–10FFFF.
    if (
      !Number.isSafeInteger(codePoint) ||
      (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint === 0xfffe ||
      codePoint === 0xffff
    ) {
      throw fail.validation("Compte rendu XML invalide : référence numérique interdite");
    }
    return String.fromCodePoint(codePoint);
  };

  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => decodeCodePoint(hex, 16))
    .replace(/&#(\d+);/g, (_match, decimal: string) => decodeCodePoint(decimal, 10))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseXml(source: string): XmlNode {
  if (Buffer.byteLength(source, "utf8") > CDC_UPLOAD_LIMITS.crt) {
    throw fail.payloadTooLarge("Compte rendu CDC trop volumineux (max 2 Mo)");
  }
  if (!isXml10Text(source) || /<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw fail.validation("Compte rendu XML non sûr ou invalide");
  }

  const documentNode: XmlNode = { name: "#document", text: [], children: [] };
  const stack: XmlNode[] = [documentNode];
  const tokenPattern = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g;
  let cursor = 0;
  let nodes = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index !== cursor) throw fail.validation("Compte rendu XML mal formé");
    cursor = tokenPattern.lastIndex;
    const token = match[0];
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;

    const current = stack[stack.length - 1];
    if (!current) throw fail.validation("Compte rendu XML mal formé");

    if (token.startsWith("<![CDATA[")) {
      current.text.push(token.slice(9, -3));
      continue;
    }
    if (!token.startsWith("<")) {
      current.text.push(decodeXmlText(token));
      continue;
    }
    if (/^<\//.test(token)) {
      const closing = /^<\/\s*([A-Za-z_][\w:.-]*)\s*>$/.exec(token);
      if (!closing || stack.length === 1) throw fail.validation("Compte rendu XML mal formé");
      const node = stack.pop();
      if (!node || node.name !== closing[1]) throw fail.validation("Compte rendu XML mal formé");
      continue;
    }
    if (/^<!/.test(token)) throw fail.validation("Déclaration XML non autorisée");

    const opening = /^<\s*([A-Za-z_][\w:.-]*)(?:\s+[\s\S]*?)?\s*(\/?)>$/.exec(token);
    if (!opening?.[1]) throw fail.validation("Compte rendu XML mal formé");
    const node: XmlNode = { name: opening[1], text: [], children: [] };
    current.children.push(node);
    nodes += 1;
    if (nodes > MAX_NODES) throw fail.payloadTooLarge("Compte rendu CDC trop complexe");
    if (opening[2] !== "/") {
      stack.push(node);
      if (stack.length > MAX_DEPTH) throw fail.payloadTooLarge("Compte rendu CDC trop profond");
    }
  }

  if (cursor !== source.length || stack.length !== 1 || documentNode.children.length !== 1) {
    throw fail.validation("Compte rendu XML mal formé");
  }
  const root = documentNode.children[0];
  if (!root) throw fail.validation("Compte rendu XML vide");
  return root;
}

function textContent(node: XmlNode): string {
  return `${node.text.join("")}${node.children.map(textContent).join("")}`.trim();
}

function findAll(node: XmlNode, expected: string, output: XmlNode[] = []): XmlNode[] {
  if (localName(node.name) === expected) output.push(node);
  for (const child of node.children) findAll(child, expected, output);
  return output;
}

function readRejected(container: XmlNode): CdcCrtResult[] {
  const ordered: XmlNode[] = [];
  const visit = (node: XmlNode): void => {
    const name = localName(node.name);
    if (name === "idtechnique" || name === "messageerreur" || name === "codeerreur") {
      ordered.push(node);
    }
    for (const child of node.children) visit(child);
  };
  visit(container);

  const results: CdcCrtResult[] = [];
  let current: CdcCrtResult | undefined;
  for (const node of ordered) {
    const name = localName(node.name);
    const value = textContent(node);
    if (name === "idtechnique") {
      if (current) results.push(current);
      if (!value || value.length > 255) throw fail.validation("idTechnique CDC invalide");
      current = { idTechnique: value, accepted: false };
    } else if (current && name === "codeerreur" && value) {
      current.code = value.slice(0, 120);
    } else if (current && name === "messageerreur" && value) {
      current.reason = value.slice(0, 2_000);
      if (!current.code) {
        const prefix = /^([A-Za-z0-9_.-]{1,120})\s*:/.exec(value)?.[1];
        if (prefix) current.code = prefix;
      }
    }
  }
  if (current) results.push(current);
  if (results.some((result) => !result.reason)) {
    throw fail.validation("Passage CDC rejeté sans messageErreur");
  }
  return results;
}

/** Parse a CDC processing report without DTD/entity support (XXE-safe). */
export function parseCdcCrt(source: string): CdcCrtResult[] {
  const root = parseXml(source.trim());
  const accepted = findAll(root, "passagesok").flatMap((container) =>
    findAll(container, "idtechnique").map((node) => ({
      idTechnique: textContent(node),
      accepted: true as const,
    })),
  );
  const rejected = findAll(root, "passagesko").flatMap(readRejected);
  const results = [...accepted, ...rejected];
  if (results.length === 0) throw fail.validation("Compte rendu CDC sans passage");

  const seen = new Set<string>();
  for (const result of results) {
    if (!result.idTechnique || result.idTechnique.length > 255 || seen.has(result.idTechnique)) {
      throw fail.validation("Référence idTechnique CDC absente ou dupliquée");
    }
    seen.add(result.idTechnique);
  }
  return results;
}
