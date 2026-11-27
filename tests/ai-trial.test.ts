import { describe, expect, it, vi } from "vitest";
import { handleTrial, trialStatus, type TrialDeps } from "@/features/ai-trial/handler";
import { AiError, complete } from "@/integrations/ai/provider";
import { TRIAL_MODEL } from "@/integrations/ai/trial";

const TOKEN = "x".repeat(40);

function makeDeps(over: Partial<TrialDeps> & { used?: number; enabled?: boolean; limitUsd?: number | null } = {}) {
  const added: Array<[string, number, number, number]> = [];
  const calls: Array<{ model: string; apiKey: string; maxTokens: number }> = [];
  const deps: TrialDeps = {
    env: { UNIHUB_TRIAL_ENABLED: "1", OPENAI_API_KEY: "sk-casa", TRIAL_MONTHLY_USD: "0.5" },
    verifyUser: async (t) => (t === TOKEN ? { id: "u1" } : null),
    access: async () => ({ enabled: over.enabled ?? true, limitUsd: over.limitUsd ?? null, used: over.used ?? 0 }),
    addUsage: async (_uid, m, i, o, c) => void added.push([m, i, o, c]),
    complete: async (cfg, req) => {
      calls.push({ model: cfg.model, apiKey: cfg.apiKey, maxTokens: req.maxTokens });
      return { text: "Respuesta", truncated: false, inputTokens: 10_000, outputTokens: 1_000 };
    },
    ...over,
  };
  return { deps, added, calls };
}

const body = { system: "Eres un tutor.", user: "¿Qué es un límite?", maxTokens: 1500 };

describe("prueba gratuita de IA (intermediario de la web)", () => {
  it("usa siempre el modelo económico con la clave de UniHub y apunta el gasto", async () => {
    const { deps, added, calls } = makeDeps();
    const r = await handleTrial(TOKEN, body, deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ text: "Respuesta", inputTokens: 10_000, outputTokens: 1_000, limit: 0.5 });
    expect(calls).toEqual([{ model: TRIAL_MODEL, apiKey: "sk-casa", maxTokens: 1500 }]);
    // 10.000 × 0,10 $/M + 1.000 × 0,50 $/M = 0,0015 $
    expect(added[0]![3]).toBeCloseTo(0.0015, 6);
  });

  it("no deja pasar sin sesión, sin activar o con la prueba apagada", async () => {
    expect((await handleTrial(null, body, makeDeps().deps)).status).toBe(401);
    expect((await handleTrial("y".repeat(40), body, makeDeps().deps)).status).toBe(401);
    expect((await handleTrial(TOKEN, body, makeDeps({ enabled: false }).deps)).body.kind).toBe("trial_off");
    const off = makeDeps();
    off.deps.env = { OPENAI_API_KEY: "sk-casa" };
    expect((await handleTrial(TOKEN, body, off.deps)).status).toBe(503);
  });

  it("al llegar al límite del mes responde 402 y no llama a OpenAI", async () => {
    const { deps, calls } = makeDeps({ used: 0.4999 });
    const r = await handleTrial(TOKEN, body, deps);
    expect(r).toMatchObject({ status: 402, body: { kind: "quota" } });
    expect(calls).toHaveLength(0);
    // Límite propio de esa cuenta.
    expect((await handleTrial(TOKEN, body, makeDeps({ used: 0.6, limitUsd: 2 }).deps)).status).toBe(200);
  });

  it("recorta lo que se pide y rechaza textos enormes", async () => {
    const { deps, calls } = makeDeps();
    await handleTrial(TOKEN, { ...body, maxTokens: 20_000 }, deps);
    expect(calls[0]!.maxTokens).toBe(4_000);
    expect((await handleTrial(TOKEN, { ...body, user: "a".repeat(400_001) }, deps)).status).toBe(400);
  });

  it("si falla la clave de UniHub no lo cuenta como error del usuario", async () => {
    const { deps, added } = makeDeps({
      complete: async () => {
        throw new AiError("auth", "HTTP 401", 401);
      },
    });
    const r = await handleTrial(TOKEN, body, deps);
    expect(r).toMatchObject({ status: 503, body: { kind: "trial_off" } });
    expect(added).toHaveLength(0);
  });

  it("estado para Ajustes", async () => {
    expect((await trialStatus(TOKEN, makeDeps({ used: 0.12 }).deps)).body).toMatchObject({ enabled: true, used: 0.12, limit: 0.5 });
    expect((await trialStatus(TOKEN, makeDeps({ enabled: false }).deps)).body).toMatchObject({ enabled: false });
  });

  it("el programa manda la petición a la web con su sesión y entiende «prueba agotada»", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ kind: "quota" }), { status: 402 }));
    const cfg = { provider: "openai" as const, apiKey: "", model: TRIAL_MODEL, proxy: { url: "https://unihub.test", token: TOKEN } };
    await expect(complete(cfg, body, { fetchImpl })).rejects.toMatchObject({ kind: "quota" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://unihub.test/api/ai/trial");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const ok = vi.fn(async () => new Response(JSON.stringify({ text: "Hola", truncated: false, inputTokens: 5, outputTokens: 2 }), { status: 200 }));
    expect(await complete(cfg, body, { fetchImpl: ok })).toEqual({ text: "Hola", truncated: false, inputTokens: 5, outputTokens: 2 });
  });
});
