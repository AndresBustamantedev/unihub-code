"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/lib/desktop-bridge";

function describe(s: UpdateStatus): string {
  switch (s.state) {
    case "dev":
      return "Las actualizaciones automáticas funcionan en el programa instalado (no con npm run dev).";
    case "off":
      return "Esta compilación no tiene actualizaciones automáticas. Para actualizar, instala una versión nueva encima.";
    case "checking":
      return "Buscando actualizaciones…";
    case "downloading":
      return `Descargando UniHub ${s.version ?? ""}… ${s.percent ? `${s.percent} %` : ""}`;
    case "ready":
      return `UniHub ${s.version} está descargada y lista. Se instalará al cerrar el programa, o ahora con el botón.`;
    case "none":
      return "Tienes la última versión.";
    case "error":
      return s.error ?? "No se pudo comprobar si hay actualizaciones.";
    default:
      return "UniHub busca actualizaciones al abrirse y cada pocas horas.";
  }
}

/** Ajustes → Actualizaciones (programa de escritorio). */
export function UpdatesPanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = window.unihubDesktop;
    if (!bridge?.getUpdate) return;
    let alive = true;
    const load = () => void bridge.getUpdate().then((s) => alive && s && setStatus(s));
    load();
    // Mientras descarga, se refresca el progreso.
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!status) return null;
  const bridge = window.unihubDesktop!;

  return (
    <div id="actualizaciones" className="flex flex-col gap-2 text-sm">
      <p>
        Versión instalada: <strong>{status.current}</strong>
      </p>
      <p className={status.state === "error" ? "text-urgent" : "text-muted-foreground"}>{describe(status)}</p>
      {status.state === "ready" && status.notes && (
        <div className="rounded-md bg-muted px-2.5 py-2">
          <p className="mb-1 text-xs font-semibold">Novedades de la {status.version}</p>
          <p className="whitespace-pre-line text-xs text-muted-foreground">{status.notes}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status.state === "ready" ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void bridge.installUpdate().then((ok) => !ok && setBusy(false));
            }}
          >
            {busy ? "Guardando y reiniciando…" : "Reiniciar y actualizar"}
          </Button>
        ) : (
          status.state !== "dev" && status.state !== "off" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || status.state === "checking" || status.state === "downloading"}
              onClick={() => {
                setBusy(true);
                void bridge
                  .checkUpdates()
                  .then((s) => s && setStatus(s))
                  .finally(() => setBusy(false));
              }}
            >
              Buscar actualizaciones
            </Button>
          )
        )}
      </div>
    </div>
  );
}
