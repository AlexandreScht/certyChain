import { env } from "../config/env";
import { logger } from "./logger";
import { maskEmail } from "./mask";
import { sendSmtp } from "./smtp";

/**
 * Mailer.
 *  • No SMTP_HOST  → console only (zero-config dev).
 *  • SMTP_HOST set → real delivery over SMTP (e.g. Mailpit on :1025 in dev,
 *    or a provider over implicit TLS in prod). In dev we ALSO echo to the
 *    console so codes stay visible even if the mail catcher is down.
 * A mail failure never throws: it must not break auth/issuance flows.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  // The console echo prints the FULL body — OTP codes, 180-day claim URLs: these
  // are secrets/PII, so it is a DEV-ONLY convenience and must never run in prod.
  // (Previously also fired in prod when SMTP was unconfigured — read access to the
  // logs then became an auth bypass via leaked OTP/claim links.)
  if (env.isDev) {
    logger.info("mail.console", { to: mail.to, subject: mail.subject, body: mail.text });
  }
  if (!env.SMTP_HOST) {
    // No transport configured. Dev already echoed above; in prod, surface the drop
    // for ops WITHOUT the body so a misconfiguration is visible but leaks nothing.
    if (!env.isDev) {
      logger.warn("mail.dropped_no_smtp", { to: maskEmail(mail.to), subject: mail.subject });
    }
    return;
  }

  try {
    await sendSmtp(
      {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER || undefined,
        password: env.SMTP_PASSWORD || undefined,
        secure: env.SMTP_SECURE,
        from: env.SMTP_FROM,
      },
      mail,
    );
    logger.info("mail.sent", { to: maskEmail(mail.to), subject: mail.subject });
  } catch (e) {
    logger.error("mail.smtp_failed", { to: maskEmail(mail.to), subject: mail.subject, error: String(e) });
  }
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await sendMail({
    to,
    subject: "Votre code de connexion CertifyChain",
    text: `Votre code de connexion est : ${code}\nIl est valable 10 minutes. Ne le partagez avec personne.`,
  });
}

export async function sendDiplomaNotification(
  to: string,
  walletUrl: string,
  programTitle: string,
): Promise<void> {
  await sendMail({
    to,
    subject: "Un nouveau diplôme dans votre wallet CertifyChain",
    text: `Bonne nouvelle ! Le diplôme « ${programTitle} » vous a été délivré.\nAccédez à votre wallet : ${walletUrl}`,
  });
}

/**
 * Invites the holder of a school-issued address to claim their diploma: bind it
 * to a personal email they control, so access survives the school address going
 * stale (leaving the school, alumni mailbox shutdown, etc). Sent in place of
 * {@link sendDiplomaNotification} exactly once — the first time a school issues
 * to an address with no verified alias yet.
 */
export async function sendDiplomaClaimEmail(
  to: string,
  claimUrl: string,
  schoolName: string,
): Promise<void> {
  await sendMail({
    to,
    subject: "Un diplôme vous attend sur CertifyChain",
    text:
      `${schoolName} vient de vous délivrer un diplôme sur CertifyChain.\n\n` +
      `Cette adresse vous a été fournie par votre établissement : pour ne jamais ` +
      `perdre l'accès à votre diplôme si elle venait à être désactivée (fin de ` +
      `scolarité, changement d'établissement…), reliez-la dès maintenant à une ` +
      `adresse e-mail personnelle — moins d'une minute, aucune configuration à retenir :\n` +
      `${claimUrl}\n\nCe lien reste valable 180 jours.`,
  });
}

/**
 * Invites a freshly-provisional school to prove ownership of its establishment
 * (verify.md): existence is confirmed, but it must complete a control proof
 * (DNS / postal / ProConnect) before it can emit diplomas.
 */
