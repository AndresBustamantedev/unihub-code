/**
 * Prueba gratuita de IA: quien no tiene clave propia usa la de UniHub a través de la web, siempre
 * con el modelo más económico y con un límite de gasto al mes. La clave de UniHub nunca sale del
 * servidor de la web (no va dentro del programa).
 */

/** Modelo de la prueba (el más económico). */
export const TRIAL_MODEL = "gpt-6-luna";
/** Precio en $ por millón de tokens (entrada / salida) del modelo de la prueba. */
export const TRIAL_PRICE = { input: 0.1, output: 0.5 } as const;
/** Límite por usuario y mes si no se configura otro (TRIAL_MONTHLY_USD en Vercel). */
export const DEFAULT_TRIAL_LIMIT_USD = 0.5;
/**
 * Web de UniHub donde está el intermediario de la prueba. Se define al compilar con
 * NEXT_PUBLIC_UNIHUB_TRIAL_URL (o en tiempo de ejecución con UNIHUB_TRIAL_URL). Vacía = sin prueba.
 */
export const DEFAULT_TRIAL_URL = process.env.NEXT_PUBLIC_UNIHUB_TRIAL_URL ?? "";

/** Límites por petición (para que nadie mande documentos enormes con la clave de UniHub). */
export const TRIAL_MAX_INPUT_CHARS = 400_000;
export const TRIAL_MAX_OUTPUT_TOKENS = 4_000;

export const trialMonth = (d = new Date()) => d.toISOString().slice(0, 7);

export function trialCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * TRIAL_PRICE.input + outputTokens * TRIAL_PRICE.output) / 1_000_000;
}

/** Estimación antes de llamar (unos 3,5 caracteres por token en español). */
export function estimateTrialCost(chars: number, maxOutputTokens: number): number {
  return trialCost(Math.ceil(chars / 3.5), maxOutputTokens);
}

export function trialLimitUsd(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.TRIAL_MONTHLY_USD);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TRIAL_LIMIT_USD;
}

export function trialUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.UNIHUB_TRIAL_URL || DEFAULT_TRIAL_URL || "").replace(/\/+$/, "");
}

/** «0,12 $» */
export const formatUsd = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
