import { OUTBOUND_RATE_LIMIT } from "../config/constants";
import { env } from "../config/env";
import { logger } from "./logger";
import { createTokenBucket } from "./token-bucket";

/**
 * AI-assisted school validation via Google Gemini (REST, zero-dependency).
 *
 * Three modes:
 *  • `verifySchoolAgainstSirene` — the cheap, primary path: cross-checks the
 *    declared info against the AUTHORITATIVE SIRENE registry data (one short call).
 *  • `evaluateSchoolLegitimacy` — fallback plausibility scoring when SIRENE is
 *    unavailable (no key / no SIRET).
 *  • `verifyOfficialDomain` — live web-search grounding to CONFIRM (not guess)
 *    the establishment's real official domain, gating the DNS ownership-proof
 *    method (verify.md). Deliberately conservative: any doubt → unconfirmed.
 *
 * Returns `null` when unavailable (no API key, network/parse failure) so the
 * caller falls back to manual review / the feature stays unavailable.
 */

export interface SchoolValidationInput {
  name: string;
  siret?: string | null;
  /** UAI / RNE code (official Éducation nationale establishment id), if provided. */
  uai?: string | null;
  /** City declared by the applicant — a coherence signal (name/email/city). */
  city?: string | null;
  contactEmail: string;
  adminEmail?: string | null;
  siretLuhnValid?: boolean | null;
}

export interface SchoolValidationResult {
  score: number; // 0–100
  summary: string;
  flags: string[];
  model: string;
}

export interface SchoolCrossCheckInput {
  declaredName: string;
  officialName: string | null;
  nafCode: string | null;
  active: boolean;
  /** City the applicant declared at registration. */
  declaredCity: string | null;
  /** Official commune from the SIRENE registry (source of truth). */
  officialCity: string | null;
  /** Official postal code from the SIRENE registry (disambiguation aid). */
  officialPostalCode: string | null;
}

export interface SchoolCrossCheckResult {
  score: number; // 0–100
  summary: string;
  nameMatch: boolean;
  /** Whether the declared city matches the official SIRENE commune. */
  cityMatch: boolean;
  model: string;
}

const PREFET_PROMPT = `Tu es un agent de vérification administrative (type préfecture) chargé d'évaluer la LÉGITIMITÉ d'un établissement d'enseignement qui demande à émettre des diplômes certifiés sur la plateforme CertifyChain.

À partir des informations déclarées (nom, SIRET, code UAI, e-mail de contact, e-mail de l'administrateur), évalue la probabilité que cet établissement soit RÉEL, légitime et habilité à délivrer des diplômes.

Critères :
- Cohérence du nom avec un établissement d'enseignement plausible (école, université, CFA, organisme de formation…).
- Plausibilité du SIRET (14 chiffres ; un indicateur "siretLuhnValid" t'est fourni — false ou absent est un signal négatif).
- Présence et cohérence d'un code UAI/RNE (identifiant officiel de l'établissement attribué par le Ministère de l'Éducation nationale ; 7 chiffres + 1 lettre, ex. 0751234A). Un UAI bien formé est un signal de CONFIANCE POSITIF (l'établissement est répertorié) ; son absence n'est PAS éliminatoire (beaucoup d'organismes privés n'en ont pas).
- Cohérence de la ville déclarée : une ville française plausible et cohérente avec le nom de l'établissement (ex. « Université de Lyon » à Lyon) est un signal positif ; une ville manifestement incohérente est un signal négatif.
- Cohérence des domaines e-mail avec le nom de l'établissement (un domaine grand public type gmail/outlook est un signal faible, non éliminatoire).
- Signaux de fraude : nom incohérent, fautes grossières, usurpation d'un établissement connu, incohérences manifestes.

Tu ne peux PAS consulter de registre externe : raisonne uniquement sur la cohérence interne des informations. Reste prudent : en cas de doute, baisse le score.

Réponds STRICTEMENT en JSON :
- "score" : entier 0–100 (100 = certitude maximale que l'établissement est réel et sûr ; 0 = très probablement frauduleux).
- "summary" : 1 à 3 phrases en français expliquant le score.
- "flags" : liste courte de signaux/risques détectés (tableau vide si aucun).`;

