import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseRow, Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;
export type FollowedCourse = Pick<CourseRow, "id" | "name" | "course_code" | "html_url">;

const memo = new WeakMap<DB, { at: number; promise: Promise<Map<string, FollowedCourse> | null> }>();
const TTL_MS = 5_000;

/**
 * Asignaturas seguidas. Varias consultas de una misma página la necesitan a la vez:
 * con el mismo cliente se reutiliza una sola petición (memo breve por cliente).
 */
export function followedCourses(db: DB): Promise<Map<string, FollowedCourse> | null> {
  const hit = memo.get(db);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async () => {
    const { data, error } = await db.from("courses").select("id, name, course_code, html_url").eq("followed", true);
    return error ? null : new Map((data ?? []).map((c) => [c.id, c]));
  })();
  memo.set(db, { at: Date.now(), promise });
  return promise;
}
