import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { randomUUID } from "node:crypto";

/**
 * Minimal, dependency-free SMTP client (node:net / node:tls only).
 *
 * Enough to deliver plain-text transactional mail (OTP codes, notifications) to:
 *   • a dev mail catcher (Mailpit) on plaintext :1025, no auth;
 *   • a basic provider over implicit TLS (:465) with AUTH LOGIN;
 *   • a basic provider over STARTTLS (:587) with AUTH LOGIN — the client
 *     connects in the clear, elevates via the `STARTTLS` command once the
 *     server advertises it in its EHLO capabilities, then re-issues EHLO on
 *     the now-encrypted channel (RFC 3207 §4.2: the capability list MUST be
 *     re-discovered post-elevation — several providers only advertise `AUTH`
 *     there, never in the clear).
 *
 * Kept tiny on purpose so the tsup bundle stays pure-JS (distroless-friendly),
 * matching the project's "no native addons / few deps" stance. Richer
 * providers (Resend REST) are a production concern — see PLAN.md H2.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  /** Implicit TLS from the first byte (e.g. port 465). Mutually exclusive with `starttls`. */
  secure: boolean;
  /**
   * Explicit TLS elevation on an initially plaintext connection (e.g. port
   * 587). Mutually exclusive with `secure`. If the server does not advertise
   * `STARTTLS` in its EHLO capabilities, or the elevation itself fails, the
   * send fails outright — it never falls back to a plaintext `AUTH LOGIN`,
   * which would put the password on the wire in clear.
   */
  starttls?: boolean;
  /**
   * Extra trusted CA certificate(s) for the TLS handshake (implicit or
   * STARTTLS), on top of Node's default trust store — e.g. a private/internal
   * relay, or a throwaway CA in tests (see `test/helpers/fake-smtp-server.ts`).
   * Omitted → the public trust store alone, exactly as before this option existed.
   */
  ca?: string | Buffer | Array<string | Buffer>;
  /** Header From, e.g. `CertifyChain <no-reply@certifychain.local>`. */
  from: string;
}

export interface SmtpMessage {
  to: string;
  subject: string;
  text: string;
}

const TIMEOUT_MS = 10_000;

/** Extract the bare address from `Name <addr@host>` (or return the input). */
function addressOf(input: string): string {
  const m = /<([^>]+)>/.exec(input);
  return (m?.[1] ?? input).trim();
}

/** RFC 2047 encoded-word so accented header values survive transport. */
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Wrap a base64 string into 76-char CRLF-terminated lines (RFC 2045). */
function wrap76(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? [b64]).join("\r\n");
}

/** Index just past a complete SMTP reply in `buf`, or -1 if incomplete. */
function findCompleteReply(buf: string): number {
  let pos = 0;
  for (;;) {
    const nl = buf.indexOf("\r\n", pos);
    if (nl < 0) return -1;
    const line = buf.slice(pos, nl);
    // Final line of a reply: `NNN ` (space). Continuations use `NNN-`.
    if (/^\d{3} /.test(line)) return nl + 2;
    pos = nl + 2;
  }
}

/**
 * EHLO capability keywords from a full, possibly multi-line reply
 * (`"250-STARTTLS"` → `"STARTTLS"`). Keywords are case-insensitive per
 * RFC 5321 — normalized upper-case so callers can compare with a literal.
 */
function ehloCapabilities(lines: string[]): Set<string> {
  return new Set(lines.map((line) => (line.slice(4).split(" ")[0] ?? "").toUpperCase()));
}

