import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasApiError } from "@/integrations/canvas/errors";
import { getCanvasClient } from "@/integrations/canvas/server";
import type { CanvasUser } from "@/integrations/canvas/types";
import type { Database } from "@/lib/supabase/database.types";
import { htmlToText } from "@/lib/html";
import { logger } from "@/lib/redact";
import { mapPeople } from "./map";

type DB = SupabaseClient<Database>;
const TUTOR_COURSE = /aula tutor|\(TUT_\d{4}/i;

/**
 * Profesores (y tutor del Aula Tutor) y programa del curso de las asignaturas seguidas.
 * Si Canvas oculta "Personas" o el programa, se omite sin error: no se inventa nada.
 */
export async function syncPeopleAndSyllabus(db: DB, userId: string): Promise<{ courses: number; people: number; failed: number }> {
  let canvas: ReturnType<typeof getCanvasClient>;
  try {
    canvas = getCanvasClient();
  } catch {
    return { courses: 0, people: 0, failed: 0 };
  }
  const { client } = canvas;
  const { data: courses } = await db.from("courses").select("id, external_id, name, followed").eq("user_id", userId).is("missing_since", null);
  const targets = (courses ?? []).filter((c) => c.followed || TUTOR_COURSE.test(c.name));
  const nowIso = new Date().toISOString();
  let people = 0;
  let failed = 0;

  for (const c of targets) {
    try {
      const users = await client.getAll<CanvasUser>(`courses/${c.external_id}/users`, {
        "enrollment_type[]": ["teacher", "ta"],
        "include[]": ["enrollments", "email"],
      }, 3);
      const rows = mapPeople(users, { userId, courseId: c.id, nowIso });
      if (rows.length) {
        const { error } = await db.from("course_people").upsert(rows, { onConflict: "user_id,course_id,external_id,role" });
        if (error) throw new Error("db_upsert_people");
      }
      let q = db.from("course_people").update({ missing_since: nowIso }).eq("user_id", userId).eq("course_id", c.id).is("missing_since", null);
      if (rows.length) q = q.not("external_id", "in", `(${[...new Set(rows.map((r) => r.external_id))].join(",")})`);
      await q;
      people += rows.length;
    } catch (err) {
      if (!(err instanceof CanvasApiError && ["unauthorized", "forbidden", "not_found"].includes(err.kind))) failed++;
      logger.warn("people_sync_failed", { course: c.external_id, kind: err instanceof CanvasApiError ? err.kind : "other" });
    }

    if (!c.followed) continue;
    try {
      const { data } = await client.get<{ syllabus_body?: string | null }>(`courses/${c.external_id}`, { "include[]": ["syllabus_body"] });
      const text = htmlToText(data.syllabus_body, 60000);
      await db.from("courses").update({ syllabus_text: text }).eq("user_id", userId).eq("id", c.id);
    } catch (err) {
      logger.warn("syllabus_sync_failed", { course: c.external_id, kind: err instanceof CanvasApiError ? err.kind : "other" });
    }
  }
  return { courses: targets.length, people, failed };
}
