/**
 * In-memory fake SMTP server (node:net / node:tls only — no dependency, same
 * stance as `smtp.ts` itself and as `fake-vault.ts` for Vault Transit). It
 * exercises the REAL client (`sendSmtp`) end-to-end against a real TCP/TLS
 * socket, in one of four modes:
 *
 *   • "plain-noauth"        — Mailpit-like: plaintext, no STARTTLS advertised,
 *                             no AUTH ever requested (dev catcher, :1025).
 *   • "implicit-tls"        — TLS from the first byte (e.g. provider :465).
 *   • "starttls"            — plaintext EHLO advertising `STARTTLS`; elevates
 *                             on the `STARTTLS` command, then re-EHLOs on the
 *                             encrypted channel where `AUTH LOGIN` appears
 *                             (mirrors real providers: AUTH is often ONLY
 *                             advertised post-elevation).
 *   • "starttls-not-advertised" — plaintext EHLO WITHOUT `STARTTLS` in its
 *                             capabilities, so a client that requires
 *                             STARTTLS must fail closed rather than downgrade.
 *
 * The TLS cert/key below is a static, pre-generated (via `openssl req -x509`,
 * not at test-run time — no new dependency, no shell-out from the test
 * itself) self-signed RSA-2048 fixture, SAN = localhost / certifychain.local /
 * 127.0.0.1, valid 100 years. It is ONLY ever used as a throwaway TLS server
 * identity in tests — never trust it for anything else.
 */
import { createServer as netCreateServer, type Server as NetServer, type Socket } from "node:net";
import { createServer as tlsCreateServer, TLSSocket } from "node:tls";
import type { AddressInfo } from "node:net";

