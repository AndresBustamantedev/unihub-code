import { describe, expect, it } from "vitest";
import { parseLinkHeader, isSameOrigin } from "@/integrations/canvas/pagination";
import { readCanvasConfig } from "@/integrations/canvas/config";
import { CanvasClient } from "@/integrations/canvas/client";
import { runCanvasDiagnostics } from "@/integrations/canvas/diagnostics";
import { redact } from "@/lib/redact";

const BASE = "https://campus.example.edu/api/v1";
const TOKEN = "1234~AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

function json(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init, headers: { "content-type": "application/json", ...init.headers } });
}

describe("parseLinkHeader", () => {
  it("parsea rels de Canvas", () => {
    const h = `<${BASE}/courses?page=1&per_page=10>; rel="current",<${BASE}/courses?page=2&per_page=10>; rel="next",<${BASE}/courses?page=5&per_page=10>; rel="last"`;
    const r = parseLinkHeader(h);
    expect(r.next).toBe(`${BASE}/courses?page=2&per_page=10`);
    expect(r.last).toContain("page=5");
    expect(parseLinkHeader(null)).toEqual({});
  });
  it("rechaza otros orígenes", () => {
    expect(isSameOrigin("https://evil.example/api/v1/x", BASE)).toBe(false);
    expect(isSameOrigin(`${BASE}/courses?page=2`, BASE)).toBe(true);
  });
});

describe("redact", () => {
  it("elimina tokens y cabeceras", () => {
    const out = redact(`Authorization: Bearer ${TOKEN} url=?access_token=${TOKEN}&x=1 raw ${TOKEN}`);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain("AbCdEf");
  });
});

describe("readCanvasConfig", () => {
  it("exige https y /api/v1", () => {
    expect(readCanvasConfig({ CANVAS_BASE_URL: "http://x.com/api/v1", CANVAS_ACCESS_TOKEN: TOKEN }).ok).toBe(false);
    expect(readCanvasConfig({ CANVAS_BASE_URL: "https://x.com", CANVAS_ACCESS_TOKEN: TOKEN }).ok).toBe(false);
    expect(readCanvasConfig({ CANVAS_BASE_URL: `${BASE}/`, CANVAS_ACCESS_TOKEN: TOKEN })).toEqual({ ok: true, baseUrl: BASE, token: TOKEN });
  });
  it("rechaza prefijo Bearer", () => {
    expect(readCanvasConfig({ CANVAS_BASE_URL: BASE, CANVAS_ACCESS_TOKEN: `Bearer ${TOKEN}` }).ok).toBe(false);
  });
});

describe("CanvasClient", () => {
  it("pagina siguiendo Link y no sale del origen", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("page=2")) return json([{ id: 3 }], { headers: { link: `<https://evil.example/api/v1/courses?page=3>; rel="next"` } });
      return json([{ id: 1 }, { id: 2 }], { headers: { link: `<${BASE}/courses?page=2&per_page=100>; rel="next"` } });
    };
    const c = new CanvasClient({ baseUrl: BASE, token: TOKEN, fetchImpl });
    const all = await c.getAll<{ id: number }>("courses");
    expect(all.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(calls.some((u) => u.includes("evil"))).toBe(false);
    expect(calls.every((u) => !u.includes(TOKEN))).toBe(true);
  });

  it("envía el token solo en Authorization", async () => {
    let auth: string | null = null;
    const fetchImpl: typeof fetch = async (_i, init) => {
      auth = new Headers(init?.headers).get("authorization");
      return json({ id: 1, name: "X" });
    };
    await new CanvasClient({ baseUrl: BASE, token: TOKEN, fetchImpl }).get("users/self");
    expect(auth).toBe(`Bearer ${TOKEN}`);
  });

  it("clasifica 401 y 3xx", async () => {
    const c401 = new CanvasClient({ baseUrl: BASE, token: TOKEN, fetchImpl: async () => json({ errors: [] }, { status: 401 }) });
    await expect(c401.get("users/self")).rejects.toMatchObject({ kind: "unauthorized" });
    const c302 = new CanvasClient({ baseUrl: BASE, token: TOKEN, fetchImpl: async () => new Response(null, { status: 302, headers: { location: "/login" } }) });
    await expect(c302.get("users/self")).rejects.toMatchObject({ kind: "redirect" });
  });

  it("acepta el prefijo while(1);", async () => {
    const c = new CanvasClient({ baseUrl: BASE, fetchImpl: async () => new Response('while(1);{"id":7}', { status: 200 }) });
    expect((await c.get<{ id: number }>("x")).data.id).toBe(7);
  });
});

describe("runCanvasDiagnostics", () => {
  it("sin token => not_configured, sin fingir datos", async () => {
    const r = await runCanvasDiagnostics({ env: { CANVAS_BASE_URL: BASE }, fetchImpl: async () => json({ errors: [] }, { status: 401 }) });
    expect(r.overall).toBe("not_configured");
    expect(r.identity).toBeUndefined();
  });

  it("token válido => authenticated", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const hasAuth = new Headers(init?.headers).has("authorization");
      if (!hasAuth) return json({ errors: [] }, { status: 401 });
      if (String(input).includes("users/self")) return json({ id: 42, name: "Alumno" }, { headers: { "x-rate-limit-remaining": "700.0" } });
      return json([{ id: 1 }, { id: 2 }], { headers: { "x-rate-limit-remaining": "699.5", "x-request-cost": "0.5" } });
    };
    const r = await runCanvasDiagnostics({ env: { CANVAS_BASE_URL: BASE, CANVAS_ACCESS_TOKEN: TOKEN }, fetchImpl });
    expect(r.overall).toBe("authenticated");
    expect(r.identity).toEqual({ id: 42, name: "Alumno" });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("token rechazado => auth_failed", async () => {
    const r = await runCanvasDiagnostics({ env: { CANVAS_BASE_URL: BASE, CANVAS_ACCESS_TOKEN: TOKEN }, fetchImpl: async () => json({}, { status: 401 }) });
    expect(r.overall).toBe("auth_failed");
  });
});

describe("errores de red", () => {
  it("expone el código TLS y sugiere --use-system-ca", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("x"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }) });
    };
    const r = await runCanvasDiagnostics({ env: { CANVAS_BASE_URL: BASE, CANVAS_ACCESS_TOKEN: TOKEN }, fetchImpl });
    expect(r.overall).toBe("unreachable");
    expect(r.checks.find((c) => c.id === "reachability")?.detail).toContain("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
    expect(r.nextSteps.join(" ")).toContain("--use-system-ca");
  });
});
