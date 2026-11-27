/**
 * Modo «solo local»: programa de escritorio compilado SIN las variables de Supabase, o abierto
 * en modo demo. No hay inicio de sesión: un único usuario local y todos los datos en este ordenador.
 * Sin dependencias de servidor: lo usa también el proxy.
 */

/** Usuario fijo del modo solo local (su base de datos vive en la carpeta de datos del programa). */
export const LOCAL_USER = {
  id: "00000000-0000-4000-8000-00000000a11c",
  email: "local@unihub.app",
} as const;

/** Usuario de la demo: base de datos aparte, para que los datos de ejemplo nunca se mezclen con los reales. */
export const DEMO_USER = {
  id: "00000000-0000-4000-8000-00000000de30",
  email: "demo@unihub.app",
} as const;

/** Programa abierto con «Probar con datos de ejemplo». */
export function isDemo(): boolean {
  return process.env.UNIHUB_DESKTOP === "1" && process.env.UNIHUB_DEMO === "1";
}

export function isLocalOnly(): boolean {
  // Acceso directo: Next incrusta las NEXT_PUBLIC_* al compilar. UNIHUB_DESKTOP la pone Electron al arrancar.
  return isDemo() || (process.env.UNIHUB_DESKTOP === "1" && !process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** El usuario sin sesión de este modo: el de la demo o el local. */
export function localUser(): { id: string; email: string } {
  return isDemo() ? DEMO_USER : LOCAL_USER;
}