const CROSSCHECK_PROMPT = `Tu vérifies une demande d'inscription d'établissement sur CertifyChain en la confrontant aux DONNÉES OFFICIELLES du registre SIRENE (INSEE), qui font foi.

On te fournit : le nom DÉCLARÉ par le demandeur, le nom OFFICIEL (SIRENE), le code d'activité NAF/APE officiel, l'état actif/inactif, la ville DÉCLARÉE par le demandeur, et la ville + le code postal OFFICIELS (SIRENE).

Évalue :
- "nameMatch" : le nom déclaré désigne-t-il bien le même établissement que le nom officiel ? (tolère variantes, abréviations, sigles, accents).
- "cityMatch" : la ville déclarée correspond-elle à la commune officielle (SIRENE) ? Tolère accents, casse, tirets, abréviations (« St » = « Saint ») et arrondissements (« Paris » = « PARIS 5E ARRONDISSEMENT », « Lyon » = « LYON 7 »). La ville déclarée est FACULTATIVE : si la ville déclarée OU officielle est absente/vide, mets "cityMatch" à false et n'en tiens PAS rigueur dans le score. Une ville déclarée dans une commune MANIFESTEMENT différente de la commune officielle est un signal négatif FORT (le demandeur ne connaît pas l'adresse réelle de l'établissement).
- cohérence de l'activité : le code NAF correspond-il à un établissement d'enseignement / de formation (typiquement 85.xx) ? Sinon, signale-le.
- "score" 0–100 : confiance globale que ce demandeur est bien cet établissement officiel et légitime pour émettre des diplômes.

Réponds STRICTEMENT en JSON : { "score": entier 0–100, "nameMatch": booléen, "cityMatch": booléen, "summary": 1 à 2 phrases en français }.`;

const DOMAIN_VERIFICATION_PROMPT = `Tu dois identifier avec CERTITUDE (pas une simple probabilité) le nom de domaine internet OFFICIEL d'un établissement d'enseignement, en utilisant la recherche web.

On te fournit le nom de l'établissement, sa ville, et un domaine CANDIDAT (déduit de l'e-mail de contact déclaré à l'inscription) qui peut orienter la recherche, mais qui n'est PAS garanti exact.

Démarche obligatoire :
1. Recherche le site web OFFICIEL de l'établissement (le vrai site institutionnel — PAS un annuaire tiers, PAS LinkedIn/Wikipedia/Facebook/un comparateur de formations).
2. Une fois le site identifié, vérifie sa cohérence en consultant sa page de contact / mentions légales (adresses e-mail publiées, URL du site).
3. Ne réponds un domaine QUE si tu as réellement trouvé et consulté ce site officiel avec une certitude totale. En cas de moindre doute (site introuvable, plusieurs établissements homonymes, informations contradictoires, résultats de recherche insuffisants), tu DOIS répondre « non confirmé » — ne prends AUCUN risque, la fiabilité prime sur la complétude.

Réponds STRICTEMENT sur une seule ligne, sans aucun autre texte ni explication :
- Si confirmé avec certitude : le domaine officiel exact (ex. epitech.eu), en minuscules, sans « http:// », « https:// » ni « www. ».
- Sinon : le mot AUCUN.`;

const LEGITIMACY_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    summary: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: ["score", "summary", "flags"],
} as const;

const CROSSCHECK_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    nameMatch: { type: "boolean" },
    cityMatch: { type: "boolean" },
    summary: { type: "string" },
  },
  required: ["score", "nameMatch", "cityMatch", "summary"],
} as const;

/**
 * The FIRST outbound HTTPS connection from a freshly-idle network path (Docker
 * Desktop/WSL2 on Windows) has HIGHLY VARIABLE latency — reproduced directly
 * against the real network path: some cold attempts land in ~0.2-3s, some take
 * 7-12s, and some hang 30-60s+, even though the API/key/model are fine (a
 * warm/second connection from the same process is consistently fast). A single
 * attempt — however long its timeout — bets everything on one unlucky draw.
 *
 * So instead of waiting for an attempt to fail before trying again, this RACES
 * up to `MAX_RACERS` attempts with a staggered start (Happy-Eyeballs style): if
 * the current attempt(s) haven't answered within `STAGGER_MS`, another is fired
 * WITHOUT cancelling the earlier one — whichever answers first wins, and the
 * rest are aborted. A clean HTTP error response (429/400/…) is a real API
 * answer, not a network hiccup — it stops the race immediately since firing
 * more attempts can't turn a quota/validation error into a success.
 */