const TEST_TLS_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC8stseWpurJ4vW
2aoJQteH9sooJfjJnwx7xmb4CNaV1lBzb5Ao4etchIHiBMRcU4/e4Y1IyMOBXO5L
5ujOAYuHK6IXERCAgmvxjZybH9kUvN4PNQwIAZM3joeHwB0HUxwCjEM4rG5bylV8
q0hLXSRjtq0CBhLFAa2FY3XMAZgILuLOh2LsFDjtsdkrVfOQjq0TfBjDpgcrdr1E
mh8a5dLanK6q+lmOXf9Tcs2ETIsvMtgHvR9peDRvotuzR9PZxsI6EA3TXbkRW6MM
S99hpQ7S4cBG+69qLVcf1E2gLncEkeD4elwcQ8Kp80aR0+xTv2HbuA0Nm5DNvOh4
0AcYyZ4DAgMBAAECggEARQ7N20t8ugQkjNInBPGl8Ff0vwG6jYs8JdZD29VcNwTy
d3SmVRftK3RBFmb5N/LK7d4s9yymRCMvAK82lyIAnszsqrVvjSBuAb56SFk8+HZw
bC9VQl7VMllip187IHGdiB8uAME2ODiR1ajXseEaDrYNlfaECv5kszLlqu4QZjml
jv+SH6Sk73afUlQqlnPDFabXsVk8iNM7+Js3XgJNF5rS0TKxuKXYbulO9QvgV0uH
CZKY81qgXBNECELtcQZcSrB+OqtQ/tJo2rBfme1VKTWEb3JdQ8kQ15j8TGNczahO
4jqokEk6fKWojB4WLLNy1f7r25kDdHMUjat/30pXMQKBgQDiBE96a6YlF4tS1tA5
9RapBavMRp520wFF46ryoGbhb0j8VSrS/HyNeg+XBfjXmKx7Ve4wSFHwqCl/Mb1o
2tbSy/D2xz9X29tYeFzGlZp+AnWbYmcF8unRz2AR7k84z1zU1dAoCd8ADOTQYSuY
ggQgQLY+rwvL76o4hMk2Srtg8wKBgQDVuzGoVHfTsq0hnBE+z+NllEZNTueOGnre
i69qXz/zsvVGGCpWUP1yKUrmX7pGj6Lv3wfgllgmlFtnpMIvZSu0LkIsxYoNhtyC
TbBYCj39bYeuK9hJkrD3URth2qjKL5+uYOLL/T2mPTpLwR9rfXp5AzXUo9Aipq6j
f/Y2ZIuSsQKBgQCtF94ChJT+jTR/YdKgwGn1UkmLLX5IxDqSWtTd8ig4eDDuRw9/
/CwrcZKk98bm3p8h6eJ8CbbvVupI5kAIIKkrUVMeu+NwFwm6jJuI3qQt4xZMxSTf
cnTN4ULTGK6FdJHE0mcTctPdRwKp7/EiYFhmlwi7ovWm3sp/dHpg4QT2LwKBgBm1
UYzI1Dz/kfmn9x8SDG0sf6RO6GVcZAkezjPCT0P187DBuV32kfXIZ7z8KMDSCCxI
LH9kNig10iTOWZkv1yjuI4GVJTzpSt7Vj2+Xk8tHAHn/xh1barPk6qFDlufzAIcO
GlmlFWRImxl/mlLonfGuZCw2pBN27yy1eJ0kTPGRAoGBAIM8duIIlE7oe5UhzF3k
fKx6zOtrxAhtFzdL31tUL4US085lZWfICpKuEiH8q1JAA48ldIM7OCqn55wQVJW2
wcgS7ngdaDn8MnTNB9bSDHA+DItYzy7XrVfhpI37AFdZnqsCZG44lSgKpPYJKfe/
TtaSW3pzUBhkCln4kmLgxBCy
-----END PRIVATE KEY-----
`;

/** Exported so tests can pass it as `ca` — trusting THIS one throwaway cert,
 *  not disabling certificate validation altogether (`rejectUnauthorized:
 *  false` would also skip the servername/SAN check we specifically want to
 *  exercise here). */
export const TEST_TLS_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDFTCCAf2gAwIBAgIUSNHrXDjF1EtLzL/kimGxHsj4Vt0wDQYJKoZIhvcNAQEL
BQAwADAgFw0yNjA3MjgxNDMxMjFaGA8yMTI2MDcwNDE0MzEyMVowADCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBALyy2x5am6sni9bZqglC14f2yigl+Mmf
DHvGZvgI1pXWUHNvkCjh61yEgeIExFxTj97hjUjIw4Fc7kvm6M4Bi4crohcREICC
a/GNnJsf2RS83g81DAgBkzeOh4fAHQdTHAKMQzisblvKVXyrSEtdJGO2rQIGEsUB
rYVjdcwBmAgu4s6HYuwUOO2x2StV85COrRN8GMOmByt2vUSaHxrl0tqcrqr6WY5d
/1NyzYRMiy8y2Ae9H2l4NG+i27NH09nGwjoQDdNduRFbowxL32GlDtLhwEb7r2ot
Vx/UTaAudwSR4Ph6XBxDwqnzRpHT7FO/Ydu4DQ2bkM286HjQBxjJngMCAwEAAaOB
hDCBgTAdBgNVHQ4EFgQULUepe0XkRKb13CYWURtxKk2H49gwHwYDVR0jBBgwFoAU
LUepe0XkRKb13CYWURtxKk2H49gwDwYDVR0TAQH/BAUwAwEB/zAuBgNVHREEJzAl
gglsb2NhbGhvc3SCEmNlcnRpZnljaGFpbi5sb2NhbIcEfwAAATANBgkqhkiG9w0B
AQsFAAOCAQEAkXjUx1g0L2hcX5/bmTJMuCcN2hfzmfJMBu3tN3WS2jWcZGB11cWy
5YhVKi5vKaJbLajRpNkC0AVjRdzg8LO8ElECQUl4HaX834dMz2BJ0zAFMKtN5nko
iFzbYqd9oJPapPEQXAzN7rIIYxnbI5BP9/dkrGfH2Y5j3yl8aBxrgooGypRIrAnN
ebhzbRTBux1H6JOattS3+UWIFs68nE6Qzu4uqzejwba97/tXfRAn23e4C3oJyvqx
uwLXRc8BYZy4tD9g809svdHsATOI5BTqtVgGp7FMH+UugpJCAfEEGjMYaOKhf6eB
oSIruzC9KN+CfRsUA6sZcOKwCndVniy8Zg==
-----END CERTIFICATE-----
`;

export type FakeSmtpMode = "plain-noauth" | "implicit-tls" | "starttls" | "starttls-not-advertised";

export interface FakeSmtpMessage {
  from: string;
  to: string;
  /** Raw DATA payload, one entry per line (dot-terminator excluded). */
  body: string[];
}

export interface FakeSmtpServerOptions {
  mode: FakeSmtpMode;
  user?: string;
  password?: string;
}

export interface FakeSmtpServer {
  port: number;
  messages: FakeSmtpMessage[];
  /** True once the server actually performed a STARTTLS elevation. */
  usedStarttls: boolean;
  /** True if `AUTH` was received while the channel was still plaintext — a
   *  hard failure for the client under test: credentials must NEVER be sent
   *  (or even attempted) unencrypted. */
  authAttemptedInClear: boolean;
  /** Whether the channel was encrypted at the moment AUTH actually completed
   *  (`null` if AUTH never happened at all). */
  authOverTls: boolean | null;
  close(): Promise<void>;
}