/** Deliver one message over SMTP. Resolves once the server accepts it (250). */
export async function sendSmtp(cfg: SmtpConfig, msg: SmtpMessage): Promise<void> {
  if (cfg.secure && cfg.starttls) {
    // Belt-and-braces: `config/env.ts` already refuses this combination at
    // boot, but `sendSmtp` is a standalone lib callable directly (tests,
    // future callers) — implicit TLS and a later STARTTLS elevation make no
    // sense together, so fail loudly instead of picking one silently.
    throw new Error("SMTP config invalide : `secure` (TLS implicite) et `starttls` sont mutuellement exclusifs");
  }

  let socket: Socket = cfg.secure
    ? tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host, ca: cfg.ca })
    : netConnect({ host: cfg.host, port: cfg.port });

  return await new Promise<void>((resolve, reject) => {
    let buffer = "";
    let settled = false;
    let onReply: ((reply: { code: number; line: string; lines: string[] }) => void) | null = null;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };
    const succeed = (): void => {
      if (settled) return;
      settled = true;
      socket.end("QUIT\r\n"); // best-effort; the message is already accepted
      resolve();
    };

    function drain(): void {
      if (!onReply) return;
      const end = findCompleteReply(buffer);
      if (end < 0) return;
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end);
      const lines = chunk.split("\r\n").filter((l) => l.length > 0);
      const last = lines[lines.length - 1] ?? "";
      const cb = onReply;
      onReply = null;
      cb({ code: Number(last.slice(0, 3)), line: last, lines });
    }

    // (Re)wires timeout/error/close/data handling onto whichever socket is
    // currently active. Called once for the initial plaintext/implicit-TLS
    // socket, and again after a STARTTLS elevation swaps in the TLS socket.
    const bindSocket = (s: Socket): void => {
      s.setTimeout(TIMEOUT_MS, () => fail(new Error("SMTP timeout")));
      s.on("error", (e: Error) => fail(e));
      s.on("close", () => {
        if (!settled) fail(new Error("SMTP connection closed unexpectedly"));
      });
      s.on("data", (d: Buffer) => {
        buffer += d.toString("utf8");
        drain();
      });
    };
    bindSocket(socket);

    const waitReply = (): Promise<{ code: number; line: string; lines: string[] }> =>
      new Promise((res) => {
        onReply = (reply) => res(reply);
        drain();
      });

    const write = (s: string): void => {
      socket.write(`${s}\r\n`);
    };
    const expect = (
      reply: { code: number; line: string },
      ok: number[],
      step: string,
    ): void => {
      if (!ok.includes(reply.code)) throw new Error(`SMTP ${step} rejected: ${reply.line}`);
    };

    void (async () => {
      try {
        expect(await waitReply(), [220], "greeting");

        write("EHLO certifychain.local");
        let ehlo = await waitReply();
        expect(ehlo, [250], "EHLO");

        if (cfg.starttls) {
          if (!ehloCapabilities(ehlo.lines).has("STARTTLS")) {
            // The caller asked for STARTTLS explicitly: the server not
            // advertising it is a hard failure, never a silent downgrade to
            // a plaintext AUTH LOGIN (that would leak the password).
            throw new Error(
              "SMTP STARTTLS requis mais non annoncé par le serveur dans les capacités EHLO — abandon",
            );
          }

          write("STARTTLS");
          expect(await waitReply(), [220], "STARTTLS");

          // RFC 3207 §5 (the classic "STARTTLS command injection" class of
          // bug): a compliant server never pipelines anything past the 220 —
          // any bytes already sitting in `buffer` at this point would be
          // plaintext smuggled in ahead of the TLS handshake. Refuse them.
          if (buffer.length > 0) {
            throw new Error(
              "SMTP STARTTLS : octets en clair reçus juste après le 220 (indice d'injection) — abandon",
            );
          }

          const plainSocket = socket;
          plainSocket.setTimeout(0); // cancel the plaintext idle timer before handing off the fd
          plainSocket.removeAllListeners("data");
          plainSocket.removeAllListeners("error");
          plainSocket.removeAllListeners("close");
          plainSocket.removeAllListeners("timeout");

          socket = tlsConnect({ socket: plainSocket, servername: cfg.host, ca: cfg.ca });
          bindSocket(socket);

          // RFC 3207: the slate is wiped by the upgrade — capabilities MUST
          // be re-discovered over the encrypted channel. `AUTH` itself often
          // only shows up here (providers routinely refuse to advertise it
          // in the clear, precisely so a buggy client can't authenticate
          // before elevating).
          write("EHLO certifychain.local");
          ehlo = await waitReply();
          expect(ehlo, [250], "EHLO (post-STARTTLS)");
        }

        if (cfg.user && cfg.password) {
          if (!cfg.secure && !cfg.starttls) {
            // Defence in depth: AUTH LOGIN carries the password base64-encoded
            // — i.e. in the clear — over the wire. Refuse rather than leak it
            // even if a caller mis-set `secure`/`starttls`.
            throw new Error("SMTP AUTH refusé sur un canal non chiffré (ni `secure` ni `starttls`)");
          }
          write("AUTH LOGIN");
          expect(await waitReply(), [334], "AUTH");
          write(Buffer.from(cfg.user, "utf8").toString("base64"));
          expect(await waitReply(), [334], "AUTH user");
          write(Buffer.from(cfg.password, "utf8").toString("base64"));
          expect(await waitReply(), [235], "AUTH password");
        }

        write(`MAIL FROM:<${addressOf(cfg.from)}>`);
        expect(await waitReply(), [250], "MAIL FROM");

        write(`RCPT TO:<${addressOf(msg.to)}>`);
        expect(await waitReply(), [250, 251], "RCPT TO");

        write("DATA");
        expect(await waitReply(), [354], "DATA");

        const headers = [
          `From: ${cfg.from}`,
          `To: ${msg.to}`,
          `Subject: ${encodeHeaderWord(msg.subject)}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: <${randomUUID()}@certifychain.local>`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: base64",
        ].join("\r\n");
        const body = wrap76(Buffer.from(msg.text, "utf8").toString("base64"));
        // base64 body never contains a line starting with "." → no dot-stuffing.
        socket.write(`${headers}\r\n\r\n${body}\r\n.\r\n`);
        expect(await waitReply(), [250], "message body");

        succeed();
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}
