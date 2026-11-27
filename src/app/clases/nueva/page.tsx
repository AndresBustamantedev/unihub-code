import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { hhmm, isoToMadridLocal } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function NuevaClasePage({ searchParams }: { searchParams: Promise<{ asignatura?: string; fecha?: string }> }) {
  await requirePageUser("/clases/nueva");
  const { asignatura, fecha } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: courses } = await supabase.from("courses").select("id, name, course_code").eq("followed", true).order("name");
  const list = courses ?? [];
  const defaultCourse = asignatura && list.some((c) => c.id === asignatura) ? asignatura : null;
  // Desde el aviso de "falta importar": fecha de la clase con la hora de inicio del horario.
  let defaultDate = isoToMadridLocal(new Date().toISOString());
  let defaultTitle = "";
  if (defaultCourse && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const weekday = ((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const { data: slot } = await supabase.from("class_schedule").select("start_time").eq("course_id", defaultCourse).eq("weekday", weekday).order("start_time").limit(1).maybeSingle();
    defaultDate = `${fecha}T${slot ? hhmm(slot.start_time) : "09:00"}`;
    const course = list.find((c) => c.id === defaultCourse);
    const day = new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", day: "numeric", month: "short" });
    if (course) defaultTitle = `${course.name} · ${day}`;
  }

  return (
    <AppShell active="/clases">
      <div className="flex max-w-2xl flex-col gap-3">
        <div>
          <Link href="/clases" className="text-xs text-muted-foreground hover:text-foreground">← Clases</Link>
          <h1 className="text-xl font-bold tracking-tight">Importar clase</h1>
          <p className="text-sm text-muted-foreground">
            En Teams: abre la reunión de la clase → pestaña <em>Grabaciones y transcripciones</em> → descarga la transcripción (.vtt o .docx) y copia el enlace de la grabación.
          </p>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Primero sigue alguna asignatura en <Link href="/asignaturas" className="underline">Asignaturas</Link>.
          </p>
        ) : (
          <ImportForm courses={list} defaultCourseId={defaultCourse} defaultDate={defaultDate} defaultTitle={defaultTitle} />
        )}
      </div>
    </AppShell>
  );
}
