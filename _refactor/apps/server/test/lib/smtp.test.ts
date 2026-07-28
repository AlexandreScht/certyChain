import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendSmtp } from "../../src/lib/smtp";
import { startFakeSmtpServer, TEST_TLS_CERT_PEM } from "../helpers/fake-smtp-server";

/**
 * `lib/smtp.ts` — client SMTP maison, sans dépendance (node:net/node:tls).
 *
 * Exerce le VRAI client contre un VRAI serveur en mémoire (`fake-smtp-server.ts`,
 * même patron que `fake-vault.ts` pour Vault Transit) plutôt que de mocker la
 * classe — TCP réel, TLS réel (cert auto-signé jetable), pas de réseau.
 *
 * Couvre les quatre chemins listés dans le brief STARTTLS :
 *   1. élévation STARTTLS nominale puis AUTH LOGIN sur le canal chiffré ;
 *   2. serveur qui n'annonce PAS STARTTLS alors qu'il est exigé → échec sans
 *      jamais envoyer les identifiants ;
 *   3. TLS implicite (:465) inchangé ;
 *   4. clair sans auth (Mailpit :1025) inchangé.
 */

const msg = { to: "eleve@ecole.fr", subject: "Sujet café ☕", text: "Bonjour, voici le code : 123456" };

describe("sendSmtp — STARTTLS (élévation TLS explicite, ex. port 587)", () => {
  it("EHLO annonce STARTTLS → élévation → ré-EHLO chiffré → AUTH LOGIN sur le canal chiffré → message livré", async () => {
    const server = await startFakeSmtpServer({
      mode: "starttls",
      user: "alice",
      password: "s3cret",
    });
    try {
      await sendSmtp(
        {
          // `localhost` (not the `127.0.0.1` bind address) so `servername`
          // matches a DNS entry in the fixture cert's SAN — an IP literal as
          // SNI is deprecated (RFC 6066) and would only exercise the IP-SAN
          // branch of hostname verification, not the common DNS-SAN one.
          host: "localhost",
          port: server.port,
          user: "alice",
          password: "s3cret",
          secure: false,
          starttls: true,
          ca: TEST_TLS_CERT_PEM,
          from: "CertifyChain <no-reply@certifychain.local>",
        },
        msg,
      );

      assert.equal(server.usedStarttls, true, "le serveur doit avoir vu une commande STARTTLS");
      assert.equal(server.authAttemptedInClear, false, "AUTH ne doit JAMAIS survenir en clair");
      assert.equal(server.authOverTls, true, "AUTH doit avoir été validé APRÈS l'élévation TLS");
      assert.equal(server.messages.length, 1);
      assert.equal(server.messages[0]?.to, "<eleve@ecole.fr>");
      assert.equal(server.messages[0]?.from, "<no-reply@certifychain.local>");
    } finally {
      await server.close();
    }
  });

  it("serveur n'annonçant PAS STARTTLS alors qu'il est exigé → échec, AUCUN identifiant envoyé", async () => {
    const server = await startFakeSmtpServer({
      mode: "starttls-not-advertised",
      user: "alice",
      password: "s3cret",
    });
    try {
      await assert.rejects(
        sendSmtp(
          {
            host: "127.0.0.1",
            port: server.port,
            user: "alice",
            password: "s3cret",
            secure: false,
            starttls: true,
            from: "CertifyChain <no-reply@certifychain.local>",
          },
          msg,
        ),
        /STARTTLS/,
      );

      assert.equal(server.usedStarttls, false);
      assert.equal(server.authAttemptedInClear, false, "jamais de repli silencieux vers AUTH en clair");
      assert.equal(server.authOverTls, null, "AUTH n'a même jamais été tenté");
      assert.equal(server.messages.length, 0, "aucun message ne doit avoir été livré");
    } finally {
      await server.close();
    }
  });

  it("config invalide `secure` + `starttls` simultanés est rejetée sans connexion", async () => {
    await assert.rejects(
      sendSmtp(
        {
          host: "127.0.0.1",
          port: 1,
          secure: true,
          starttls: true,
          from: "CertifyChain <no-reply@certifychain.local>",
        },
        msg,
      ),
      /mutuellement exclusifs/,
    );
  });
});

describe("sendSmtp — TLS implicite (ex. port 465) — inchangé", () => {
  it("connexion TLS dès le premier octet + AUTH LOGIN + livraison", async () => {
    const server = await startFakeSmtpServer({
      mode: "implicit-tls",
      user: "bob",
      password: "hunter2",
    });
    try {
      await sendSmtp(
        {
          host: "localhost", // see comment above the STARTTLS test re: DNS-SAN vs IP SNI
          port: server.port,
          user: "bob",
          password: "hunter2",
          secure: true,
          ca: TEST_TLS_CERT_PEM,
          from: "CertifyChain <no-reply@certifychain.local>",
        },
        msg,
      );

      assert.equal(server.usedStarttls, false, "pas de STARTTLS en TLS implicite — inutile");
      assert.equal(server.authOverTls, true);
      assert.equal(server.authAttemptedInClear, false);
      assert.equal(server.messages.length, 1);
    } finally {
      await server.close();
    }
  });
});

describe("sendSmtp — clair sans auth (dev, ex. Mailpit :1025) — inchangé", () => {
  it("aucun user/password → pas de AUTH du tout, livraison en clair", async () => {
    const server = await startFakeSmtpServer({ mode: "plain-noauth" });
    try {
      await sendSmtp(
        {
          host: "127.0.0.1",
          port: server.port,
          secure: false,
          from: "CertifyChain <no-reply@certifychain.local>",
        },
        msg,
      );

      assert.equal(server.usedStarttls, false);
      assert.equal(server.authOverTls, null, "AUTH n'a jamais été tenté — pas d'identifiants configurés");
      assert.equal(server.authAttemptedInClear, false);
      assert.equal(server.messages.length, 1);
      assert.equal(server.messages[0]?.to, "<eleve@ecole.fr>");
    } finally {
      await server.close();
    }
  });
});
