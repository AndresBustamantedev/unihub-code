"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { DEGREE_SEMESTERS, yearOfSemester } from "@/lib/academic";
import { updateAppearanceAction, type AppearanceState } from "@/features/courses/actions";

const input = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AppearanceForm({ courseId, coverUrl, semester }: { courseId: string; coverUrl: string | null; semester: number | null }) {
  const [state, action, pending] = useActionState<AppearanceState, FormData>(updateAppearanceAction, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_13rem_auto] sm:items-end">
      <input type="hidden" name="course_id" value={courseId} />
      <label className="flex flex-col gap-1 text-sm">
        Imagen de portada (URL, opcional)
        <input name="cover_url" type="url" defaultValue={coverUrl ?? ""} placeholder="https://… (vacío = automática)" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Semestre
        <select name="semester" defaultValue={semester ? String(semester) : ""} className={input}>
          <option value="">Sin asignar</option>
          {Array.from({ length: DEGREE_SEMESTERS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Semestre {n} ({yearOfSemester(n)}.º curso)
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-9">{pending ? "Guardando…" : "Guardar"}</Button>
      {state.error && <p role="alert" className="text-sm text-urgent sm:col-span-3">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-emerald-600 sm:col-span-3">Guardado.</p>}
    </form>
  );
}
