import { z } from "zod";

const baseUrlSchema = z
  .url({ protocol: /^https$/, error: "CANVAS_BASE_URL debe ser una URL https" })
  .transform((u) => u.replace(/\/+$/, ""))
  .refine((u) => u.endsWith("/api/v1"), "CANVAS_BASE_URL debe terminar en /api/v1");

export type CanvasEnv = { CANVAS_BASE_URL?: string; CANVAS_ACCESS_TOKEN?: string; [key: string]: string | undefined };

export type CanvasConfigResult =
  | { ok: true; baseUrl: string; token: string }
  | { ok: false; baseUrl: string | null; missing: string[]; invalid: string[] };

/**
 * Lee la configuración de Canvas sin lanzar: el diagnóstico necesita poder
 * explicar qué falta en lugar de romperse.
 */
export function readCanvasConfig(env: CanvasEnv = process.env): CanvasConfigResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  const rawBase = env.CANVAS_BASE_URL?.trim();
  let baseUrl: string | null = null;
  if (!rawBase) missing.push("CANVAS_BASE_URL");
  else {
    const parsed = baseUrlSchema.safeParse(rawBase);
    if (parsed.success) baseUrl = parsed.data;
    else invalid.push(...parsed.error.issues.map((i) => i.message));
  }

  const token = env.CANVAS_ACCESS_TOKEN?.trim() ?? "";
  if (!token) missing.push("CANVAS_ACCESS_TOKEN");
  else if (/\s/.test(token) || token.toLowerCase().startsWith("bearer")) {
    invalid.push("CANVAS_ACCESS_TOKEN no debe incluir espacios ni el prefijo 'Bearer'");
  }

  if (baseUrl && missing.length === 0 && invalid.length === 0) return { ok: true, baseUrl, token };
  return { ok: false, baseUrl, missing, invalid };
}
