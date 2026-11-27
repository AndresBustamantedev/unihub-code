import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncContent } from "@/features/content/sync";
import { syncCourses } from "@/features/courses/sync";
import { syncInbox } from "@/features/inbox/sync";
import { syncMaterials } from "@/features/materials/sync";
import { syncPeopleAndSyllabus } from "@/features/people/sync";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

/** La lista de asignaturas cambia poco: se refresca como mucho cada 6 h. */
export const COURSES_REFRESH_MS = 6 * 3_600_000;
/** Materiales (módulos, archivos, páginas, calendario) cada 2 h: cambian poco y cuestan más peticiones. */
export const MATERIALS_REFRESH_MS = 2 * 3_600_000;

async function lastSuccess(db: DB, userId: string, resource: string): Promise<number | null> {
  const { data } = await db
    .from("sync_runs")
    .select("finished_at")
    .eq("user_id", userId)
    .eq("resource", resource)
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.finished_at ? new Date(data.finished_at).getTime() : null;
}

/**
 * Sincronización periódica de un usuario con la cadencia de cada recurso
 * (la usan el cron de Vercel y el programa de escritorio cada 20 min).
 * Funciona con la clave de servicio (cron) o con la sesión del usuario (escritorio, con RLS).
 */
export async function runScheduledSync(db: DB, userId: string) {
  const lastCourses = await lastSuccess(db, userId, "courses");
  const coursesDue = !lastCourses || Date.now() - lastCourses > COURSES_REFRESH_MS;
  const courses = coursesDue ? (await syncCourses(db, userId)).status : "skipped";
  // Profesores y programa cambian poco: con la misma frecuencia que la lista de asignaturas.
  const people = coursesDue ? await syncPeopleAndSyllabus(db, userId) : "skipped";
  const content = await syncContent(db, userId);
  const lastMaterials = await lastSuccess(db, userId, "materials");
  const materials = !lastMaterials || Date.now() - lastMaterials > MATERIALS_REFRESH_MS ? (await syncMaterials(db, userId)).status : "skipped";
  const inbox = (await syncInbox(db, userId)).status;
  return { courses, people, content: content.status, materials, inbox };
}
