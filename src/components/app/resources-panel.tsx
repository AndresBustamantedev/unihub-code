"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Code2, ExternalLink, FileText, Link2, ListChecks, PlayCircle, Plus, Trash2, type LucideIcon } from "lucide-react";
import { addResourceAction, deleteResourceAction, type ResourceState } from "@/features/resources/actions";
import { hostOf, resourceKind, type ResourceKind } from "@/features/resources/describe";
import type { ClassResourceRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const ICON: Record<ResourceKind, LucideIcon> = { video: PlayCircle, doc: FileText, code: Code2, exercise: ListChecks, link: Link2 };
const input = "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Item({ r, label }: { r: ClassResourceRow; label?: string | null }) {
  const [pending, start] = useTransition();
  const Icon = ICON[resourceKind(r.url)];
  return (
    <li className={cn("flex items-start gap-2.5 py-2", pending && "opacity-50")}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline">
          <span className="truncate">{r.title}</span>
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {hostOf(r.url)}
          {label ? ` · ${label}` : ""}
        </p>
        {r.note && <p className="mt-0.5 text-xs">{r.note}</p>}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => deleteResourceAction(r.id))}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Quitar ${r.title}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

/**
 * Enlaces externos para reforzar una clase o una asignatura (vídeos, apuntes, ejercicios…).
 * Solo se guarda el enlace, el título y una nota: nunca se descarga la página.
 */
export function ResourcesPanel({
  courseId,
  sessionId,
  itemId,
  items,
  labels,
  title = "Recursos para reforzar",
  empty = "Añade vídeos, artículos o ejercicios que te ayuden con esta clase.",
  bare = false,
}: {
  courseId: string;
  sessionId?: string;
  /** Material (archivo de un módulo) al que se asocian los enlaces. */
  itemId?: string;
  items: ClassResourceRow[];
  /** Etiqueta por clase ("Clase 3") cuando se listan los recursos de toda la asignatura. */
  labels?: Record<string, string>;
  title?: string;
  empty?: string;
  /** Sin marco (dentro de otro panel). */
  bare?: boolean;
}) {
  const [state, action, pending] = useActionState<ResourceState, FormData>(addResourceAction, {});
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-3", bare && "border-0 bg-transparent p-0")} aria-labelledby={`res-${itemId ?? sessionId ?? courseId}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`res-${itemId ?? sessionId ?? courseId}`} className="text-sm font-semibold">
          {title} {items.length > 0 && <span className="tabular font-normal text-muted-foreground">{items.length}</span>}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
        >
          <Plus className="size-3.5" /> Añadir enlace
        </button>
      </div>

      {open && (
        <form ref={form} action={action} className={cn("mt-2 grid gap-2 rounded-md bg-muted/50 p-2.5", !bare && "sm:grid-cols-2")}>
          <input type="hidden" name="course_id" value={courseId} />
          <input type="hidden" name="session_id" value={sessionId ?? ""} />
          <input type="hidden" name="module_item_id" value={itemId ?? ""} />
          <label className={cn("flex flex-col gap-1 text-xs", !bare && "sm:col-span-2")}>
            Enlace
            <input name="url" required inputMode="url" placeholder="https://www.youtube.com/watch?v=…" className={input} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Título <span className="text-muted-foreground">(opcional)</span>
            <input name="title" maxLength={200} placeholder="Punteros explicados en 10 min" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Nota <span className="text-muted-foreground">(opcional)</span>
            <input name="note" maxLength={500} placeholder="Ver a partir del minuto 4" className={input} />
          </label>
          <div className={cn("flex items-center gap-2", !bare && "sm:col-span-2")}>
            <button type="submit" disabled={pending} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-60">
              {pending ? "Guardando…" : "Guardar enlace"}
            </button>
            {state.error && <p className="text-xs text-red-600" role="alert">{state.error}</p>}
            {state.ok && !state.error && <p className="text-xs text-muted-foreground" role="status">Guardado.</p>}
          </div>
        </form>
      )}

      {items.length === 0 ? (
        !open && <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {items.map((r) => <Item key={r.id} r={r} label={r.session_id ? labels?.[r.session_id] : r.module_item_id && labels ? labels[r.module_item_id] ?? "Material" : labels ? "Asignatura" : null} />)}
        </ul>
      )}
    </section>
  );
}
