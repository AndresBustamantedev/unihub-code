"use client";

import type { CanvasTokenStatus } from "@/features/canvas-token/status";

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

/** Aviso de token de Canvas a punto de caducar o caducado, con el arreglo a un clic. */
export function CanvasTokenBanner({ status, desktop }: { status: CanvasTokenStatus; desktop: boolean }) {
  const expired = status.state === "expired";
  const bridge = typeof window !== "undefined" ? window.unihubDesktop : undefined;
  const tone = expired
    ? "border-red-500/40 bg-red-50 text-red-950 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-100"
    : "border-amber-500/40 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-100";
  const button = "inline-flex h-8 items-center rounded-md border border-current/25 bg-white/70 px-3 text-xs font-medium hover:bg-white dark:bg-white/10 dark:hover:bg-white/20";

  return (
    <section className={`rounded-xl border p-3 text-sm ${tone}`} role="alert">
      <p className="font-semibold">
        {expired
          ? "Tu token de Canvas ha caducado"
          : `Tu token de Canvas caduca ${status.daysLeft === 1 ? "mañana" : `en ${status.daysLeft} días`}`}
      </p>
      <p className="mt-1 opacity-85">
        {expired
          ? "UniHub ya no recibe tareas, anuncios ni material nuevos. Todo lo que ya tienes sigue aquí. Crea un token nuevo en Canvas y pégalo para seguir sincronizando."
          : `Caduca el ${status.expiresAt ? day(status.expiresAt) : "pronto"}. Canvas solo deja crearlos para 30 días: crea uno nuevo y pégalo antes para no dejar de sincronizar.`}
      </p>
      {desktop && bridge ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {status.settingsUrl && (
            <a href={status.settingsUrl} target="_blank" rel="noreferrer" className={button}>
              1. Crear token en Canvas
            </a>
          )}
          <button type="button" className={button} onClick={() => void bridge.openSetup("token")}>
            2. Pegar el token nuevo
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-xs opacity-85">
          En la web: crea el token en{" "}
          {status.settingsUrl ? (
            <a href={status.settingsUrl} target="_blank" rel="noreferrer" className="underline">
              Canvas → Configuración
            </a>
          ) : (
            "Canvas → Configuración"
          )}
          , cámbialo en Vercel (Settings → Environment Variables → <code>CANVAS_ACCESS_TOKEN</code>) y vuelve a desplegar. Si usas el programa de Windows, pégalo también allí.
        </p>
      )}
    </section>
  );
}
