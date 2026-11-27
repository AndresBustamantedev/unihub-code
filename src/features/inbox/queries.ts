import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityRow, ConversationRow, CourseRow, Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;
type CourseLite = Pick<CourseRow, "id" | "name" | "course_code">;

async function coursesMap(db: DB): Promise<Map<string, CourseLite>> {
  const { data } = await db.from("courses").select("id, name, course_code");
  return new Map((data ?? []).map((c) => [c.id, c]));
}

export async function listConversations(db: DB, opts: { courseId?: string; limit?: number } = {}) {
  let q = db.from("canvas_conversations").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).limit(opts.limit ?? 50);
  if (opts.courseId) q = q.eq("course_id", opts.courseId);
  const [{ data, error }, courses] = await Promise.all([q, coursesMap(db)]);
  if (error) return null;
  return (data ?? []).map((c: ConversationRow) => ({ ...c, course: c.course_id ? courses.get(c.course_id) ?? null : null }));
}

export async function listActivity(db: DB, opts: { courseId?: string; limit?: number; unreadOnly?: boolean } = {}) {
  let q = db.from("canvas_activity").select("*").order("canvas_updated_at", { ascending: false, nullsFirst: false }).limit(opts.limit ?? 50);
  if (opts.courseId) q = q.eq("course_id", opts.courseId);
  if (opts.unreadOnly) q = q.eq("read_state", false);
  const [{ data, error }, courses] = await Promise.all([q, coursesMap(db)]);
  if (error) return null;
  return (data ?? []).map((a: ActivityRow) => ({ ...a, course: a.course_id ? courses.get(a.course_id) ?? null : null }));
}

export async function countUnreadConversations(db: DB): Promise<number | null> {
  const { count, error } = await db.from("canvas_conversations").select("id", { count: "exact", head: true }).eq("workflow_state", "unread");
  return error ? null : count ?? 0;
}

/** Notificaciones del flujo de Canvas marcadas como no leídas en Canvas. */
export async function countUnreadActivity(db: DB): Promise<number | null> {
  const { count, error } = await db.from("canvas_activity").select("id", { count: "exact", head: true }).eq("read_state", false);
  return error ? null : count ?? 0;
}
