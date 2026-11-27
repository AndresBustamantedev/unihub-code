import "server-only";
import { followedCourses } from "@/features/courses/followed";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentRow,
  CalendarEventRow,
  ChangeRow,
  CourseRow,
  Database,
  FileRow,
  ModuleItemRow,
  ModuleRow,
  PageRow,
  PersonRow,
  ScheduleRow,
  AnnouncementRow,
} from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

export interface CourseDetail {
  course: CourseRow;
  modules: ModuleRow[];
  items: ModuleItemRow[];
  files: FileRow[];
  pages: PageRow[];
  events: CalendarEventRow[];
  assignments: AssignmentRow[];
  changes: ChangeRow[];
  people: PersonRow[];
  schedule: ScheduleRow[];
  announcements: AnnouncementRow[];
}

/** Todo lo de una asignatura. Devuelve null si no existe o no es del usuario (RLS). */
export async function getCourseDetail(supabase: DB, courseId: string): Promise<CourseDetail | "error" | null> {
  const { data: course, error } = await supabase.from("courses").select("*").eq("id", courseId).maybeSingle();
  if (error) return "error";
  if (!course) return null;
  const nowIso = new Date(Date.now() - 3_600_000).toISOString();
  const [modules, items, files, pages, events, assignments, changes, people, schedule, announcements] = await Promise.all([
    supabase.from("course_modules").select("*").eq("course_id", courseId).is("missing_since", null).order("position"),
    supabase.from("course_module_items").select("*").eq("course_id", courseId).is("missing_since", null).order("position"),
    supabase.from("course_files").select("*").eq("course_id", courseId).is("missing_since", null).order("canvas_created_at", { ascending: false, nullsFirst: false }).limit(15),
    supabase.from("course_pages").select("*").eq("course_id", courseId).is("missing_since", null).order("canvas_updated_at", { ascending: false, nullsFirst: false }).limit(10),
    supabase.from("calendar_events").select("*").eq("course_id", courseId).is("missing_since", null).gte("end_at", nowIso).order("start_at").limit(8),
    supabase.from("assignments").select("*").eq("course_id", courseId).is("missing_since", null).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("changes").select("*").eq("course_id", courseId).order("detected_at", { ascending: false }).limit(30),
    supabase.from("course_people").select("*").eq("course_id", courseId).is("missing_since", null).order("role").order("name"),
    supabase.from("class_schedule").select("*").eq("course_id", courseId).order("weekday").order("start_time"),
    supabase.from("announcements").select("*").eq("course_id", courseId).order("posted_at", { ascending: false, nullsFirst: false }).limit(30),
  ]);
  if ([modules, items, files, pages, events, assignments, changes, people, schedule, announcements].some((r) => r.error)) return "error";
  return {
    course,
    modules: modules.data ?? [],
    items: items.data ?? [],
    files: files.data ?? [],
    pages: pages.data ?? [],
    events: events.data ?? [],
    assignments: assignments.data ?? [],
    changes: changes.data ?? [],
    people: people.data ?? [],
    schedule: schedule.data ?? [],
    announcements: announcements.data ?? [],
  };
}

type CourseLite = Pick<CourseRow, "id" | "name" | "course_code">;

const followed = (supabase: DB): Promise<Map<string, CourseLite> | null> => followedCourses(supabase);

export async function listUpcomingEvents(supabase: DB, days = 7, limit = 6) {
  const courses = await followed(supabase);
  if (!courses) return { ok: false as const };
  if (!courses.size) return { ok: true as const, data: [] };
  const now = Date.now();
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .in("course_id", [...courses.keys()])
    .is("missing_since", null)
    .gte("end_at", new Date(now).toISOString())
    .lte("start_at", new Date(now + days * 86_400_000).toISOString())
    .order("start_at")
    .limit(limit);
  if (error) return { ok: false as const };
  return { ok: true as const, data: (data ?? []).map((e) => ({ ...e, course: courses.get(e.course_id)! })) };
}

export async function listRecentFiles(supabase: DB, days = 14, limit = 6) {
  const courses = await followed(supabase);
  if (!courses) return { ok: false as const };
  if (!courses.size) return { ok: true as const, data: [] };
  const { data, error } = await supabase
    .from("course_files")
    .select("*")
    .in("course_id", [...courses.keys()])
    .is("missing_since", null)
    .gte("canvas_created_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("canvas_created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false as const };
  return { ok: true as const, data: (data ?? []).map((f) => ({ ...f, course: courses.get(f.course_id)! })) };
}

/** Tutor/a: profesores del curso "Aula Tutor" (si Canvas los muestra). */
export async function getTutors(supabase: DB): Promise<{ name: string; email: string | null; role_label: string | null }[]> {
  const { data: tutorCourses } = await supabase.from("courses").select("id").or("name.ilike.%aula tutor%,name.ilike.%(TUT_%");
  const ids = (tutorCourses ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const { data } = await supabase.from("course_people").select("name, email, role_label").in("course_id", ids).is("missing_since", null).eq("role", "teacher");
  const seen = new Set<string>();
  return (data ?? []).filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
}
