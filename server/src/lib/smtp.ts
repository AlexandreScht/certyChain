import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { randomUUID } from "node:crypto";

/**
 * Minimal, dependency-free SMTP client (node:net / node:tls only).
 *
 * Enough to deliver plain-text transactional mail (OTP codes, notifications) to:
 *   • a dev mail catcher (Mailpit) on plaintext :1025, no auth;
 *   • a basic provider over implicit TLS (:465) with AUTH LOGIN.
 *
 * Kept tiny on purpose so the tsup bundle stays pure-JS (distroless-friendly),
 * matching the project's "no native addons / few deps" stance. STARTTLS and
 * richer providers (Resend REST) are a production concern — see PLAN.md H2.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  /** Implicit TLS from the first byte (e.g. port 465). */
  secure: boolean;
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

/** Deliver one message over SMTP. Resolves once the server accepts it (250). */
export async function sendSmtp(cfg: SmtpConfig, msg: SmtpMessage): Promise<void> {
  const socket: Socket = cfg.secure
    ? tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host })
    : netConnect({ host: cfg.host, port: cfg.port });

  return await new Promise<void>((resolve, reject) => {
    let buffer = "";
    let settled = false;
    let onReply: ((line: string) => void) | null = null;

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

    socket.setTimeout(TIMEOUT_MS, () => fail(new Error("SMTP timeout")));
    socket.on("error", (e: Error) => fail(e));
    socket.on("close", () => {
      if (!settled) fail(new Error("SMTP connection closed unexpectedly"));
    });

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
      cb(last);
    }

    socket.on("data", (d: Buffer) => {
      buffer += d.toString("utf8");
      drain();
    });

    const waitReply = (): Promise<{ code: number; line: string }> =>
      new Promise((res) => {
        onReply = (line) => res({ code: Number(line.slice(0, 3)), line });
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
        expect(await waitReply(), [250], "EHLO");

        if (cfg.user && cfg.password) {
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
