"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import type { ClassSessionRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { missingDedupeKey } from "./missing";
import { mirrorSession } from "@/features/desktop/mirror";

const changeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("watched"), value: z.boolean() }),
  z.object({ type: z.literal("understanding"), value: z.enum(["low", "mid", "high"]).nullable() }),
  z.object({ type: z.literal("review"), value: z.enum(["reviewing", "done"]).nullable() }),
]);
export type StudyChange = z.infer<typeof changeSchema>;

function revalidateClasses(sessionId: string, courseId: string) {
  revalidatePath("/");
  revalidatePath("/clases");
  revalidatePath(`/clases/${sessionId}`);
  revalidatePath(`/asignaturas/${courseId}`);
}

/** Marca una clase como vista, cómo la entendiste o si la estás repasando. */
export async function updateStudyAction(sessionId: string, change: StudyChange): Promise<{ ok: boolean }> {
  const auth = await requireUser();
  const parsed = changeSchema.safeParse(change);
  if (!auth.ok || !parsed.success || !z.uuid().safeParse(sessionId).success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase.from("class_sessions").select("id, course_id, watched_at, review_count").eq("id", sessionId).maybeSingle();
  if (!s) return { ok: false };

  const now = new Date().toISOString();
  const c = parsed.data;
  let patch: Partial<ClassSessionRow>;
  if (c.type === "watched") {
    // Desmarcar "vista" deja la clase como nueva: sin valoración ni repaso.
    patch = c.value ? { watched_at: s.watched_at ?? now } : { watched_at: null, understanding: null, review_state: null };
  } else if (c.type === "understanding") {
    patch = { understanding: c.value, watched_at: s.watched_at ?? now };
  } else {
    patch = { review_state: c.value, watched_at: s.watched_at ?? now };
    if (c.value === "done") patch = { ...patch, last_reviewed_at: now, review_count: Math.min(s.review_count + 1, 1000) };
  }
  const { error } = await supabase.from("class_sessions").update({ ...patch, updated_at: now }).eq("id", sessionId);
  if (error) return { ok: false };
  revalidateClasses(sessionId, s.course_id);
  return { ok: true };
}

const skipSchema = z.object({ course_id: z.uuid(), date: z.iso.date() });

/** "Ese día no hubo clase (o no se grabó)": deja de avisar de que falta importarla. */
export async function skipClassAction(courseId: string, date: string): Promise<void> {
  const auth = await requireUser();
  const parsed = skipSchema.safeParse({ course_id: courseId, date });
  if (!auth.ok || !parsed.success) return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("class_skips")
    .upsert({ user_id: auth.user.id, course_id: parsed.data.course_id, class_date: parsed.data.date }, { onConflict: "user_id,course_id,class_date", ignoreDuplicates: true });
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("dedupe_key", missingDedupeKey({ course_id: parsed.data.course_id, date: parsed.data.date }));
  revalidatePath("/");
  revalidatePath("/clases");
}

/**
 * Cambia una clase de asignatura (si se importó en la que no era). Se mueven con ella
 * sus apuntes generados y sus recursos; si el título empezaba por el nombre de la
 * asignatura anterior, se cambia por el de la nueva.
 */
export async function moveSessionAction(sessionId: string, courseId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok || !z.uuid().safeParse(sessionId).success || !z.uuid().safeParse(courseId).success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createSupabaseServerClient();
  const [{ data: s }, { data: target }] = await Promise.all([
    supabase.from("class_sessions").select("id, course_id, title").eq("id", sessionId).maybeSingle(),
    supabase.from("courses").select("id, name").eq("id", courseId).maybeSingle(),
  ]);
  if (!s || !target) return { ok: false, error: "Clase o asignatura no encontrada." };
  if (s.course_id === courseId) return { ok: true };
  const { data: from } = await supabase.from("courses").select("name").eq("id", s.course_id).maybeSingle();
  const strip = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, "").trim();
  let title = s.title;
  if (from) {
    for (const prefix of [from.name, strip(from.name)]) {
      if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
        title = `${strip(target.name)}${title.slice(prefix.length)}`.slice(0, 300);
        break;
      }
    }
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("class_sessions").update({ course_id: courseId, title, updated_at: now }).eq("id", sessionId);
  if (error) return { ok: false, error: "No se pudo mover la clase." };
  await Promise.all([
    supabase.from("study_notes").update({ course_id: courseId }).eq("session_id", sessionId),
    supabase.from("class_resources").update({ course_id: courseId }).eq("session_id", sessionId),
  ]);
  revalidatePath("/");
  revalidatePath("/clases");
  revalidatePath(`/clases/${sessionId}`);
  revalidatePath(`/asignaturas/${s.course_id}`);
  revalidatePath(`/asignaturas/${courseId}`);
  await mirrorSession(supabase, sessionId);
  return { ok: true };
}
