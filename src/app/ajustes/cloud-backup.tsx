"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exportToWebAction, setCloudDailyAction } from "@/features/desktop/cloud-actions";
import type { CloudExportState } from "@/features/desktop/cloud-export";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "nunca";
}

/** Programa de escritorio: subir los datos de este ordenador a la web. */
export function CloudBackup({ state }: { state: CloudExportState }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [daily, setDaily] = useState(state.daily);

  const upload = (force: boolean) =>
    start(async () => {
      setMsg(null);
      const r = await exportToWebAction(force);
      if (r.ok) setMsg({ ok: true, text: `Listo: ${r.uploaded} registros en la web${r.removed ? ` y ${r.removed} borrados que ya no estaban aquí` : ""}.` });
      else if (r.needsConfirm) {
        if (window.confirm(`${r.error}\n\n¿Subir de todos modos?`)) upload(true);
      } else setMsg({ ok: false, text: r.error });
    });

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        Guarda en la web tus clases, transcripciones, apuntes de IA, notas, enlaces y progreso, para no perder nada y poder usar UniHub en la web o en otro ordenador. La web queda igual que este ordenador (lo que borraste aquí también se borra allí). Los PDF y los vídeos no se suben: siguen en tu carpeta.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => upload(false)}>
          {pending ? "Subiendo…" : "Subir mis datos a la web"}
        </Button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={daily}
            disabled={pending}
            onChange={(e) => {
              const on = e.target.checked;
              setDaily(on);
              start(async () => void (await setCloudDailyAction(on)));
            }}
          />
          Subir automáticamente una vez al día
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Última subida: {when(state.lastAt)}
        {state.lastResult && <span className={state.lastOk === false ? "text-urgent" : ""}> · {state.lastResult}</span>}
      </p>
      {msg && (
        <p role="status" className={`rounded-md px-2.5 py-1.5 text-xs ${msg.ok ? "bg-muted" : "bg-urgent/10 text-urgent"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
