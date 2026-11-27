import "server-only";
import { timingSafeEqual } from "node:crypto";

/** ¿Se está ejecutando dentro del programa de escritorio (servidor local de Electron)? */
export function isDesktop(): boolean {
  return process.env.UNIHUB_DESKTOP === "1";
}

/**
 * Las rutas /api/desktop/* solo responden al proceso principal del programa: además de la
 * sesión del usuario exigen el secreto aleatorio que Electron genera en cada arranque.
 */
export function desktopAuthorized(header: string | null): boolean {
  const secret = process.env.DESKTOP_SECRET;
  if (!isDesktop() || !secret || secret.length < 32 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
