import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseRow, Database, ScheduleRow } from "@/lib/supabase/database.types";

export type ScheduleWithCourse = ScheduleRow & { course: Pick<CourseRow, "id" | "name" | "course_code" | "classes_end_on"> };

export async function listSchedule(db: SupabaseClient<Database>, courseId?: string): Promise<ScheduleWithCourse[] | null> {
  let q = db.from("class_schedule").select("*").order("weekday").order("start_time");
  if (courseId) q = q.eq("course_id", courseId);
  const [{ data, error }, courses] = await Promise.all([q, db.from("courses").select("id, name, course_code, classes_end_on")]);
  if (error || courses.error) return null;
  const map = new Map((courses.data ?? []).map((c) => [c.id, c]));
  return (data ?? []).flatMap((s) => {
    const course = map.get(s.course_id);
    return course ? [{ ...s, course }] : [];
  });
}
