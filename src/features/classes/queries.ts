import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassSessionRow, CourseRow, Database } from "@/lib/supabase/database.types";
import { findMissingClasses, MISSING_LOOKBACK_DAYS, pastOccurrences, type Occurrence } from "./missing";

type DB = SupabaseClient<Database>;
export type SessionListItem = ClassSessionRow & {
  course: Pick<CourseRow, "id" | "name" | "course_code"> | null;
  transcript: { word_count: number; source_format: string } | null;
};

export async function listSessions(supabase: DB, opts: { courseId?: string; limit?: number } = {}): Promise<SessionListItem[] | null> {
  let q = supabase.from("class_sessions").select("*").order("session_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.courseId) q = q.eq("course_id", opts.courseId);
  const { data, error } = await q;
  if (error) return null;
  const sessions = data ?? [];
  if (sessions.length === 0) return [];
  const [courses, transcripts] = await Promise.all([
    supabase.from("courses").select("id, name, course_code").in("id", [...new Set(sessions.map((s) => s.course_id))]),
    supabase.from("transcripts").select("session_id, word_count, source_format").in("session_id", sessions.map((s) => s.id)),
  ]);
  if (courses.error || transcripts.error) return null;
  const cMap = new Map((courses.data ?? []).map((c) => [c.id, c]));
  const tMap = new Map((transcripts.data ?? []).map((t) => [t.session_id, t]));
  return sessions.map((s) => ({ ...s, course: cMap.get(s.course_id) ?? null, transcript: tMap.get(s.id) ?? null }));
}

export type MissingClass = Occurrence & { course: Pick<CourseRow, "id" | "name" | "course_code"> };

/**
 * Clases del horario (asignaturas seguidas) que ya pasaron hace más de un día sin
 * grabación importada. Filtra por usuario de forma explícita para poder usarse
 * también desde el cron con la clave de servicio.
 */
export async function listMissingClasses(db: DB, userId: string, now = new Date()): Promise<MissingClass[] | null> {
  const since = new Date(now.getTime() - (MISSING_LOOKBACK_DAYS + 2) * 86_400_000);
  const [courses, schedule, sessions, skips] = await Promise.all([
    db.from("courses").select("id, name, course_code, classes_end_on").eq("user_id", userId).eq("followed", true),
    db.from("class_schedule").select("course_id, weekday, start_time, end_time").eq("user_id", userId),
    db.from("class_sessions").select("course_id, session_at").eq("user_id", userId).gte("session_at", since.toISOString()),
    db.from("class_skips").select("course_id, class_date").eq("user_id", userId).gte("class_date", since.toISOString().slice(0, 10)),
  ]);
  if (courses.error || schedule.error || sessions.error || skips.error) return null;
  const cMap = new Map((courses.data ?? []).map((c) => [c.id, c]));
  const slots = (schedule.data ?? []).flatMap((s) => {
    const c = cMap.get(s.course_id);
    return c ? [{ ...s, ends_on: c.classes_end_on }] : [];
  });
  const missing = findMissingClasses(pastOccurrences(slots, now), sessions.data ?? [], skips.data ?? []);
  return missing.flatMap((o) => {
    const course = cMap.get(o.course_id);
    return course ? [{ ...o, course: { id: course.id, name: course.name, course_code: course.course_code } }] : [];
  });
}
