/**
 * Cliente mínimo para OpenAI y Google (solo texto), sin SDKs.
 * Las claves solo viven en el servidor y nunca aparecen en URLs, logs ni errores.
 */
import type { AiProviderName } from "./shared";
export type { AiProviderName } from "./shared";
import { isAllowedModel } from "./shared";
export { AI_LABEL, AI_MODEL_COOKIE, AI_PREF_COOKIE } from "./shared";

export interface AiConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  /**
   * Prueba gratuita: la petición va a la web de UniHub (que usa su propia clave, con límite
   * mensual) identificándose con la sesión del usuario. `apiKey` va vacía.
   */
  proxy?: { url: string; token: string };
}

export type AiErrorKind = "auth" | "rate_limited" | "bad_request" | "server" | "network" | "timeout" | "empty" | "quota" | "trial_off";

export class AiError extends Error {
  override readonly name = "AiError";
  constructor(readonly kind: AiErrorKind, message: string, readonly status?: number) {
    super(message);
  }
}

export function describeAiError(e: AiError): string {
  switch (e.kind) {
    case "auth":
      return "El proveedor de IA rechazó la clave (revisa OPENAI_API_KEY o la clave del programa).";
    case "rate_limited":
      return "Límite de uso del proveedor de IA alcanzado o sin saldo. Prueba más tarde.";
    case "bad_request":
      return "El proveedor rechazó la petición (¿modelo AI_MODEL correcto?).";
    case "server":
      return "El proveedor de IA tuvo un error interno. Reintenta.";
    case "timeout":
      return "La IA tardó demasiado en responder.";
    case "network":
      return "No se pudo contactar con el proveedor de IA.";
    case "empty":
      return "La IA devolvió una respuesta vacía.";
    case "quota":
      return "Has agotado la prueba gratuita de IA de este mes. Pon tu propia clave de OpenAI en Ajustes → Cambiar claves para seguir (o espera al mes que viene).";
    case "trial_off":
      return "La prueba gratuita de IA no está activada para tu cuenta (la activa el administrador de UniHub). Mientras, puedes poner tu propia clave de OpenAI en Ajustes → Cambiar claves.";
  }
}

const DEFAULT_MODEL: Record<AiProviderName, string | undefined> = {
  openai: "gpt-6.1-sol",
  google: undefined,
};
export const AI_PROVIDERS: AiProviderName[] = ["openai", "google"];

type Env = Record<string, string | undefined>;
const ENV_KEYS: Record<AiProviderName, { key: string; model: string }> = {
  openai: { key: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  google: { key: "GOOGLE_API_KEY", model: "GOOGLE_MODEL" },
};

export interface ProviderStatus {
  provider: AiProviderName;
  ok: boolean;
  model: string | null;
  reason: string | null;
}

function legacy(env: Env): AiConfig | null {
  // Compatibilidad con AI_PROVIDER / AI_API_KEY / AI_MODEL de la FASE 7.
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  const provider = (env.AI_PROVIDER?.trim().toLowerCase() || "openai") as AiProviderName;
  if (!AI_PROVIDERS.includes(provider)) return null;
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL[provider];
  return model ? { provider, apiKey, model } : null;
}

/** Estado de cada proveedor (sin exponer claves). */
export function listAiProviders(env: Env = process.env): ProviderStatus[] {
  const old = legacy(env);
  return AI_PROVIDERS.map((provider) => {
    const k = ENV_KEYS[provider];
    const apiKey = env[k.key]?.trim() || (old?.provider === provider ? old.apiKey : "");
    const model = env[k.model]?.trim() || (old?.provider === provider ? old.model : "") || DEFAULT_MODEL[provider] || null;
    if (!apiKey) return { provider, ok: false, model, reason: `Falta ${k.key}` };
    if (!model) return { provider, ok: false, model: null, reason: `Falta ${k.model}` };
    return { provider, ok: true, model, reason: null };
  });
}

function configFor(provider: AiProviderName, env: Env): AiConfig | null {
  const st = listAiProviders(env).find((p) => p.provider === provider);
  if (!st?.ok || !st.model) return null;
  const old = legacy(env);
  const apiKey = env[ENV_KEYS[provider].key]?.trim() || (old?.provider === provider ? old.apiKey : "");
  return apiKey ? { provider, apiKey, model: st.model } : null;
}

/**
 * Elige proveedor: el pedido (si está configurado) → AI_DEFAULT_PROVIDER → el primero disponible.
 */
export function readAiConfig(
  env: Env = process.env,
  preferred?: string | null,
  /** Modelo elegido en Ajustes; solo se usa si es de la lista permitida para ese proveedor. */
  preferredModel?: string | null,
): { ok: true; config: AiConfig } | { ok: false; reason: string } {
  const order = [preferred, env.AI_DEFAULT_PROVIDER?.trim().toLowerCase(), env.AI_PROVIDER?.trim().toLowerCase(), ...AI_PROVIDERS].filter(
    (p): p is AiProviderName => !!p && (AI_PROVIDERS as string[]).includes(p),
  );
  for (const p of order) {
    const cfg = configFor(p, env);
    if (cfg) {
      const model = isAllowedModel(p, preferredModel, cfg.model) ? preferredModel : cfg.model;
      return { ok: true, config: { ...cfg, model } };
    }
  }
  return { ok: false, reason: "Añade OPENAI_API_KEY en .env.local (o tu clave en el programa)." };
}

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface CompletionResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  truncated: boolean;
}

