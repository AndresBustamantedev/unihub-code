/**
 * Elimina secretos de cualquier texto antes de registrarlo o devolverlo.
 * Cubre cabeceras Bearer, tokens de Canvas (formato `<id>~<cadena>`),
 * parámetros access_token en URLs y JWT.
 */
const PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/(Bearer\s+)[^\s"',]+/gi, "$1[REDACTED]"],
  [/([?&](?:access_token|token|code|refresh_token)=)[^&\s"']+/gi, "$1[REDACTED]"],
  [/\b\d{1,10}~[A-Za-z0-9]{20,}\b/g, "[REDACTED_CANVAS_TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]"],
];

export function redact(input: string, extraSecrets: ReadonlyArray<string | undefined> = []): string {
  let out = input;
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("[REDACTED]");
  }
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

type Level = "debug" | "info" | "warn" | "error";

/** Logger mínimo con redacción obligatoria. No registra cuerpos de respuesta. */
export const logger = {
  log(level: Level, message: string, meta?: Record<string, unknown>): void {
    const line = JSON.stringify({ level, message, ...(meta ?? {}), ts: new Date().toISOString() });
    const safe = redact(line, [process.env.CANVAS_ACCESS_TOKEN]);
    if (level === "error") console.error(safe);
    else if (level === "warn") console.warn(safe);
    else console.log(safe);
  },
  info: (m: string, meta?: Record<string, unknown>) => logger.log("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => logger.log("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => logger.log("error", m, meta),
};
