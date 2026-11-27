"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { importFromWebAction } from "@/features/desktop/import-actions";
import { refreshFolderAction } from "@/features/desktop/folder-actions";
import type { DesktopInfo, SuggestedFolder } from "@/lib/desktop-bridge";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "nunca";
}

/** Ajustes propios del programa de escritorio: carpeta (Drive/OneDrive), claves, sincronización e importación. */
export function DesktopSettings() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [suggested, setSuggested] = useState<SuggestedFolder[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const bridge = typeof window !== "undefined" ? window.unihubDesktop : undefined;

  useEffect(() => {
    void window.unihubDesktop?.getInfo().then(setInfo);
    void window.unihubDesktop?.suggestedFolders().then(setSuggested);
  }, []);

  if (!bridge) return <p className="text-sm text-muted-foreground">Abre UniHub desde el programa de escritorio para ver estos ajustes.</p>;

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg(await fn());
    } finally {
      setBusy(null);
      setInfo(await bridge.getInfo());
    }
  };

  const changeFolder = (target?: string) =>
    run("folder", async () => {
      if (target && !window.confirm(`¿Mover la carpeta de UniHub a «${target}»? Se moverán todos tus archivos (puede tardar si hay vídeos).`)) return null;
      const r = await bridge.chooseFilesDir(target);
      if (r.cancelled) return null;
      return r.ok ? `Carpeta de UniHub: ${r.filesDir}` : (r.error ?? "No se pudo cambiar la carpeta.");
    });

  const inCloud = !!info && suggested.some((s) => info.filesDir.toLowerCase().startsWith(s.path.toLowerCase()));

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* Carpeta */}
      <div className="flex flex-col gap-2">
        <p className="font-medium">Carpeta de UniHub</p>
        <p className="text-xs text-muted-foreground">
          Aquí se guarda todo, ordenado por asignatura: el material de Canvas, cada clase con su transcripción, apuntes de IA, enlaces y vídeo, tus notas y una copia de seguridad diaria.
        </p>
        <code className="break-all rounded-md bg-muted px-2 py-1 text-xs">{info?.filesDir ?? "…"}</code>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void bridge.openFilesDir()}>
            Abrir carpeta
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void changeFolder()}>
            {busy === "folder" ? "Moviendo…" : "Cambiar carpeta…"}
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void run("refresh", async () => (await refreshFolderAction()).message)}>
            {busy === "refresh" ? "Poniendo al día…" : "Poner al día la carpeta"}
          </Button>
        </div>
        {inCloud ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">✓ La carpeta está dentro de tu nube: se sube sola.</p>
        ) : suggested.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/40 p-2.5">
            <p className="text-xs">Para tenerlo todo también en la nube, guarda la carpeta dentro de:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggested.map((s) => (
                <Button key={s.path} size="sm" variant="outline" disabled={!!busy} onClick={() => void changeFolder(s.path)}>
                  {s.label} <span className="text-muted-foreground">({s.path})</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            ¿Quieres que se suba a Google Drive? Instala <strong>Google Drive para escritorio</strong> (aparece como una unidad, normalmente G:) y vuelve aquí: te propondré
            usarla. Con OneDrive funciona igual.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Última copia de seguridad: {when(info?.lastBackup ?? null)} ·{" "}
          <button type="button" className="underline-offset-2 hover:underline" disabled={!!busy} onClick={() => void run("backup", async () => (await bridge.backupNow()).message)}>
            hacer una ahora
          </button>
        </p>
      </div>

      {/* Claves y sincronización */}
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <ul className="space-y-1">
          <li>
            <span className={info?.hasCanvasToken ? "text-emerald-600" : "text-amber-600"}>{info?.hasCanvasToken ? "✓" : "✗"}</span> Token de Canvas guardado en este ordenador
            {info?.canvasTokenExpiresAt && (
              <span className="text-muted-foreground"> · caduca el {new Date(info.canvasTokenExpiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</span>
            )}
          </li>
          <li>
            <span className={info?.hasOpenAiKey ? "text-emerald-600" : "text-muted-foreground"}>{info?.hasOpenAiKey ? "✓" : "–"}</span> Clave de OpenAI {info?.hasOpenAiKey ? "guardada" : "(opcional, para la IA)"}
          </li>
          <li className="text-xs text-muted-foreground">Las claves se guardan cifradas por Windows en este ordenador y nunca se suben a internet. En Supabase solo está tu cuenta de acceso.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void bridge.openSetup()}>
            {info?.hasCanvasToken ? "Cambiar claves" : "Poner claves"}
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run("sync", async () => (await bridge.syncNow()).message)}>
            {busy === "sync" ? "Sincronizando…" : "Sincronizar ahora"}
          </Button>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={info?.autoStart ?? false}
            onChange={async (e) => {
              const on = await bridge.setAutoStart(e.target.checked);
              setInfo((i) => (i ? { ...i, autoStart: on } : i));
            }}
          />
          Abrir UniHub al iniciar Windows (minimizado junto al reloj)
        </label>
        <p className="text-xs text-muted-foreground">
          Sincroniza con Canvas cada 20 minutos mientras el programa esté abierto o en la bandeja y te avisa con notificaciones de Windows. Última: {when(info?.lastSync ?? null)}.
          {info ? ` Versión ${info.version}.` : ""}
        </p>
      </div>

      {msg && (
        <p role="status" className="rounded-md bg-muted px-2.5 py-1.5 text-xs">
          {msg}
        </p>
      )}

      {/* Importar */}
      <div className="rounded-md border border-border bg-muted/40 p-2.5">
        <p className="font-medium">¿Ya usabas UniHub en la web?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Copia a este ordenador tus clases, transcripciones, apuntes, notas y progreso (y los deja también como archivos en tu carpeta). Se hace una sola vez, recién instalado; lo que hay en la web no se toca.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={!!busy}
          onClick={() =>
            void run("import", async () => {
              if (!window.confirm("¿Copiar tus datos de la web a este ordenador? Puede tardar un poco.")) return null;
              const r = await importFromWebAction();
              return r.ok ? `Listo: ${r.rows} registros copiados de ${r.tables} tipos de datos.` : r.error;
            })
          }
        >
          {busy === "import" ? "Copiando…" : "Traer mis datos de la web"}
        </Button>
      </div>
    </div>
  );
}