const ATTEMPT_TIMEOUT_MS = 15_000;
const STAGGER_MS = 6_000;
const MAX_RACERS = 3;

/**
 * Module-scoped token bucket (`config/constants.ts#OUTBOUND_RATE_LIMIT.GEMINI`)
 * capping our OUTBOUND call rate to Gemini — one token per LOGICAL call
 * (`postGenerateContent` below), regardless of how many racers it fires
 * internally. Protects our own API quota with Gemini, never the inbound
 * request: an exhausted bucket degrades EXACTLY like a missing
 * `GEMINI_API_KEY` (every exported function here already returns `null` in
 * that case and the caller falls back to manual review), never a thrown error.
 */
const geminiBucket = createTokenBucket(OUTBOUND_RATE_LIMIT.GEMINI);

/** One outcome from a single racing attempt. */
type AttemptOutcome =
  | { kind: "success"; text: string }
  | { kind: "api_error" } // a real API answer — racing further can't help
  | { kind: "network_error" }; // connection/timeout hiccup — another racer might win

async function attemptOnce(
  url: string,
  body: Record<string, unknown>,
  mode: "json" | "grounded",
  attempt: number,
  signal: AbortSignal,
): Promise<AttemptOutcome> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      logger.error("gemini.http_error", { status: res.status, mode, attempt });
      return { kind: "api_error" };
    }
    const text = extractText(await res.json());
    return text ? { kind: "success", text } : { kind: "network_error" };
  } catch (e) {
    logger.error("gemini.attempt_failed", { error: String(e), mode, attempt });
    return { kind: "network_error" };
  }
}

/**
 * Shared low-level POST to `:generateContent`, racing up to `MAX_RACERS`
 * staggered attempts to maximize the odds of beating the intermittent cold-
 * connection latency described above. Returns the winning attempt's raw model
 * text, or null once every racer has failed / the API gave a terminal answer.
 */
