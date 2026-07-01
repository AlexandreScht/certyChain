export const meta = {
  name: 'certifychain-security-audit',
  description: 'Multi-agent security audit of CertifyChain: parallel per-dimension review → adversarial verification of each finding → prioritized synthesis',
  phases: [
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Synthesize' },
  ],
}

const REPO = 'C:\\\\Users\\\\alexa\\\\Documents\\\\projectCoding\\\\CertyChain'

const CONTEXT = `
PROJECT: CertifyChain — a B2B SaaS for issuing/verifying digital diplomas by cryptographic proof.
Stack: Next.js 16 (web, repo root /src) + Hono/TypeScript API (/server) + PostgreSQL/Drizzle + Docker.
Crypto: Ed25519 signatures + single-use nonce ("ed25519-nonce-v1" ProofEngine), secrets AES-256-GCM at rest.

IMPORTANT CALIBRATION (do NOT report these as bugs — they are deliberate, documented MVP decisions):
- Phase 1 is intentionally NOT a real zk-SNARK. It provides authenticity + anti-replay + non-disclosure of the
  document + selective disclosure, behind a ProofEngine seam for a future Groth16 upgrade. The "ZKP/NIZK" wording
  in marketing is acknowledged in CLAUDE.md. Do not flag "this is not true zero-knowledge" as a vulnerability.
- The dev mailer logs OTP to console; SMTP is a documented prod integration point.
- scrypt (node:crypto) is used instead of argon2 on purpose (pure-JS bundle for distroless). That is acceptable;
  only flag if PARAMETERS are weak.

Only report REAL, code-grounded security issues. For each finding cite the exact file and line and quote the
evidence. Read the actual code under ${REPO}. Be precise; no speculation without code evidence.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          file: { type: 'string', description: 'path relative to repo root' },
          line: { type: 'number' },
          category: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string', description: 'quoted code or config proving the issue' },
          recommendation: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'severity', 'file', 'line', 'description', 'evidence', 'recommendation', 'confidence'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['dimension', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'partial'] },
    adjustedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    reasoning: { type: 'string' },
    exploitability: { type: 'string', description: 'concrete attack path if confirmed, or why not exploitable' },
  },
  required: ['verdict', 'adjustedSeverity', 'reasoning'],
}

const DIMENSIONS = [
  {
    key: 'crypto-protocol',
    prompt: `Audit the CRYPTOGRAPHIC CORE and verification protocol for soundness.
Read: server/src/crypto/proof-engine.ts, keys.ts, envelope.ts, hashing.ts, index.ts;
server/src/modules/verify/verify.routes.ts; server/src/config/constants.ts (nonce TTL).
Check: nonce generation entropy & single-use atomicity; replay/forgery resistance; signature-over-hash binding;
holder-secret binding (can the holder-secret be bypassed?); timing-safe comparisons; AES-GCM IV uniqueness & tag
handling; canonical hashing collisions/ambiguity; PKI root cert chain validation in the verify path; whether
issuerCertificateValid being false still returns "verified"; any way a forged/expired/revoked link returns "verified".`,
  },
  {
    key: 'auth-session',
    prompt: `Audit AUTHENTICATION, SESSION & AUTHORIZATION.
Read: server/src/modules/auth/*; server/src/lib/tokens.ts, password.ts, otp.ts, cookies.ts;
server/src/middleware/auth.ts, csrf.ts; server/src/modules/wallet/* and diplomas/* for ownership/IDOR.
Check: JWT signing/verification (alg confusion, exp, secret strength via env), cookie flags
(httpOnly/Secure/SameSite/path/domain), refresh-token rotation & revocation, OTP entropy/TTL/attempt-lockout/
constant-time compare, scrypt parameters, user-enumeration timing, role enforcement on each route, IDOR (can a
student access another student's diploma/share? can a school revoke another school's diploma?).`,
  },
  {
    key: 'validation-injection',
    prompt: `Audit INPUT VALIDATION & INJECTION.
Read: server/src/contract/schemas.ts; every server/src/modules/**/ *.routes.ts; the CSV parser in
diplomas.routes.ts; grep for drizzle raw \`sql\`\` usage and string interpolation into queries.
Check: Zod coverage on body/query/params (any unvalidated input?), SQL injection via raw sql template usage,
mass-assignment, CSV import (formula injection, size/row limits, type allowlist), body-size limits, ReDoS in
regexes, path traversal, unbounded pagination.`,
  },
  {
    key: 'headers-cors-csrf',
    prompt: `Audit WEB/TRANSPORT SECURITY HEADERS, CORS and CSRF.
Read: server/src/middleware/security.ts; server/src/middleware/csrf.ts; next.config.ts (root);
server/src/app.ts (middleware composition order).
Check: CSP strictness (unsafe-inline/eval, missing directives), CORS allowlist correctness & credentials,
HSTS/COOP/CORP/X-Frame-Options/Referrer-Policy/X-Content-Type-Options, CSRF double-submit correctness (is the
csrf cookie readable & compared safely? is it applied to every mutating cookie-authed route? any gaps on
auth/login/refresh/logout?), middleware ordering issues.`,
  },
  {
    key: 'rgpd-logging',
    prompt: `Audit RGPD / DATA MINIMIZATION / LOGGING.
Read: server/src/lib/logger.ts, net.ts, mailer.ts; server/src/modules/audit/*; the verify response shape in
server/src/modules/verify/verify.routes.ts.
Check: does the public verify response disclose only minimal attestation (no email/PII/notes/secrets)?
PII redaction in logs (are secrets/tokens/passwords/OTP ever logged?), audit_log content (is the recruiter
identifier anonymized; IP hashing/anonymization correctness & salt), data retention, any secret/key material
reaching logs.`,
  },
  {
    key: 'abuse-ratelimit',
    prompt: `Audit ABUSE RESISTANCE & RATE LIMITING.
Read: server/src/middleware/rate-limit.ts; rate-limit usage across auth.routes.ts and verify.routes.ts;
nonce TTL & cooldown constants.
Check: rate-limit keying (per-IP vs per-account, IP spoofing via X-Forwarded-For trust), limits on
login/OTP-request/OTP-verify/verify-challenge/verify-proof, brute force on OTP & share tokens, enumeration via
timing or differing responses, in-memory limiter correctness (reset, memory growth, multi-instance gaps),
nonce/lockout windows.`,
  },
  {
    key: 'container-infra',
    prompt: `Audit CONTAINER & INFRA HARDENING.
Read: server/Dockerfile; Dockerfile.web (root); docker-compose.yml; server/.dockerignore; .dockerignore (root);
.env.example; next.config.ts (output standalone).
Check: non-root/distroless, read_only rootfs + tmpfs, cap_drop ALL & no-new-privileges, DB network isolation &
no exposed ports, resource limits, healthchecks, secret handling (are secrets baked into images? is .env in the
build context / leaked via COPY?), .dockerignore coverage (does it exclude .env, node_modules, .git?),
least-privilege of added capabilities on the db service, image pinning.`,
  },
]