export async function sendOwnershipVerificationInvite(
  to: string,
  info: { schoolName: string; verificationUrl: string },
): Promise<void> {
  await sendMail({
    to,
    subject: "CertifyChain — Validez la propriété de votre établissement",
    text:
      `Bonne nouvelle : l'existence de « ${info.schoolName} » est confirmée.\n\n` +
      `Dernière étape avant d'émettre des diplômes : prouver que vous contrôlez ` +
      `réellement cet établissement. Choisissez la méthode qui vous convient ` +
      `(DNS, courrier postal ou ProConnect) :\n${info.verificationUrl}\n\n` +
      `Tant que cette preuve n'est pas faite, votre espace reste en lecture seule.`,
  });
}

/**
 * Postal dispatch order (verify.md §2). In production this is replaced by a
 * postal-provider API (La Poste / Lob / Merci Facteur); in dev the letter
 * content (incl. the one-time code) is captured by the console/Mailpit so the
 * flow stays testable. NEVER communicates a precise delivery date.
 */
export async function sendPostalDispatchOrder(
  to: string,
  info: {
    schoolName: string;
    address: string;
    code: string;
    submitUrl: string;
    maxDeliveryDays: number;
  },
): Promise<void> {
  await sendMail({
    to,
    subject: `CertifyChain — Courrier de vérification à expédier : ${info.schoolName}`,
    text:
      `Expédier un courrier de vérification à :\n${info.address}\n\n` +
      `Contenu du courrier :\n` +
      `  Code de vérification : ${info.code}\n` +
      `  À saisir sur : ${info.submitUrl}\n` +
      `  Délai maximum de livraison : ${info.maxDeliveryDays} jours ouvrés.\n`,
  });
}

/** Forwards a landing-page waitlist signup to the platform team inbox. */
export async function sendWaitlistNotification(
  to: string,
  prospectEmail: string,
): Promise<void> {
  await sendMail({
    to,
    subject: "CertifyChain — Nouvelle demande pilote (waitlist)",
    text:
      `Un établissement souhaite rejoindre le pilote CertifyChain.\n\n` +
      `E-mail laissé sur la landing : ${prospectEmail}\n` +
      `Recontacter sous 24h ouvrées (engagement affiché sur la page).`,
  });
}

/**
 * Alerts the platform admin that a school flagged a transparency-journal entry it
 * did not issue (v2.md §V3-6). Issuance is already frozen server-side; the admin
 * investigates and either unfreezes or revokes the school.
 */
export async function sendJournalReportNotification(
  to: string,
  info: {
    schoolName: string;
    diplomaId: string;
    reason: string | null;
    adminUrl: string;
  },
): Promise<void> {
  await sendMail({
    to,
    subject: `CertifyChain — Signalement journal de transparence : ${info.schoolName}`,
    text:
      `« ${info.schoolName} » signale une émission qu'elle n'a pas réalisée.\n\n` +
      `Diplôme concerné : ${info.diplomaId}\n` +
      `${info.reason ? `Motif : ${info.reason}\n` : ""}` +
      `Les émissions de cet établissement sont GELÉES automatiquement.\n\n` +
      `Instruire le signalement (dégeler ou révoquer) : ${info.adminUrl}`,
  });
}

/** Alerts the platform admin that a new school needs manual validation. */
export async function sendSchoolReviewNotification(
  to: string,
  info: {
    schoolName: string;
    score: number | null;
    summary: string;
    adminUrl: string;
  },
): Promise<void> {
  const scoreLine =
    info.score === null
      ? "Score IA : non évalué (revue manuelle requise)."
      : `Score de validité IA : ${info.score}/100.`;
  await sendMail({
    to,
    subject: `CertifyChain — Nouvelle école à valider : ${info.schoolName}`,
    text:
      `Une nouvelle école s'est inscrite et nécessite une validation manuelle.\n\n` +
      `École : ${info.schoolName}\n${scoreLine}\n` +
      `${info.summary ? `Analyse : ${info.summary}\n` : ""}` +
      `\nValider dans le portail admin : ${info.adminUrl}`,
  });
}
