import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnouncementRow, AssignmentRow, ChangeRow, CourseRow, Database } from "@/lib/supabase/database.types";

import { followedCourses } from "@/features/courses/followed";

type DB = SupabaseClient<Database>;
export type CourseLite = Pick<CourseRow, "id" | "name" | "course_code" | "html_url">;
export type AssignmentWithCourse = AssignmentRow & { course: CourseLite };
export type Result<T> = { ok: true; data: T } | { ok: false };


/** Tareas de las asignaturas seguidas (sin las eliminadas en Canvas). */
export async function listAssignments(supabase: DB): Promise<Result<AssignmentWithCourse[]>> {
  const courses = await followedCourses(supabase);
  if (!courses) return { ok: false };
  if (courses.size === 0) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .in("course_id", [...courses.keys()])
    .is("missing_since", null)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) return { ok: false };
  return {
    ok: true,
    data: (data ?? []).flatMap((a) => {
      const course = courses.get(a.course_id);
      return course ? [{ ...a, course }] : [];
    }),
  };
}

export type ChangeWithCourse = ChangeRow & { course: CourseLite | null; html_url: string | null };

export async function listChanges(supabase: DB, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<Result<ChangeWithCourse[]>> {
  let q = supabase.from("changes").select("*").order("detected_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.unreadOnly) q = q.is("read_at", null);
  const [{ data, error }, coursesRes] = await Promise.all([q, supabase.from("courses").select("id, name, course_code, html_url")]);
  if (error || coursesRes.error) return { ok: false };
  const courses = new Map((coursesRes.data ?? []).map((c) => [c.id, c]));

  const changes = data ?? [];
  const aIds = changes.filter((c) => c.entity_type === "assignment" && c.entity_id).map((c) => c.entity_id as string);
  const nIds = changes.filter((c) => c.entity_type === "announcement" && c.entity_id).map((c) => c.entity_id as string);
  const [aRes, nRes] = await Promise.all([
    aIds.length ? supabase.from("assignments").select("id, html_url").in("id", aIds) : Promise.resolve({ data: [] as { id: string; html_url: string | null }[] }),
    nIds.length ? supabase.from("announcements").select("id, html_url").in("id", nIds) : Promise.resolve({ data: [] as { id: string; html_url: string | null }[] }),
  ]);
  const urls = new Map<string, string | null>([...(aRes.data ?? []), ...(nRes.data ?? [])].map((r) => [r.id, r.html_url]));

  return {
    ok: true,
    data: changes.map((c) => {
      const detailUrl = c.detail && typeof c.detail === "object" && !Array.isArray(c.detail) && typeof c.detail.url === "string" ? c.detail.url : null;
      return { ...c, course: c.course_id ? courses.get(c.course_id) ?? null : null, html_url: (c.entity_id ? urls.get(c.entity_id) : null) ?? detailUrl };
    }),
  };
}

export async function countUnreadChanges(supabase: DB): Promise<number | null> {
  const { count, error } = await supabase.from("changes").select("id", { count: "exact", head: true }).is("read_at", null);
  return error ? null : count ?? 0;
}

export async function listRecentAnnouncements(supabase: DB, limit = 5): Promise<Result<(AnnouncementRow & { course: CourseLite | null })[]>> {
  const courses = await followedCourses(supabase);
  if (!courses) return { ok: false };
  if (courses.size === 0) return { ok: true, data: [] };
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .in("course_id", [...courses.keys()])
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return { ok: false };
  return { ok: true, data: (data ?? []).map((a) => ({ ...a, course: courses.get(a.course_id) ?? null })) };
}
