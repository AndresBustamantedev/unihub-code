"use client";

import { useActionState, useTransition } from "react";
import { Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addScheduleSlotAction, deleteScheduleSlotAction, type ScheduleState } from "@/features/schedule/actions";

interface Slot {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  meeting_url: string | null;
}

const DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const input = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScheduleEditor({ courseId, slots }: { courseId: string; slots: Slot[] }) {
  const [state, action, pending] = useActionState<ScheduleState, FormData>(addScheduleSlotAction, {});
  const [deleting, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {slots.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-24 font-medium">{DAYS[s.weekday]}</span>
              <span className="tabular">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.location}</span>
              {s.meeting_url && (
                <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Enlace de la clase">
                  <Video className="size-4" />
                </a>
              )}
              <button type="button" disabled={deleting} onClick={() => start(() => deleteScheduleSlotAction(s.id))} className="text-muted-foreground hover:text-urgent" aria-label="Quitar franja">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin horario. Añade las franjas semanales de esta asignatura y aparecerán en tu semana de Inicio.</p>
      )}
      <form action={action} className="grid gap-2 sm:grid-cols-[8rem_6rem_6rem_1fr]">
        <input type="hidden" name="course_id" value={courseId} />
        <select name="weekday" defaultValue="1" className={input} aria-label="Día">
          {DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
        <input name="start_time" type="time" required defaultValue="18:00" className={input} aria-label="Inicio" />
        <input name="end_time" type="time" required defaultValue="20:00" className={input} aria-label="Fin" />
        <input name="location" placeholder="Aula o «Online» (opcional)" maxLength={200} className={input} />
        <input name="meeting_url" type="url" placeholder="Enlace de Teams (opcional)" className={`${input} sm:col-span-3`} />
        <Button type="submit" size="sm" disabled={pending} className="h-9">{pending ? "Añadiendo…" : "Añadir franja"}</Button>
        {state.error && <p role="alert" className="text-sm text-urgent sm:col-span-4">{state.error}</p>}
      </form>
    </div>
  );
}
