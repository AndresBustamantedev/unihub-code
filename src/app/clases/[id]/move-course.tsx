"use client";

import { useState, useTransition } from "react";
import { moveSessionAction } from "@/features/classes/progress-actions";

/** Cambiar la clase de asignatura si se importó en la que no era. */
export function MoveCourse({ sessionId, courseId, courses }: { sessionId: string; courseId: string; courses: { id: string; name: string }[] }) {
  const [value, setValue] = useState(courseId);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const move = () =>
    start(async () => {
      const r = await moveSessionAction(sessionId, value);
      setMsg(r.ok ? "Clase movida." : r.error ?? "No se pudo mover.");
    });
  return (
    <details className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">¿Está en la asignatura equivocada? Cambiar de asignatura</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Asignatura"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          type="button"
          onClick={move}
          disabled={pending || value === courseId}
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Moviendo…" : "Mover clase"}
        </button>
        {msg && <p role="status" className="w-full text-xs text-muted-foreground">{msg}</p>}
      </div>
    </details>
  );
}
