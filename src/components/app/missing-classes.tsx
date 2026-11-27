import type { CSSProperties } from "react";
import Link from "next/link";
import { CalendarX2 } from "lucide-react";
import type { MissingClass } from "@/features/classes/queries";
import { skipClassAction } from "@/features/classes/progress-actions";
import { classesEndedBeforeAction } from "@/features/schedule/actions";
import { courseHue, displayCourseName } from "@/lib/course-color";
import { madridTime } from "@/lib/format";
import { PendingButton } from "./pending-button";

function dayLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
}

/** Clases del horario que ya pasaron sin grabación importada. */
export function MissingClasses({ items, compact = false }: { items: MissingClass[]; compact?: boolean }) {
  if (items.length === 0) return null;
  const shown = compact ? items.slice(-3) : items;
  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 dark:border-amber-400/30 dark:bg-amber-950/40" aria-labelledby="missing-title">
      <div className="mb-1.5 flex items-center gap-2">
        <CalendarX2 className="size-4 text-amber-700 dark:text-amber-300" />
        <h2 id="missing-title" className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          {items.length === 1 ? "Te falta importar 1 clase" : `Te faltan por importar ${items.length} clases`}
        </h2>
      </div>
      <ul className="flex flex-col divide-y divide-amber-500/20">
        {shown.map((o) => (
          <li key={`${o.course_id}-${o.date}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <span className="flex min-w-[12rem] flex-1 items-center gap-2 text-sm">
              <span className="size-2 shrink-0 rounded-full" style={{ background: `hsl(${courseHue(o.course.id)} 65% 50%)` } as CSSProperties} />
              <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                <span className="truncate font-medium">{displayCourseName(o.course.name)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dayLabel(o.date)} · {madridTime(o.startIso)}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-1">
              <Link
                href={`/clases/nueva?asignatura=${o.course_id}&fecha=${o.date}`}
                className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:brightness-110"
              >
                Importar
              </Link>
              <form action={skipClassAction.bind(null, o.course_id, o.date)}>
                <PendingButton className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-amber-100 hover:text-foreground dark:hover:bg-amber-900/50" pendingLabel="…">
                  No hubo clase
                </PendingButton>
              </form>
              <form action={classesEndedBeforeAction.bind(null, o.course_id, o.date)}>
                <PendingButton
                  className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-amber-100 hover:text-foreground dark:hover:bg-amber-900/50"
                  pendingLabel="…"
                >
                  Ya terminaron las clases
                </PendingButton>
              </form>
            </span>
          </li>
        ))}
      </ul>
      {compact && items.length > shown.length && (
        <Link href="/clases" className="mt-1 inline-block text-xs text-amber-900 underline-offset-2 hover:underline dark:text-amber-200">
          Ver las {items.length}
        </Link>
      )}
    </section>
  );
}
