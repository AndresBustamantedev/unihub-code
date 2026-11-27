"use server";

import { existsSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { isDesktop } from "@/lib/desktop";
import { resolveInRoot } from "@/lib/local-files";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classDirFor, mirrorSession } from "./mirror";

const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv)$/i;

/** Carpeta de la clase dentro de la carpeta de UniHub (la crea con sus .md si aún no existe). */
export async function classFolderAction(sessionId: string): Promise<{ ok: boolean; rel?: string }> {
  const auth = await requireUser();
  if (!isDesktop() || !auth.ok || !z.uuid().safeParse(sessionId).success) return { ok: false };
  const db = await createSupabaseServerClient();
  const { data: s } = await db.from("class_sessions").select("id, course_id, session_at").eq("id", sessionId).maybeSingle();
  if (!s) return { ok: false };
  const { data: course } = await db.from("courses").select("name").eq("id", s.course_id).maybeSingle();
  if (!course) return { ok: false };
  await mirrorSession(db, sessionId);
  return { ok: true, rel: await classDirFor(db, s, course) };
}

/** Asocia a la clase el vídeo ya copiado en su carpeta. */
export async function setLocalVideoAction(sessionId: string, rel: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!isDesktop() || !auth.ok || !z.uuid().safeParse(sessionId).success) return { ok: false, error: "No permitido." };
  const abs = resolveInRoot(rel);
  if (!abs || !VIDEO_EXT.test(rel) || !existsSync(abs)) return { ok: false, error: "No se encuentra el vídeo en la carpeta de UniHub." };
  const db = await createSupabaseServerClient();
  const { error } = await db.from("class_sessions").update({ local_video: rel, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) return { ok: false, error: "No se pudo guardar." };
  revalidatePath(`/clases/${sessionId}`);
  return { ok: true };
}

/** Deja de mostrar el vídeo en la clase (el archivo sigue en la carpeta). */
export async function clearLocalVideoAction(sessionId: string): Promise<void> {
  const auth = await requireUser();
  if (!isDesktop() || !auth.ok || !z.uuid().safeParse(sessionId).success) return;
  const db = await createSupabaseServerClient();
  await db.from("class_sessions").update({ local_video: null }).eq("id", sessionId);
  revalidatePath(`/clases/${sessionId}`);
}
