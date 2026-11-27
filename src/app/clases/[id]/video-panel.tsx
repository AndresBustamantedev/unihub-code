"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Film, FolderOpen, X } from "lucide-react";
import { classFolderAction, clearLocalVideoAction, setLocalVideoAction } from "@/features/desktop/video-actions";
import type {} from "@/lib/desktop-bridge";

/**
 * Programa de escritorio: vídeo de la clase guardado en la carpeta de UniHub, con reproductor.
 * El vídeo se copia desde donde lo descargaste de Teams/Stream; el original no se toca.
 */
export function VideoPanel({ sessionId, localVideo }: { sessionId: string; localVideo: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const add = () =>
    start(async () => {
      setMsg(null);
      const bridge = window.unihubDesktop;
      if (!bridge) return setMsg("Abre UniHub desde el programa de escritorio.");
      const folder = await classFolderAction(sessionId);
      if (!folder.ok || !folder.rel) return setMsg("No se pudo preparar la carpeta de la clase.");
      setMsg("Copiando el vídeo a tu carpeta… (puede tardar si es grande)");
      const r = await bridge.importVideo(folder.rel);
      if (r.cancelled) return setMsg(null);
      if (!r.ok || !r.rel) return setMsg(r.error ?? "No se pudo copiar el vídeo.");
      const saved = await setLocalVideoAction(sessionId, r.rel);
      setMsg(saved.ok ? null : (saved.error ?? "No se pudo guardar."));
      router.refresh();
    });

  if (!localVideo) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-card p-3">
        <div className="text-sm">
          <p className="font-medium">Vídeo de la clase</p>
          <p className="text-xs text-muted-foreground">Descárgalo de Stream y añádelo: se guarda en la carpeta de la clase y lo ves aquí, sin conexión.</p>
        </div>
        <button type="button" onClick={add} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-60">
          <Film className="size-3.5" /> {busy ? "Copiando…" : "Añadir el vídeo de la clase"}
        </button>
        {msg && <p role="status" className="w-full text-xs text-muted-foreground">{msg}</p>}
      </section>
    );
  }

  const src = `/api/local-file?ruta=${encodeURIComponent(localVideo)}`;
  return (
    <section className="flex flex-col gap-2">
      <video src={src} controls preload="metadata" className="max-h-[70dvh] w-full rounded-lg bg-black" />
      <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
        <button type="button" onClick={() => void window.unihubDesktop?.showInFolder(localVideo)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 hover:bg-muted">
          <FolderOpen className="size-3.5" /> Mostrar en la carpeta
        </button>
        <button
          type="button"
          onClick={() =>
            start(async () => {
              await clearLocalVideoAction(sessionId);
              router.refresh();
            })
          }
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="El archivo sigue en tu carpeta"
        >
          <X className="size-3.5" /> Quitar de la clase
        </button>
      </div>
    </section>
  );
}