export async function startFakeSmtpServer(options: FakeSmtpServerOptions): Promise<FakeSmtpServer> {
  const state: FakeSmtpServer = {
    port: 0,
    messages: [],
    usedStarttls: false,
    authAttemptedInClear: false,
    authOverTls: null,
    close: async () => {},
  };
  const sockets = new Set<Socket>();

  function handleConnection(initialSocket: Socket): void {
    let socket: Socket = initialSocket;
    let buffer = "";
    let tlsActive = options.mode === "implicit-tls";
    let inData = false;
    let mailFrom = "";
    let rcptTo = "";
    let dataLines: string[] = [];
    let authStep: "none" | "user" | "password" = "none";
    let authUser = "";
    const capabilitiesAdvertiseStarttls = options.mode === "starttls";

    const send = (line: string): void => {
      socket.write(`${line}\r\n`);
    };

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      let idx = buffer.indexOf("\r\n");
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleLine(line);
        idx = buffer.indexOf("\r\n");
      }
    };

    function handleLine(line: string): void {
      if (inData) {
        if (line === ".") {
          inData = false;
          state.messages.push({ from: mailFrom, to: rcptTo, body: dataLines });
          dataLines = [];
          send("250 2.0.0 OK: queued");
          return;
        }
        dataLines.push(line);
        return;
      }

      if (authStep === "user") {
        authUser = Buffer.from(line, "base64").toString("utf8");
        authStep = "password";
        send("334 UGFzc3dvcmQ6"); // "Password:"
        return;
      }
      if (authStep === "password") {
        const password = Buffer.from(line, "base64").toString("utf8");
        authStep = "none";
        state.authOverTls = tlsActive;
        if (!tlsActive) state.authAttemptedInClear = true;
        const ok = authUser === (options.user ?? "") && password === (options.password ?? "");
        send(ok ? "235 2.7.0 Authentication successful" : "535 5.7.8 Authentication failed");
        return;
      }

      const spaceIdx = line.indexOf(" ");
      const cmd = (spaceIdx < 0 ? line : line.slice(0, spaceIdx)).toUpperCase();
      const arg = spaceIdx < 0 ? "" : line.slice(spaceIdx + 1);

      switch (cmd) {
        case "EHLO": {
          const lines = ["fake-smtp greets " + arg];
          if (tlsActive) lines.push("AUTH LOGIN"); // mirrors real providers: AUTH often ONLY post-STARTTLS
          if (!tlsActive && capabilitiesAdvertiseStarttls) lines.push("STARTTLS");
          lines.push("8BITMIME");
          const out = lines.map((l, i) => `250${i === lines.length - 1 ? " " : "-"}${l}`);
          socket.write(out.join("\r\n") + "\r\n");
          return;
        }
        case "STARTTLS": {
          if (!capabilitiesAdvertiseStarttls) {
            send("500 5.5.1 Command unrecognized");
            return;
          }
          send("220 2.0.0 Ready to start TLS");
          const plain = socket;
          plain.removeListener("data", onData);
          const upgraded = new TLSSocket(plain, {
            isServer: true,
            key: TEST_TLS_KEY_PEM,
            cert: TEST_TLS_CERT_PEM,
          });
          sockets.add(upgraded);
          upgraded.on("error", () => {});
          upgraded.on("data", onData);
          socket = upgraded;
          tlsActive = true;
          state.usedStarttls = true;
          return;
        }
        case "AUTH":
          if (arg.toUpperCase().startsWith("LOGIN")) {
            authStep = "user";
            send("334 VXNlcm5hbWU6"); // "Username:"
          } else {
            send("504 5.5.4 Unrecognized authentication type");
          }
          return;
        case "MAIL":
          mailFrom = /<[^>]*>/.exec(arg)?.[0] ?? arg;
          send("250 2.1.0 OK");
          return;
        case "RCPT":
          rcptTo = /<[^>]*>/.exec(arg)?.[0] ?? arg;
          send("250 2.1.5 OK");
          return;
        case "DATA":
          inData = true;
          send("354 Start mail input; end with <CRLF>.<CRLF>");
          return;
        case "QUIT":
          send("221 2.0.0 Bye");
          socket.end();
          return;
        default:
          send("500 5.5.1 Command unrecognized");
      }
    }

    sockets.add(initialSocket);
    initialSocket.on("error", () => {});
    initialSocket.on("close", () => sockets.delete(initialSocket));
    initialSocket.on("data", onData);
    initialSocket.write("220 fake-smtp ESMTP fake ready\r\n");
  }

  const server: NetServer =
    options.mode === "implicit-tls"
      ? tlsCreateServer({ key: TEST_TLS_KEY_PEM, cert: TEST_TLS_CERT_PEM }, handleConnection)
      : netCreateServer(handleConnection);

  // No explicit host: bind the default wildcard address so BOTH `127.0.0.1`
  // and `localhost` (which may resolve to `::1` first, as it does on this
  // Windows dev box) reach the server — tests use `localhost` for the TLS
  // cases so `servername` matches the fixture cert's DNS SAN.
  await new Promise<void>((resolve) => server.listen(0, resolve));
  state.port = (server.address() as AddressInfo).port;
  state.close = () =>
    new Promise<void>((resolve, reject) => {
      for (const s of sockets) s.destroy();
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return state;
}
