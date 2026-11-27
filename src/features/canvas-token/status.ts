import "server-only";
import { createHash } from "node:crypto";
import { CanvasApiError, CanvasClient, readCanvasConfig } from "@/integrations/canvas";

/** Días antes de la caducidad en los que se empieza a avisar. */
export const WARN_DAYS = 5;
const DAY = 86_400_000;

export type CanvasTokenState = "ok" | "expiring" | "expired" | "missing";
export interface CanvasTokenStatus {
  state: CanvasTokenState;
  /** Fecha de caducidad que da Canvas (null si no la da o no hay token). */
  expiresAt: string | null;
  daysLeft: number | null;
  /** Página de Canvas donde se crean los tokens. */
  settingsUrl: string | null;
}

interface Token {
  token_hint?: string | null;
  expires_at?: string | null;
  last_used_at?: string | null;
}

/**
 * De los tokens creados a mano por el usuario, el que estamos usando: Canvas solo muestra el
 * principio del token («token_hint»). Si coinciden varios, el usado más recientemente.
 */
export function pickCurrentToken(tokens: Token[], token: string): Token | null {
  const matches = tokens.filter((t) => t.token_hint && t.token_hint.length >= 4 && token.startsWith(t.token_hint));
  // El indicio más largo es el más concreto; si empatan, el último usado (esta misma consulta lo usa).
  matches.sort((a, b) => (b.token_hint?.length ?? 0) - (a.token_hint?.length ?? 0) || (b.last_used_at ?? "").localeCompare(a.last_used_at ?? ""));
  return matches[0] ?? null;
}

export function classify(expiresAt: string | null, now = Date.now()): Pick<CanvasTokenStatus, "state" | "daysLeft"> {
  if (!expiresAt) return { state: "ok", daysLeft: null };
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return { state: "ok", daysLeft: null };
  if (ms <= 0) return { state: "expired", daysLeft: 0 };
  const daysLeft = Math.ceil(ms / DAY);
  return { state: daysLeft <= WARN_DAYS ? "expiring" : "ok", daysLeft };
}

let cache: { key: string; at: number; value: CanvasTokenStatus } | null = null;

/**
 * Estado del token de Canvas. Se pregunta a Canvas como mucho cada 6 horas (cada 10 minutos si
 * ha caducado, para notar enseguida el token nuevo). Devuelve null si no se pudo comprobar (sin
 * conexión): en ese caso no se avisa de nada. El token nunca sale del servidor.
 */
export async function getCanvasTokenStatus(opts: { fresh?: boolean; client?: CanvasClient } = {}): Promise<CanvasTokenStatus | null> {
  const config = readCanvasConfig();
  if (!config.ok) return { state: "missing", expiresAt: null, daysLeft: null, settingsUrl: null };
  const settingsUrl = `${new URL(config.baseUrl).origin}/profile/settings`;
  const key = createHash("sha256").update(config.token).digest("hex");
  if (!opts.fresh && cache && cache.key === key) {
    const ttl = cache.value.state === "expired" ? 10 * 60_000 : 6 * 3_600_000;
    if (Date.now() - cache.at < ttl) return { ...cache.value, ...classify(cache.value.expiresAt) };
  }

  const client = opts.client ?? new CanvasClient({ baseUrl: config.baseUrl, token: config.token, maxRetries: 1 });
  let expiresAt: string | null = null;
  try {
    const tokens = await client.getAll<Token>("users/self/user_generated_tokens", undefined, 3);
    expiresAt = pickCurrentToken(tokens, config.token)?.expires_at ?? null;
  } catch (err) {
    if (err instanceof CanvasApiError && err.kind === "unauthorized") return remember(key, { state: "expired", expiresAt: null, daysLeft: 0, settingsUrl });
    // Algunas universidades no dejan ver la lista de tokens: se comprueba al menos que funciona.
    try {
      await client.get("users/self");
    } catch (inner) {
      if (inner instanceof CanvasApiError && inner.kind === "unauthorized") return remember(key, { state: "expired", expiresAt: null, daysLeft: 0, settingsUrl });
      return null;
    }
  }
  return remember(key, { expiresAt, settingsUrl, ...classify(expiresAt) });
}

function remember(key: string, value: CanvasTokenStatus): CanvasTokenStatus {
  cache = { key, at: Date.now(), value };
  return value;
}

/** Para los tests. */
export function resetCanvasTokenCache(): void {
  cache = null;
}
