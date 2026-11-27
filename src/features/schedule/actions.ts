"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ScheduleState {
  error?: string;
  ok?: boolean;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida.");
const slotSchema = z
  .object({
    course_id: z.uuid(),
    weekday: z.coerce.number().int().min(1).max(7),
    start_time: time,
    end_time: time,
    location: z.string().trim().max(200).transform((v) => v || null),
    meeting_url: z
      .string()
      .trim()
      .transform((v) => v || null)
      .pipe(z.url({ protocol: /^https$/, error: "El enlace debe empezar por https://" }).max(2000).nullable()),
  })
  .refine((v) => v.end_time > v.start_time, { message: "La hora de fin debe ser posterior a la de inicio.", path: ["end_time"] });

export async function addScheduleSlotAction(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };
  const parsed = slotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const supabase = await createSupabaseServerClient();
  const { data: course } = await supabase.from("courses").select("id").eq("id", parsed.data.course_id).maybeSingle();
  if (!course) return { error: "Asignatura no encontrada." };
  const { error } = await supabase.from("class_schedule").insert({ ...parsed.data, user_id: auth.user.id });
  if (error) return { error: "No se pudo guardar la franja." };
  revalidatePath("/");
  revalidatePath(`/asignaturas/${parsed.data.course_id}`);
  return { ok: true };
}

export async function deleteScheduleSlotAction(id: string): Promise<void> {
  const auth = await requireUser();
  if (!auth.ok || !z.uuid().safeParse(id).success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("class_schedule").delete().eq("id", id).select("course_id").maybeSingle();
  revalidatePath("/");
  if (data) revalidatePath(`/asignaturas/${data.course_id}`);
}

const endSchema = z.object({ course_id: z.uuid(), date: z.iso.date().nullable() });

/**
 * Último día de clases de una asignatura (o null para reanudarlas). Después de esa fecha
 * no se muestran sus clases en el calendario ni se avisa de clases sin importar.
 */
export async function setClassesEndAction(courseId: string, date: string | null): Promise<{ ok: boolean }> {
  const auth = await requireUser();
  const parsed = endSchema.safeParse({ course_id: courseId, date });
  if (!auth.ok || !parsed.success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("courses").update({ classes_end_on: parsed.data.date }).eq("id", parsed.data.course_id);
  if (error) return { ok: false };
  revalidatePath("/");
  revalidatePath("/clases");
  revalidatePath(`/asignaturas/${parsed.data.course_id}`);
  return { ok: true };
}

/** Desde el aviso de "falta importar": las clases terminaron antes de ese día. */
export async function classesEndedBeforeAction(courseId: string, date: string): Promise<void> {
  if (!z.iso.date().safeParse(date).success) return;
  const prev = new Date(`${date}T12:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  await setClassesEndAction(courseId, prev.toISOString().slice(0, 10));
}
