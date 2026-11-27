/**
 * Límite de intentos fallidos por correo (en memoria de la instancia).
 * Supabase Auth aplica además sus propios límites por IP; esto frena ataques de diccionario simples.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

export function isLocked(key: string, now = Date.now()): boolean {
  const recent = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(key, recent);
  return recent.length >= MAX_FAILS;
}

export function recordFail(key: string, now = Date.now()): void {
  fails.set(key, [...(fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS), now]);
}

export function clearFails(key: string): void {
  fails.delete(key);
}
