import "server-only";
import { isLocalOnly } from "@/lib/local-only";
import { cookies } from "next/headers";
import { AI_MODEL_COOKIE, AI_PREF_COOKIE, readAiConfig, type AiConfig } from "./provider";
import { TRIAL_MODEL, trialUrl } from "./trial";

export type ResolvedAi = { ok: true; config: AiConfig; trial: boolean } | { ok: false; reason: string };

/**
 * Proveedor y modelo elegidos en Ajustes (cookies), validados contra lo configurado en el servidor.
 * Sin clave propia (en el programa o en la web), se usa la prueba gratuita de UniHub (modelo
 * económico y límite mensual, a través de la web), si un administrador la activó para la cuenta.
 */
export async function readAiConfigFromCookies(providerOverride?: string | null, modelOverride?: string | null): Promise<ResolvedAi> {
  const store = await cookies();
  const own = readAiConfig(process.env, providerOverride ?? store.get(AI_PREF_COOKIE)?.value ?? null, modelOverride ?? store.get(AI_MODEL_COOKIE)?.value ?? null);
  if (own.ok) return { ...own, trial: false };
  // Sin cuenta (programa sin Supabase) no hay prueba gratuita: hace falta clave propia.
  if (process.env.UNIHUB_TRIAL === "0" || !trialUrl() || isLocalOnly()) return own;
  const token = await sessionToken();
  if (!token) return { ok: false, reason: "Inicia sesión para usar la prueba gratuita de IA." };
  return { ok: true, trial: true, config: { provider: "openai", apiKey: "", model: TRIAL_MODEL, proxy: { url: trialUrl(), token } } };
}

/** Token de la sesión de Supabase del usuario (para identificarse ante la web de UniHub). */
async function sessionToken(): Promise<string | null> {
  try {
    const { createRemoteSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await createRemoteSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export interface TrialStatus {
  enabled: boolean;
  used: number;
  limit: number;
}

/** Sin clave propia: estado de la prueba gratuita (lo pregunta a la web de UniHub). */
export async function getTrialStatus(): Promise<TrialStatus | null> {
  if (!trialUrl() || isLocalOnly()) return { enabled: false, used: 0, limit: 0 };
  const token = await sessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${trialUrl()}/api/ai/trial`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return res.status === 503 ? { enabled: false, used: 0, limit: 0 } : null;
    const j = (await res.json()) as Partial<TrialStatus>;
    return { enabled: !!j.enabled, used: Number(j.used ?? 0), limit: Number(j.limit ?? 0) };
  } catch {
    return null;
  }
}
