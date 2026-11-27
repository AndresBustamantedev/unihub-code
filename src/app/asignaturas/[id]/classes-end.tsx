"use client";

import { useState, useTransition } from "react";
import { setClassesEndAction } from "@/features/schedule/actions";

const input = "h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function fmt(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

/** "Ya no hay más clases": fija el último día de clases para dejar de pedir grabaciones. */
export function ClassesEnd({ courseId, endsOn, today }: { courseId: string; endsOn: string | null; today: string }) {
  const [value, setValue] = useState(endsOn ?? today);
  const [pending, start] = useTransition();
  const save = (d: string | null) => start(async () => void (await setClassesEndAction(courseId, d)));
  const ended = endsOn !== null && endsOn < today;

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5">
      {endsOn ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            {ended ? "Las clases terminaron el " : "Las clases terminan el "}
            <strong className="font-medium">{fmt(endsOn)}</strong>. {ended ? "No se piden más grabaciones." : "Después no se pedirán grabaciones."}
          </p>
          <button type="button" disabled={pending} onClick={() => save(null)} className="h-8 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted">
            Reanudar clases
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <p className="w-full text-xs text-muted-foreground">Cuando acaben las clases de esta asignatura, indícalo para que deje de aparecer en el calendario y de pedirte que importes grabaciones.</p>
          <button type="button" disabled={pending} onClick={() => save(today)} className="h-8 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted">
            Ya no hay más clases
          </button>
          <span className="text-xs text-muted-foreground">o termina el</span>
          <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className={input} aria-label="Último día de clases" />
          <button type="button" disabled={pending || !value} onClick={() => save(value)} className="h-8 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:brightness-110">
            Guardar fecha
          </button>
        </div>
      )}
    </div>
  );
}
