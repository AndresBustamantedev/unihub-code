"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Target {
  id: string;
  title: string;
}

/** Anterior / siguiente archivo de la asignatura. También con las flechas ← → del teclado. */
export function FileNav({ prev, next, index, total, moduleName, inModule }: { prev: Target | null; next: Target | null; index: number; total: number; moduleName: string | null; inModule: { index: number; total: number } }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" && prev) router.push(`/material/${prev.id}`);
      if (e.key === "ArrowRight" && next) router.push(`/material/${next.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  const btn = "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted sm:max-w-[45%]";
  return (
    <nav aria-label="Otros archivos de la asignatura" className="flex items-center gap-2">
      {prev ? (
        <Link href={`/material/${prev.id}`} className={btn} title={prev.title}>
          <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-[11px] text-muted-foreground">Anterior</span>
            <span className="block truncate">{prev.title}</span>
          </span>
        </Link>
      ) : (
        <span className="flex-1 sm:max-w-[45%]" />
      )}
      <span className="hidden shrink-0 flex-col items-center px-2 text-center text-[11px] text-muted-foreground sm:flex">
        <span className="tabular">{index} de {total}</span>
        {moduleName && <span className="max-w-48 truncate" title={moduleName}>{moduleName} · {inModule.index}/{inModule.total}</span>}
      </span>
      {next ? (
        <Link href={`/material/${next.id}`} className={`${btn} ml-auto justify-end text-right`} title={next.title}>
          <span className="min-w-0">
            <span className="block text-[11px] text-muted-foreground">Siguiente</span>
            <span className="block truncate">{next.title}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <span className="flex-1 sm:max-w-[45%]" />
      )}
    </nav>
  );
}
