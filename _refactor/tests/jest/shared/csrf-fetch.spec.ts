/**
 * `createCsrfFetch` — double-submit CSRF + refresh de session sur 401
 * (régression audit C1 : sans le refresh, toute session meurt en 15 min).
 */
import { API_BASE, createCsrfFetch } from "../../../packages/shared/src/api/client";

type FetchCall = { url: string; init?: RequestInit };

/** Réponse minimale (createCsrfFetch ne lit que ok/status). */
function fake(status: number) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

let calls: FetchCall[] = [];

beforeEach(() => {
  calls = [];
  document.cookie = "cc_csrf=csrf-token-1";
});

afterEach(() => {
  document.cookie = "cc_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

/** Installe un mock fetch piloté par une fonction de routage. */
function mockFetch(route: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  (globalThis as { fetch: typeof fetch }).fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return route(url, init);
    },
  ) as unknown as typeof fetch;
}

describe("en-tête CSRF (double-submit)", () => {
  it("échoie le cookie CSRF sur POST, pas sur GET", async () => {
    mockFetch(() => fake(200));
    const csrfFetch = createCsrfFetch("cc_csrf");

    await csrfFetch(`${API_BASE}/diplomas`, { method: "POST" });
    await csrfFetch(`${API_BASE}/diplomas`, { method: "GET" });

    expect(headerOf(calls[0]!.init, "x-csrf-token")).toBe("csrf-token-1");
    expect(headerOf(calls[1]!.init, "x-csrf-token")).toBeNull();
  });

  it("envoie toujours credentials: include", async () => {
    mockFetch(() => fake(200));
    await createCsrfFetch("cc_csrf")(`${API_BASE}/auth/me`);
    expect(calls[0]!.init?.credentials).toBe("include");
  });
});

describe("refresh sur 401 (régression C1)", () => {
  it("401 → POST refreshPath → un retry, qui aboutit", async () => {
    let meCalls = 0;
    mockFetch((url) => {
      if (url.endsWith("/auth/refresh")) return fake(200);
      meCalls += 1;
      return meCalls === 1 ? fake(401) : fake(200);
    });
    const csrfFetch = createCsrfFetch("cc_csrf", { refreshPath: "/auth/refresh" });

    const res = await csrfFetch(`${API_BASE}/auth/me`);

    expect(res.status).toBe(200);
    const urls = calls.map((c) => c.url);
    expect(urls).toEqual([
      `${API_BASE}/auth/me`,
      `${API_BASE}/auth/refresh`,
      `${API_BASE}/auth/me`,
    ]);
    expect(calls[1]!.init?.method).toBe("POST");
  });

  it("rend le 401 d'origine quand le refresh échoue (pas de boucle)", async () => {
    mockFetch((url) => (url.endsWith("/auth/refresh") ? fake(401) : fake(401)));
    const csrfFetch = createCsrfFetch("cc_csrf", { refreshPath: "/auth/refresh" });

    const res = await csrfFetch(`${API_BASE}/wallet/diplomas`);

    expect(res.status).toBe(401);
    // 1 requête + 1 refresh, PAS de retry ni de second refresh.
    expect(calls).toHaveLength(2);
  });

  it("single-flight : deux 401 concurrents ne déclenchent qu'UN refresh", async () => {
    const seen = new Map<string, number>();
    mockFetch(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 20));
        return fake(200);
      }
      const n = (seen.get(url) ?? 0) + 1;
      seen.set(url, n);
      return n === 1 ? fake(401) : fake(200);
    });
    const csrfFetch = createCsrfFetch("cc_csrf", { refreshPath: "/auth/refresh" });

    const [a, b] = await Promise.all([
      csrfFetch(`${API_BASE}/wallet/diplomas`),
      csrfFetch(`${API_BASE}/schools/me`),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("ne tente JAMAIS de refresh sur un 401 de /login ou d'OTP (mauvais identifiants)", async () => {
    mockFetch(() => fake(401));
    const csrfFetch = createCsrfFetch("cc_csrf", { refreshPath: "/auth/refresh" });

    await csrfFetch(`${API_BASE}/auth/school/login`, { method: "POST" });
    await csrfFetch(`${API_BASE}/auth/student/otp/verify`, { method: "POST" });

    expect(calls.some((c) => c.url.endsWith("/auth/refresh"))).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("sans refreshPath configuré, un 401 est rendu tel quel", async () => {
    mockFetch(() => fake(401));
    const res = await createCsrfFetch("cc_csrf")(`${API_BASE}/auth/me`);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(1);
  });
});
