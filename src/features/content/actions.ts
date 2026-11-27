"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncCourses } from "@/features/courses/sync";
import { syncContent } from "./sync";
import { syncMaterials } from "@/features/materials/sync";
import { syncInbox } from "@/features/inbox/sync";
import { syncPeopleAndSyllabus } from "@/features/people/sync";

export type SyncAllResult =
  | { status: "unauthorized" }
  | { status: "already_running" }
  | { status: "done"; ok: boolean; message: string };

/** Sincroniza asignaturas y después tareas, anuncios y materiales de las seguidas. */
export async function syncAllAction(): Promise<SyncAllResult> {
  const auth = await requireUser();
  if (!auth.ok) return { status: "unauthorized" };
  const supabase = await createSupabaseServerClient();

  const courses = await syncCourses(supabase, auth.user.id);
  if (courses.status === "already_running") return { status: "already_running" };
  // Aunque fallen las asignaturas, intentamos el contenido con lo que ya hay guardado.
  const content = await syncContent(supabase, auth.user.id);
  const materials = await syncMaterials(supabase, auth.user.id);
  const inbox = await syncInbox(supabase, auth.user.id);
  await syncPeopleAndSyllabus(supabase, auth.user.id);
  for (const p of ["/", "/asignaturas", "/tareas", "/novedades"]) revalidatePath(p);
  revalidatePath("/asignaturas/[id]", "page");

  if (content.status === "already_running" || materials.status === "already_running" || inbox.status === "already_running") return { status: "already_running" };
  const ok = courses.status === "success" && content.status === "success" && materials.status === "success" && inbox.status === "success";
  const message =
    content.status === "success"
      ? content.courses === 0
        ? "Sin asignaturas seguidas."
        : `${content.assignments} tareas · ${content.changes + (materials.status === "success" || materials.status === "partial" ? materials.changes : 0)} novedades${materials.status === "success" ? "" : " · materiales con problemas"}${inbox.status === "success" && inbox.unread ? ` · ${inbox.unread} mensajes sin leer` : inbox.status === "success" ? "" : " · mensajes con problemas"}`
      : content.status === "partial"
        ? `Parcial: fallaron ${content.failed.length}`
        : "Falló (ver aviso).";
  return { status: "done", ok, message: courses.status === "success" ? message : "Falló la lista de asignaturas (ver aviso)." };
}

const idsSchema = z.array(z.uuid()).max(500);

export async function markChangesReadAction(ids: string[] | "all"): Promise<{ ok: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("changes").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids !== "all") {
    const parsed = idsSchema.safeParse(ids);
    if (!parsed.success || parsed.data.length === 0) return { ok: false };
    q = q.in("id", parsed.data);
  }
  const { error } = await q;
  revalidatePath("/");
  revalidatePath("/novedades");
  return { ok: !error };
}
