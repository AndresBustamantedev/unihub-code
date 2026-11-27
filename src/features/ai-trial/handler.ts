import { z } from "zod";
import { AiError, type AiConfig, type CompletionRequest, type CompletionResult } from "@/integrations/ai/provider";
import { estimateTrialCost, TRIAL_MAX_INPUT_CHARS, TRIAL_MAX_OUTPUT_TOKENS, TRIAL_MODEL, trialCost, trialLimitUsd, trialMonth } from "@/integrations/ai/trial";

/**
 * Intermediario de la prueba gratuita (corre en la web): comprueba quién pide, que no haya pasado
 * su límite del mes, llama a OpenAI con la clave de UniHub (siempre el modelo económico) y apunta
 * el gasto. Separado de la ruta para poder probarlo sin red.
 */

export interface TrialDeps {
  env: Record<string, string | undefined>;
  verifyUser(token: string): Promise<{ id: string } | null>;
  /** Si un administrador le activó la prueba, su límite propio (null = el general) y lo gastado este mes. */
  access(uid: string, month: string): Promise<{ enabled: boolean; limitUsd: number | null; used: number }>;
  addUsage(uid: string, month: string, tokensIn: number, tokensOut: number, cost: number): Promise<void>;
  complete(cfg: AiConfig, req: CompletionRequest): Promise<CompletionResult>;
}

export interface TrialResponse {
  status: number;
  body: Record<string, unknown>;
}

const bodySchema = z.object({
  system: z.string().max(20_000),
  user: z.string().min(1).max(TRIAL_MAX_INPUT_CHARS),
  maxTokens: z.number().int().min(1).max(20_000),
});

function trialKey(env: TrialDeps["env"]): string | null {
  return env.TRIAL_OPENAI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || null;
}

export async function trialStatus(token: string | null, deps: TrialDeps): Promise<TrialResponse> {
  const enabled = deps.env.UNIHUB_TRIAL_ENABLED === "1" && !!trialKey(deps.env);
  if (!token) return { status: 401, body: { error: "Falta la sesión." } };
  const user = await deps.verifyUser(token);
  if (!user) return { status: 401, body: { error: "Sesión no válida." } };
  const a = await deps.access(user.id, trialMonth());
  return { status: 200, body: { enabled: enabled && a.enabled, used: a.used, limit: a.limitUsd ?? trialLimitUsd(deps.env), model: TRIAL_MODEL } };
}

export async function handleTrial(token: string | null, raw: unknown, deps: TrialDeps): Promise<TrialResponse> {
  const key = trialKey(deps.env);
  if (deps.env.UNIHUB_TRIAL_ENABLED !== "1" || !key) return { status: 503, body: { error: "La prueba gratuita no está activada.", kind: "trial_off" } };
  if (!token) return { status: 401, body: { error: "Falta la sesión." } };
  const user = await deps.verifyUser(token);
  if (!user) return { status: 401, body: { error: "Sesión no válida." } };

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: "Petición no válida (¿texto demasiado largo?).", kind: "bad_request" } };
  const req = { ...parsed.data, maxTokens: Math.min(parsed.data.maxTokens, TRIAL_MAX_OUTPUT_TOKENS) };

  const month = trialMonth();
  const a = await deps.access(user.id, month);
  if (!a.enabled) return { status: 503, body: { error: "La prueba gratuita no está activada para tu cuenta.", kind: "trial_off" } };
  const limit = a.limitUsd ?? trialLimitUsd(deps.env);
  const used = a.used;
  // Se comprueba con lo que podría costar esta petición, para no pasarse del límite.
  if (used + estimateTrialCost(req.system.length + req.user.length, req.maxTokens) > limit) {
    return { status: 402, body: { error: "Prueba agotada este mes.", kind: "quota", used, limit } };
  }

  try {
    const r = await deps.complete({ provider: "openai", apiKey: key, model: TRIAL_MODEL }, req);
    const tokensIn = r.inputTokens ?? Math.ceil((req.system.length + req.user.length) / 3.5);
    const tokensOut = r.outputTokens ?? Math.ceil(r.text.length / 3.5);
    const cost = trialCost(tokensIn, tokensOut);
    await deps.addUsage(user.id, month, tokensIn, tokensOut, cost);
    return { status: 200, body: { text: r.text, truncated: r.truncated, inputTokens: tokensIn, outputTokens: tokensOut, used: used + cost, limit } };
  } catch (err) {
    if (err instanceof AiError) {
      // La clave de UniHub nunca se menciona: un fallo de clave es «servicio no disponible».
      const kind = err.kind === "auth" ? "trial_off" : err.kind;
      return { status: kind === "trial_off" ? 503 : 502, body: { error: "La IA no respondió.", kind } };
    }
    return { status: 500, body: { error: "Error interno.", kind: "server" } };
  }
}