async function postGenerateContent(
  body: Record<string, unknown>,
  mode: "json" | "grounded",
): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  if (!geminiBucket.tryConsume()) {
    // Never fail the caller's request over OUR outbound quota — degrade
    // exactly like "no key configured" (every public function above already
    // returns `null` in that case, and the feature falls back cleanly).
    logger.warn("gemini.outbound_rate_limited", { mode });
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    env.GEMINI_MODEL,
  )}:generateContent`;

  const controllers: AbortController[] = [];
  let settled = false;
  let resolveOutcome!: (v: string | null) => void;
  const outcome = new Promise<string | null>((resolve) => {
    resolveOutcome = resolve;
  });

  function finish(v: string | null): void {
    if (settled) return;
    settled = true;
    for (const c of controllers) c.abort();
    resolveOutcome(v);
  }

  function launch(attempt: number): void {
    const controller = new AbortController();
    controllers.push(controller);
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    void attemptOnce(url, body, mode, attempt, controller.signal)
      .then((result) => {
        if (settled) return;
        if (result.kind === "success") finish(result.text);
        else if (result.kind === "api_error") finish(null);
        // network_error: say nothing — another racer (running or still to be
        // launched) may still win; the trailing timeout below is the backstop.
      })
      .finally(() => clearTimeout(timer));
  }

  // A plain `setTimeout` delay is NOT interruptible — awaiting one always
  // blocks the full duration even if the race already settled in the
  // meantime. Racing the delay against `outcome` itself makes it wake up the
  // instant a winner (or a terminal API error) is known, instead of always
  // paying the full stagger/timeout even on a fast answer.
  const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  launch(1);
  for (let attempt = 2; attempt <= MAX_RACERS && !settled; attempt += 1) {
    await Promise.race([outcome, delay(STAGGER_MS)]);
    if (!settled) launch(attempt);
  }
  // Every racer has now been launched (or the race already settled) — give the
  // most-recently-launched one its own full budget before giving up entirely.
  if (!settled) {
    await Promise.race([outcome, delay(ATTEMPT_TIMEOUT_MS)]);
    finish(null); // no-op if `outcome` is what actually settled the race above
  }

  return outcome;
}

/** JSON-structured call (responseSchema-constrained). Returns the raw JSON text, or null. */
async function callGemini(
  systemPrompt: string,
  userPayload: unknown,
  responseSchema: unknown,
  maxOutputTokens: number,
): Promise<string | null> {
  return postGenerateContent(
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload, null, 2) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens,
        responseMimeType: "application/json",
        responseSchema,
        // Disable "thinking" on Gemini 2.5 / flash-latest: reasoning tokens count
        // toward maxOutputTokens and were truncating the JSON answer (finishReason
        // MAX_TOKENS → invalid JSON → null). We only need a short structured verdict.
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    "json",
  );
}

/**
 * Live web-search-grounded call. NOT combinable with `responseSchema` (the
 * Gemini API doesn't support Google Search grounding + JSON-schema mode
 * together) — the prompt itself constrains the output to one parseable line.
 */
async function callGeminiGrounded(systemPrompt: string, userPayload: unknown): Promise<string | null> {
  return postGenerateContent(
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload, null, 2) }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    "grounded",
  );
}

/** PRIMARY path: cross-check the declared school against official SIRENE data. */
export async function verifySchoolAgainstSirene(
  input: SchoolCrossCheckInput,
): Promise<SchoolCrossCheckResult | null> {
  const text = await callGemini(CROSSCHECK_PROMPT, input, CROSSCHECK_SCHEMA, 256);
  if (!text) return null;
  let parsed: { score?: unknown; nameMatch?: unknown; cityMatch?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const score = clampScore(parsed.score);
  if (score === null) return null;
  return {
    score,
    nameMatch: parsed.nameMatch === true,
    cityMatch: parsed.cityMatch === true,
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : "",
    model: env.GEMINI_MODEL,
  };
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export interface DomainVerificationInput {
  schoolName: string;
  city: string | null;
  /** Domain deduced from the declared contact email — a search hint, not gospel. */
  candidateDomain: string | null;
}

export interface DomainVerificationResult {
  /** The official domain the model found and is CERTAIN of (live web search). */
  domain: string;
  model: string;
}

/**
 * Confirms (not guesses) an establishment's real official domain via a live,
 * web-search-grounded Gemini call — gates the DNS ownership-proof method
 * (verify.md) on genuine certainty rather than "a domain is deducible from the
 * contact email". Returns `null` whenever the model isn't certain, or on any
 * failure (no key, network, timeout, unparseable answer) — the caller then
 * treats DNS as unavailable. Deliberately never falls back to a guess.
 */
export async function verifyOfficialDomain(
  input: DomainVerificationInput,
): Promise<DomainVerificationResult | null> {
  if (!input.candidateDomain) return null; // nothing to anchor the search on

  const text = await callGeminiGrounded(DOMAIN_VERIFICATION_PROMPT, {
    schoolName: input.schoolName,
    city: input.city,
    candidateDomain: input.candidateDomain,
  });
  if (!text) return null;

  // Defensive parsing: grounded responses sometimes prepend reasoning despite
  // instructions — take the LAST non-empty line and strip protocol/path/www.
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = (lines[lines.length - 1] ?? "").toLowerCase();
  const cleaned = last
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[.\s]+$/, "");

  if (cleaned === "aucun" || !DOMAIN_RE.test(cleaned)) return null;
  return { domain: cleaned, model: env.GEMINI_MODEL };
}

/** FALLBACK path: plausibility scoring on declared fields only (no SIRENE). */
export async function evaluateSchoolLegitimacy(
  input: SchoolValidationInput,
): Promise<SchoolValidationResult | null> {
  const text = await callGemini(PREFET_PROMPT, input, LEGITIMACY_SCHEMA, 512);
  if (!text) return null;
  return parseResult(text, env.GEMINI_MODEL);
}

/** Parse + sanitize the model's legitimacy JSON. Exported for unit testing. */
export function parseResult(text: string, model: string): SchoolValidationResult | null {
  let parsed: { score?: unknown; summary?: unknown; flags?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const score = clampScore(parsed.score);
  if (score === null) return null;
  return {
    score,
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : "",
    flags: Array.isArray(parsed.flags)
      ? parsed.flags.filter((f): f is string => typeof f === "string").slice(0, 20)
      : [],
    model,
  };
}

function extractText(json: unknown): string | null {
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((p) => (typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
    .join("");
  return text || null;
}

function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