function classify(status: number): AiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status === 402 || status === 529) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

/** Prueba gratuita: la web de UniHub hace la llamada con su clave y apunta el gasto. */
async function completeViaTrial(cfg: AiConfig, req: CompletionRequest, doFetch: typeof fetch, timeoutMs: number): Promise<CompletionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await doFetch(`${cfg.proxy!.url}/api/ai/trial`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.proxy!.token}`, "content-type": "application/json" },
      body: JSON.stringify({ system: req.system, user: req.user, maxTokens: req.maxTokens }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new AiError(err instanceof Error && err.name === "AbortError" ? "timeout" : "network", "Fallo de red con la web de UniHub");
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as { text?: string; truncated?: boolean; inputTokens?: number; outputTokens?: number; kind?: AiErrorKind } | null;
  if (!res.ok) {
    if (res.status === 402) throw new AiError("quota", "Prueba agotada", 402);
    if (res.status === 503) throw new AiError("trial_off", "Prueba desactivada", 503);
    if (res.status === 401) throw new AiError("auth", "Sesión no válida", 401);
    const kind = json?.kind && json.kind !== "auth" ? json.kind : classify(res.status);
    throw new AiError(kind, `HTTP ${res.status}`, res.status);
  }
  const text = (json?.text ?? "").trim();
  if (!text) throw new AiError("empty", "Sin texto");
  return { text, inputTokens: json?.inputTokens ?? null, outputTokens: json?.outputTokens ?? null, truncated: !!json?.truncated };
}

export async function complete(cfg: AiConfig, req: CompletionRequest, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<CompletionResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  if (cfg.proxy) return completeViaTrial(cfg, req, doFetch, opts.timeoutMs ?? 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 55_000);

  let url: string;
  let headers: Record<string, string>;
  let body: unknown;
  switch (cfg.provider) {
    case "openai":
      url = "https://api.openai.com/v1/chat/completions";
      headers = { Authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" };
      body = { model: cfg.model, max_completion_tokens: req.maxTokens * 3, messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }] };
      break;
    case "google":
      // Clave en cabecera, nunca en la URL.
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
      headers = { "x-goog-api-key": cfg.apiKey, "content-type": "application/json" };
      body = { systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: "user", parts: [{ text: req.user }] }], generationConfig: { maxOutputTokens: req.maxTokens } };
      break;
  }

  let res: Response;
  try {
    res = await doFetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal, cache: "no-store" });
  } catch (err) {
    throw new AiError(err instanceof Error && err.name === "AbortError" ? "timeout" : "network", "Fallo de red con el proveedor de IA");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new AiError(classify(res.status), `HTTP ${res.status}`, res.status);
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json) throw new AiError("empty", "Respuesta no JSON");

  let text = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let truncated = false;
  if (cfg.provider === "openai") {
    const choice = (json.choices as { message?: { content?: string }; finish_reason?: string }[] | undefined)?.[0];
    text = choice?.message?.content ?? "";
    const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    inputTokens = usage?.prompt_tokens ?? null;
    outputTokens = usage?.completion_tokens ?? null;
    truncated = choice?.finish_reason === "length";
  } else {
    const cand = (json.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined)?.[0];
    text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const usage = json.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    inputTokens = usage?.promptTokenCount ?? null;
    outputTokens = usage?.candidatesTokenCount ?? null;
    truncated = cand?.finishReason === "MAX_TOKENS";
  }
  text = text.trim();
  if (!text) throw new AiError("empty", "Sin texto");
  return { text, inputTokens, outputTokens, truncated };
}
