"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncCourses, type SyncResult } from "./sync";
import { pickFreeHue } from "@/lib/course-color";

export async function syncCoursesAction(): Promise<SyncResult | { status: "unauthorized" }> {
  const auth = await requireUser();
  if (!auth.ok) return { status: "unauthorized" };
  const supabase = await createSupabaseServerClient();
  const result = await syncCourses(supabase, auth.user.id);
  revalidatePath("/");
  revalidatePath("/asignaturas");
  return result;
}

const followSchema = z.object({ courseId: z.uuid(), followed: z.boolean() });

export async function setFollowedAction(courseId: string, followed: boolean): Promise<{ ok: boolean }> {
  const parsed = followSchema.safeParse({ courseId, followed });
  if (!parsed.success) return { ok: false };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const supabase = await createSupabaseServerClient();
  // RLS garantiza que solo se modifica una fila propia.
  let colorHue: number | undefined;
  if (parsed.data.followed) {
    const [{ data: current }, { data: others }] = await Promise.all([
      supabase.from("courses").select("color_hue").eq("id", parsed.data.courseId).maybeSingle(),
      supabase.from("courses").select("color_hue").eq("followed", true).neq("id", parsed.data.courseId),
    ]);
    const used = (others ?? []).map((o) => o.color_hue);
    if (current && (current.color_hue === null || used.includes(current.color_hue))) colorHue = pickFreeHue(used);
  }
  const { error } = await supabase
    .from("courses")
    .update({ followed: parsed.data.followed, ...(colorHue !== undefined ? { color_hue: colorHue } : {}) })
    .eq("id", parsed.data.courseId);
  revalidatePath("/");
  revalidatePath("/asignaturas");
  return { ok: !error };
}

export interface AppearanceState {
  ok?: boolean;
  error?: string;
}

const appearanceSchema = z.object({
  course_id: z.uuid(),
  cover_url: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.url({ protocol: /^https$/, error: "La imagen debe ser una URL https://" }).max(2000).nullable()),
  semester: z
    .string()
    .transform((v) => (/^(10|[1-9])$/.test(v) ? Number(v) : null)),
});

export async function updateAppearanceAction(_prev: AppearanceState, formData: FormData): Promise<AppearanceState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };
  const parsed = appearanceSchema.safeParse({ course_id: formData.get("course_id"), cover_url: formData.get("cover_url") ?? "", semester: formData.get("semester") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("courses").update({ cover_url: parsed.data.cover_url, semester: parsed.data.semester }).eq("id", parsed.data.course_id);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/");
  revalidatePath("/asignaturas");
  revalidatePath(`/asignaturas/${parsed.data.course_id}`);
  return { ok: true };
}
