import type { CSSProperties } from "react";
import type { AssignmentWithCourse } from "@/features/content/queries";
import { Video } from "lucide-react";
import type { ScheduleWithCourse } from "@/features/schedule/queries";
import { courseHue, courseShort } from "@/lib/course-color";
import { hhmm, madridDayKey, madridMinutesNow, madridTime, nextDays } from "@/lib/format";
import { cn } from "@/lib/utils";

function Chip({ a, overdue }: { a: AssignmentWithCourse; overdue?: boolean }) {
  const time = a.due_at ? madridTime(a.due_at) : null;
  const body = (
    <>
      <span className="flex items-center justify-between gap-1 text-[11px] font-semibold text-[hsl(var(--h)_60%_32%)] dark:text-[hsl(var(--h)_80%_78%)]">
        <span>{courseShort(a.course.name, a.course.course_code)}</span>
        {time && time !== "23:59" && <span className="tabular font-normal opacity-80">{time}</span>}
      </span>
      <span className="line-clamp-2 text-xs leading-snug text-foreground">{a.name}</span>
    </>
  );
  const cls = cn(
    "block rounded-md border-l-[3px] px-2 py-1.5",
    "bg-[hsl(var(--h)_75%_96%)] dark:bg-[hsl(var(--h)_30%_17%)]",
    overdue && "ring-1 ring-urgent/50",
  );
  const style = { "--h": courseHue(a.course.id), borderLeftColor: `hsl(${courseHue(a.course.id)} 65% 50%)` } as CSSProperties;
  return a.html_url ? (
    <a href={a.html_url} target="_blank" rel="noopener noreferrer" className={cn(cls, "hover:brightness-[0.97] dark:hover:brightness-110")} style={style} title={`${a.course.name} — ${a.name}`}>
      {body}
    </a>
  ) : (
    <div className={cls} style={style} title={`${a.course.name} — ${a.name}`}>{body}</div>
  );
}

