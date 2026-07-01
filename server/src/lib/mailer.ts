import { env } from "../config/env";
import { logger } from "./logger";
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
  // Console echo: always in dev (fallback / convenience), and whenever no SMTP
  // is configured. Never log mail bodies in production (PII).
  if (env.isDev || !env.SMTP_HOST) {
    logger.info("mail.console", { to: mail.to, subject: mail.subject, body: mail.text });
  }
  if (!env.SMTP_HOST) return;

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
    logger.info("mail.sent", { to: mail.to, subject: mail.subject });
  } catch (e) {
    logger.error("mail.smtp_failed", { to: mail.to, subject: mail.subject, error: String(e) });
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