phase('Review')
log(`Auditing ${DIMENSIONS.length} security dimensions of CertifyChain in parallel…`)

const perDimension = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(`${CONTEXT}\n\nYou are a senior application-security auditor. ${d.prompt}\n\nReturn structured findings. If a dimension is clean, return an empty findings array with a summary saying so.`, {
      label: `review:${d.key}`,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      effort: 'high',
    }),
  // As each dimension's review completes, adversarially verify each of its findings.
  (review, d) => {
    if (!review || !review.findings || review.findings.length === 0) return { dimension: d.key, verified: [] }
    return parallel(
      review.findings.map((f) => () =>
        agent(`${CONTEXT}\n\nYou are an adversarial security reviewer. A prior auditor reported this finding:\n\n` +
          `TITLE: ${f.title}\nSEVERITY: ${f.severity}\nFILE: ${f.file}:${f.line}\nDESCRIPTION: ${f.description}\n` +
          `EVIDENCE: ${f.evidence}\nRECOMMENDATION: ${f.recommendation}\n\n` +
          `Open the cited file at ${REPO} and the surrounding code. Try HARD to REFUTE this finding: is it a real, ` +
          `exploitable security issue, or a false positive / mitigated elsewhere / a deliberate documented MVP choice? ` +
          `Give the concrete attack path if confirmed. Adjust severity to what the evidence actually supports.`, {
          label: `verify:${d.key}:${f.file}:${f.line}`,
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
          effort: 'high',
        }).then((v) => ({ finding: f, verdict: v })),
      ),
    ).then((verified) => ({ dimension: d.key, verified: verified.filter(Boolean) }))
  },
)

// Collect confirmed findings (drop refuted false positives).
const confirmed = []
for (const dim of perDimension.filter(Boolean)) {
  for (const item of dim.verified) {
    if (item && item.verdict && item.verdict.verdict !== 'refuted') {
      confirmed.push({
        dimension: dim.dimension,
        ...item.finding,
        severity: item.verdict.adjustedSeverity || item.finding.severity,
        verdict: item.verdict.verdict,
        exploitability: item.verdict.exploitability || '',
        reasoning: item.verdict.reasoning,
      })
    }
  }
}

const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
confirmed.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))

log(`Review complete: ${confirmed.length} confirmed findings after adversarial verification.`)

phase('Synthesize')
const report = await agent(
  `${CONTEXT}\n\nYou are the lead security engineer writing the final audit report for CertifyChain (MVP, pre-pilot).\n` +
  `Below are the security findings that SURVIVED adversarial verification (refuted false-positives already removed), ` +
  `sorted by severity. Produce a clear, actionable Markdown report with: (1) an executive summary with a risk verdict ` +
  `for a pilot launch, (2) a findings table (severity | dimension | file:line | issue), (3) per-finding detail with ` +
  `exploit path and a concrete fix, (4) a prioritized remediation checklist (what to fix before pilot vs later). ` +
  `Be honest and proportionate — this is a phase-1 MVP. Group trivial items. Here is the data as JSON:\n\n` +
  '```json\n' + JSON.stringify(confirmed, null, 2) + '\n```',
  { label: 'synthesize:report', phase: 'Synthesize', effort: 'high' },
)

return { confirmedCount: confirmed.length, confirmed, report }
