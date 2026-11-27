"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { UpdateStatus } from "@/lib/desktop-bridge";

/** Inicio (programa de escritorio): aviso cuando hay una versión nueva descargada y lista. */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = window.unihubDesktop;
    if (!bridge?.getUpdate) return;
    let alive = true;
    const load = () => void bridge.getUpdate().then((s) => alive && setStatus(s));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (status?.state !== "ready") return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/40 dark:text-sky-100">
      <p>
        <span className="font-semibold">UniHub {status.version} está lista.</span> Se instalará al cerrar el programa.{" "}
        <Link href="/ajustes#actualizaciones" className="underline">
          Ver novedades
        </Link>
      </p>
      <button
        type="button"
        disabled={busy}
        className="inline-flex h-8 items-center rounded-md border border-current/25 bg-white/70 px-3 text-xs font-medium hover:bg-white dark:bg-white/10"
        onClick={() => {
          setBusy(true);
          void window.unihubDesktop?.installUpdate().then((ok) => !ok && setBusy(false));
        }}
      >
        {busy ? "Guardando y reiniciando…" : "Reiniciar y actualizar"}
      </button>
    </section>
  );
}
