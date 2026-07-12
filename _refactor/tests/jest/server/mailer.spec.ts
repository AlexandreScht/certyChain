/**
 * Mailer — régression W1 (audit 2026-07-10) côté serveur : la demande pilote
 * de la landing est réellement transférée à l'équipe. Plus l'invariant
 * produit : un échec SMTP ne fait JAMAIS échouer le flux appelant
 * (auth/émission), et sans SMTP configuré le mail est déposé sans throw.
 *
 * `config/env.ts` fige `env` au premier import : chaque variante SMTP_HOST
 * recharge donc le module via `jest.isolateModules`.
 */

const mockSendSmtp = jest.fn<Promise<void>, unknown[]>();

jest.mock("../../../apps/server/src/lib/smtp", () => ({
  sendSmtp: (...args: unknown[]) => mockSendSmtp(...args),
}));
jest.mock("../../../apps/server/src/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type MailerModule = typeof import("../../../apps/server/src/lib/mailer");
type SentMail = { to: string; subject: string; text: string };

/** Recharge env.ts + mailer.ts avec le SMTP_HOST voulu. */
function loadMailer(smtpHost: string): MailerModule {
  process.env.SMTP_HOST = smtpHost;
  let mod: MailerModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("../../../apps/server/src/lib/mailer") as MailerModule;
  });
  return mod as MailerModule;
}

const lastMail = (): SentMail => {
  const call = mockSendSmtp.mock.calls.at(-1);
  expect(call).toBeDefined();
  return (call as unknown[])[1] as SentMail;
};

beforeEach(() => {
  mockSendSmtp.mockReset();
  mockSendSmtp.mockResolvedValue(undefined);
});

describe("mailer — SMTP configuré", () => {
  it("régression W1 : la demande waitlist part vers la boîte équipe avec l'e-mail du prospect", async () => {
    const mailer = loadMailer("smtp.jest.local");
    await mailer.sendWaitlistNotification("equipe@certifychain.fr", "prospect@ecole-demo.fr");

    expect(mockSendSmtp).toHaveBeenCalledTimes(1);
    const mail = lastMail();
    expect(mail.to).toBe("equipe@certifychain.fr");
    expect(mail.subject).toMatch(/waitlist|pilote/i);
    expect(mail.text).toContain("prospect@ecole-demo.fr");
    // La promesse affichée sur la landing (« sous 24h ») est répercutée à l'équipe.
    expect(mail.text).toMatch(/24h/);
  });

  it("transmet la config SMTP de l'env au transport", async () => {
    const mailer = loadMailer("smtp.jest.local");
    await mailer.sendOtpEmail("eleve@ecole.fr", "123456");
    const config = (mockSendSmtp.mock.calls[0] as unknown[])[0] as { host: string };
    expect(config.host).toBe("smtp.jest.local");
  });

  it("l'e-mail OTP contient le code et l'avertissement de non-partage", async () => {
    const mailer = loadMailer("smtp.jest.local");
    await mailer.sendOtpEmail("eleve@ecole.fr", "987654");
    const mail = lastMail();
    expect(mail.to).toBe("eleve@ecole.fr");
    expect(mail.text).toContain("987654");
    expect(mail.text).toMatch(/ne le partagez/i);
  });

  it("l'invitation claim contient l'URL, l'école et la validité 180 jours", async () => {
    const mailer = loadMailer("smtp.jest.local");
    await mailer.sendDiplomaClaimEmail(
      "alumni@ecole.fr",
      "https://wallet.certifychain.fr/claim/tok",
      "École Supérieure du Web",
    );
    const mail = lastMail();
    expect(mail.text).toContain("https://wallet.certifychain.fr/claim/tok");
    expect(mail.text).toContain("École Supérieure du Web");
    expect(mail.text).toMatch(/180 jours/);
  });

  it("invariant : un échec SMTP ne remonte JAMAIS à l'appelant", async () => {
    const mailer = loadMailer("smtp.jest.local");
    mockSendSmtp.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      mailer.sendOtpEmail("eleve@ecole.fr", "111111"),
    ).resolves.toBeUndefined();
  });
});

describe("mailer — sans SMTP", () => {
  it("dépose le mail sans transport et sans throw", async () => {
    const mailer = loadMailer("");
    await expect(
      mailer.sendWaitlistNotification("equipe@certifychain.fr", "prospect@ecole.fr"),
    ).resolves.toBeUndefined();
    expect(mockSendSmtp).not.toHaveBeenCalled();
  });
});
