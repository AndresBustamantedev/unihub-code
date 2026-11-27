import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listMissingClasses } from "@/features/classes/queries";
import { missingDedupeKey } from "@/features/classes/missing";
import { planReminders, type ReminderCandidate } from "@/features/reminders/plan";
import { displayCourseName } from "@/lib/course-color";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

export interface DesktopAlert {
  /** Clave estable: el programa no repite una notificación con la misma clave. */
  key: string;
  title: string;
  body: string;
  /** Ruta interna de UniHub que se abre al pulsar la notificación. */
  path: string;
}

/**
 * Qué notificar ahora en el programa de escritorio. No escribe nada en la base de datos:
 * el programa recuerda en local qué claves ya mostró.
 */
export async function desktopAlerts(db: DB, userId: string, since: Date, now = new Date()): Promise<DesktopAlert[]> {
  const alerts: DesktopAlert[] = [];
  const horizon = new Date(now.getTime() + 73 * 3_600_000).toISOString();
  const { data: courses } = await db.from("courses").select("id, name, course_code").eq("user_id", userId).eq("followed", true);
  const label = new Map((courses ?? []).map((c) => [c.id, displayCourseName(c.name)]));

  // Entregas próximas (72 h / 24 h / 6 h), con las mismas reglas que los avisos al móvil.
  if (label.size) {
    const { data: assignments } = await db
      .from("assignments")
      .select("id, course_id, name, due_at, submission_state, last_synced_at, missing_since, html_url")
      .eq("user_id", userId)
      .in("course_id", [...label.keys()])
      .eq("submission_state", "pending")
      .is("missing_since", null)
      .gt("due_at", now.toISOString())
      .lte("due_at", horizon);
    const candidates: ReminderCandidate[] = (assignments ?? []).map((a) => ({ ...a, courseLabel: label.get(a.course_id) ?? "" }));
    for (const r of planReminders(candidates, now)) {
      if (r.status !== "pending") continue;
      alerts.push({ key: `due:${r.assignment_id}:${r.kind}`, title: r.title, body: r.body, path: "/tareas" });
    }
  }

  // Clases del horario sin grabación importada.
  for (const m of (await listMissingClasses(db, userId, now)) ?? []) {
    const day = new Date(`${m.date}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
    alerts.push({
      key: missingDedupeKey(m),
      title: `Falta importar la clase de ${displayCourseName(m.course.name)}`,
      body: `Clase del ${day} sin grabación ni transcripción.`,
      path: `/clases/nueva?asignatura=${m.course_id}&fecha=${m.date}`,
    });
  }

  // Novedades de Canvas desde la última comprobación (agrupadas en un solo aviso).
  const { data: changes } = await db
    .from("changes")
    .select("id, title, course_id, detected_at")
    .eq("user_id", userId)
    .is("read_at", null)
    .gt("detected_at", since.toISOString())
    .order("detected_at", { ascending: false })
    .limit(20);
  if (changes?.length) {
    const first = changes[0]!;
    alerts.push({
      key: `changes:${first.id}`,
      title: changes.length === 1 ? (first.course_id ? label.get(first.course_id) ?? "Novedad en Canvas" : "Novedad en Canvas") : `${changes.length} novedades en Canvas`,
      body: changes.slice(0, 3).map((c) => c.title).join(" · "),
      path: "/novedades",
    });
  }
  return alerts;
}