function ClassBlock({ c, live }: { c: ScheduleWithCourse; live: boolean }) {
  const h = courseHue(c.course.id);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border border-dashed px-2 py-1 text-[11px]",
        live ? "border-primary bg-accent-soft" : "border-border",
      )}
      title={`${live ? "En curso: " : ""}clase de ${c.course.name} (${hhmm(c.start_time)}–${hhmm(c.end_time)})${c.location ? ` · ${c.location}` : ""}`}
    >
      <span className="flex min-w-0 items-center gap-1 truncate" style={{ "--h": h } as CSSProperties}>
        {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" aria-label="en curso" />}
        <span className="tabular font-medium">{hhmm(c.start_time)}</span>
        <span className="font-semibold text-[hsl(var(--h)_60%_40%)] dark:text-[hsl(var(--h)_80%_74%)]">{courseShort(c.course.name, c.course.course_code)}</span>
      </span>
      {c.meeting_url && (
        <a href={c.meeting_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary" aria-label={`Unirse a la clase de ${c.course.name}`}>
          <Video className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/**
 * Las entregas de los próximos 7 días colocadas en su día (hora de Madrid),
 * con las vencidas a la izquierda. En móvil se desplaza en horizontal.
 */
export function WeekStrip({ assignments, classes = [], now = new Date(), week = 0 }: { assignments: AssignmentWithCourse[]; classes?: ScheduleWithCourse[]; now?: Date; week?: number }) {
  const days = nextDays(now, 7, week * 7);
  const minutes = madridMinutesNow(now);
  // Las clases de una asignatura dejan de mostrarse después de su último día de clases.
  const classesOf = (d: { isoWeekday: number; key: string }) => classes.filter((c) => c.weekday === d.isoWeekday && (!c.course.classes_end_on || d.key <= c.course.classes_end_on));
  const isLive = (c: ScheduleWithCourse, today: boolean) => {
    if (!today) return false;
    const [sh, sm] = c.start_time.split(":").map(Number);
    const [eh, em] = c.end_time.split(":").map(Number);
    return minutes >= (sh ?? 0) * 60 + (sm ?? 0) && minutes < (eh ?? 0) * 60 + (em ?? 0);
  };
  const pending = assignments.filter((a) => (a.submission_state === "pending" || a.submission_state === "unknown") && a.due_at);
  // Las vencidas solo se muestran en la semana actual.
  const overdue = week === 0 ? pending.filter((a) => new Date(a.due_at!) < now) : [];
  const byDay = new Map<string, AssignmentWithCourse[]>();
  for (const a of pending) {
    if (new Date(a.due_at!) < now) continue;
    const k = madridDayKey(new Date(a.due_at!));
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  const total = days.reduce((n, d) => n + (byDay.get(d.key)?.length ?? 0), 0);

  const agenda = days.filter((d) => d.isToday || (week > 0 && d === days[0]) || (byDay.get(d.key)?.length ?? 0) > 0 || classesOf(d).length > 0);

  return (
    <>
    {/* Móvil: agenda vertical con los días que tienen entregas */}
    <ol className="flex flex-col gap-2 md:hidden" aria-label={`${total} entregas en estos 7 días`}>
      {overdue.length > 0 && (
        <li className="flex gap-3 rounded-lg border border-urgent/30 bg-card p-2.5">
          <div className="w-14 shrink-0">
            <p className="text-xs font-semibold text-urgent">Vencidas</p>
            <p className="tabular text-2xl font-bold leading-tight text-urgent">{overdue.length}</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">{overdue.slice(0, 3).map((a) => <Chip key={a.id} a={a} overdue />)}</div>
        </li>
      )}
      {agenda.map((d) => {
        const items = byDay.get(d.key) ?? [];
        return (
          <li key={d.key} className={cn("flex gap-3 rounded-lg border p-2.5", d.isToday ? "border-primary/40 bg-accent-soft" : "border-border bg-card")}>
            <div className="w-14 shrink-0">
              <p className={cn("text-xs capitalize", d.isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{d.weekday}</p>
              <p className="tabular text-2xl font-bold leading-tight">{d.day}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {classesOf(d).map((c) => <ClassBlock key={c.id} c={c} live={isLive(c, d.isToday)} />)}
              {items.map((a) => <Chip key={a.id} a={a} />)}
              {items.length === 0 && classesOf(d).length === 0 && <p className="py-1.5 text-sm text-muted-foreground">{d.isToday ? "Nada que entregar hoy" : "Sin entregas"}</p>}
            </div>
          </li>
        );
      })}
      {agenda.length === 1 && total === 0 && <li className="px-1 text-sm text-muted-foreground">Sin entregas en estos 7 días.</li>}
    </ol>

    {/* Tablet y escritorio: franja de 7 días */}
    <div className="hidden overflow-x-auto md:block">
      <ol className="grid min-w-[44rem] grid-flow-col auto-cols-fr gap-1.5" aria-label={`${total} entregas en estos 7 días`}>
        {overdue.length > 0 && (
          <li className="flex min-h-36 flex-col gap-1.5 rounded-lg border border-urgent/30 bg-card p-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-urgent">Vencidas</span>
              <span className="tabular text-xl font-bold leading-none text-urgent">{overdue.length}</span>
            </div>
            {overdue.slice(0, 3).map((a) => <Chip key={a.id} a={a} overdue />)}
            {overdue.length > 3 && <span className="text-[11px] text-muted-foreground">y {overdue.length - 3} más</span>}
          </li>
        )}
        {days.map((d) => {
          const items = byDay.get(d.key) ?? [];
          return (
            <li
              key={d.key}
              aria-current={d.isToday ? "date" : undefined}
              className={cn(
                "flex min-h-36 flex-col gap-1.5 rounded-lg border p-2",
                d.isToday ? "border-primary/40 bg-accent-soft" : "border-border bg-card",
                d.isWeekend && !d.isToday && "bg-muted/50",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className={cn("text-xs capitalize", d.isToday ? "font-semibold text-primary" : "text-muted-foreground")}>{d.weekday}</span>
                <span className={cn("tabular text-xl font-bold leading-none", items.length === 0 && "text-muted-foreground/40")}>{d.day}</span>
              </div>
              {classesOf(d).map((c) => <ClassBlock key={c.id} c={c} live={isLive(c, d.isToday)} />)}
              {items.map((a) => <Chip key={a.id} a={a} />)}
            </li>
          );
        })}
      </ol>
    </div>
    </>
  );
}
