"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultTitle, normalizeUrl } from "./describe";
import { mirrorMaterialNote, mirrorSession } from "@/features/desktop/mirror";

export interface ResourceState {
  error?: string;
  ok?: number;
}

const schema = z.object({
  course_id: z.uuid(),
  session_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  module_item_id: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  url: z.string().max(2000),
  title: z.string().trim().max(200),
  note: z.string().trim().max(500).transform((v) => v || null),
});

function revalidate(courseId: string, sessionId: string | null) {
  revalidatePath(`/asignaturas/${courseId}`);
  revalidatePath("/clases");
  if (sessionId) revalidatePath(`/clases/${sessionId}`);
}

export async function addResourceAction(prev: ResourceState, formData: FormData): Promise<ResourceState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Datos no válidos." };
  const url = normalizeUrl(parsed.data.url);
  if (!url) return { error: "Escribe un enlace válido (https://…)." };
  const supabase = await createSupabaseServerClient();
  // La clase (si hay) debe ser de esa asignatura; RLS garantiza que ambas son del usuario.
  if (parsed.data.module_item_id) {
    const { data } = await supabase.from("course_module_items").select("course_id").eq("id", parsed.data.module_item_id).maybeSingle();
    if (data?.course_id !== parsed.data.course_id) return { error: "Material no encontrado." };
  } else if (parsed.data.session_id) {
    const { data } = await supabase.from("class_sessions").select("course_id").eq("id", parsed.data.session_id).maybeSingle();
    if (data?.course_id !== parsed.data.course_id) return { error: "Clase no encontrada." };
  } else {
    const { data } = await supabase.from("courses").select("id").eq("id", parsed.data.course_id).maybeSingle();
    if (!data) return { error: "Asignatura no encontrada." };
  }
  const { error } = await supabase.from("class_resources").insert({
    user_id: auth.user.id,
    course_id: parsed.data.course_id,
    session_id: parsed.data.session_id,
    module_item_id: parsed.data.module_item_id,
    url,
    title: parsed.data.title || defaultTitle(url),
    note: parsed.data.note,
  });
  if (error) return { error: "No se pudo guardar el enlace." };
  revalidate(parsed.data.course_id, parsed.data.session_id);
  if (parsed.data.module_item_id) revalidatePath(`/material/${parsed.data.module_item_id}`);
  if (parsed.data.session_id) await mirrorSession(supabase, parsed.data.session_id);
  if (parsed.data.module_item_id) await mirrorMaterialNote(supabase, parsed.data.module_item_id);
  return { ok: (prev.ok ?? 0) + 1 };
}

export async function deleteResourceAction(id: string): Promise<void> {
  const auth = await requireUser();
  if (!auth.ok || !z.uuid().safeParse(id).success) return;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("class_resources").delete().eq("id", id).select("course_id, session_id, module_item_id").maybeSingle();
  if (data) revalidate(data.course_id, data.session_id);
  if (data?.module_item_id) revalidatePath(`/material/${data.module_item_id}`);
  if (data?.session_id) await mirrorSession(supabase, data.session_id);
  if (data?.module_item_id) await mirrorMaterialNote(supabase, data.module_item_id);
}
