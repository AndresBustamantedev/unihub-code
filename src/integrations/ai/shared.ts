/** Seguro para el navegador: solo nombres, nunca claves. */
export type AiProviderName = "openai" | "google";
export const AI_PREF_COOKIE = "unihub-ai";
/** Modelo elegido en Ajustes (solo de la lista de abajo). */
export const AI_MODEL_COOKIE = "unihub-ai-model";
export const AI_LABEL: Record<AiProviderName, string> = { openai: "OpenAI", google: "Gemini" };

export interface PublicProvider {
  provider: AiProviderName;
  ok: boolean;
  model: string | null;
}

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
}

/** Modelos que se pueden elegir desde Ajustes, por proveedor (el del .env también se ofrece). */
export const MODEL_OPTIONS: Record<AiProviderName, ModelOption[]> = {
  openai: [
    { id: "gpt-6.1-sol", label: "Sol", hint: "Mejor calidad · ~2 $ / 10 $ por millón de tokens (entrada / salida)" },
    { id: "gpt-6-luna", label: "Luna", hint: "Económico · ~0,10 $ / 0,50 $ por millón de tokens" },
  ],
  google: [],
};

/** Opciones de un proveedor: las conocidas + la del .env si es otra. */
export function modelOptionsFor(provider: AiProviderName, envModel: string | null): ModelOption[] {
  const known = MODEL_OPTIONS[provider];
  if (envModel && !known.some((m) => m.id === envModel)) return [...known, { id: envModel, label: envModel, hint: "Definido en .env.local" }];
  return known;
}

export function isAllowedModel(provider: AiProviderName, model: string | null | undefined, envModel: string | null): model is string {
  return !!model && modelOptionsFor(provider, envModel).some((m) => m.id === model);
}

function readCookie(name: string, pattern: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=(${pattern})`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function readAiPrefCookie(): string | null {
  return readCookie(AI_PREF_COOKIE, "[a-z]+");
}

export function readAiModelCookie(): string | null {
  return readCookie(AI_MODEL_COOKIE, "[A-Za-z0-9._-]+");
}

export function writeAiPrefs(provider: AiProviderName, model: string) {
  const opts = "; path=/; max-age=31536000; samesite=lax";
  document.cookie = `${AI_PREF_COOKIE}=${provider}${opts}`;
  document.cookie = `${AI_MODEL_COOKIE}=${encodeURIComponent(model)}${opts}`;
}
