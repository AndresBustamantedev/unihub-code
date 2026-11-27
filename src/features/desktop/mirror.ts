import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionToMarkdown } from "@/features/classes/markdown";
import { displayCourseName } from "@/lib/course-color";
import { isDesktop } from "@/lib/desktop";
import { courseDir, filesRoot, relPath, writeTextFile } from "@/lib/local-files";
import { logger } from "@/lib/redact";
import type { Database, NoteKind } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

/**
 * Copia en archivos .md (en la carpeta de UniHub) lo que se guarda en la base de datos:
 * transcripciones, apuntes de IA, notas y enlaces. Así se pueden abrir con cualquier editor,
 * subir a Drive o llevar a Notion/NotebookLM. La base de datos sigue siendo la fuente de verdad:
 * estos archivos se regeneran (no se leen).
 *
 * Estructura:
 *   <Asignatura>/Clases/<AAAA-MM-DD>/transcripcion.md · apuntes - <tipo>.md · enlaces.md · video.mp4
 *   <Asignatura>/Material/<NN Tema>/<archivo> y <archivo> - notas.md
 */

const NOTE_FILE: Record<NoteKind, string> = {
  summary: "apuntes - resumen",
  questions: "apuntes - preguntas de repaso",
  exercises: "apuntes - ejercicios",
};

export function mirrorEnabled(): boolean {
  return isDesktop() && !!filesRoot();
}

/** Carpeta de una clase: la fecha (y " (2)"… si hay varias ese día en la asignatura). */
export async function classDirFor(db: DB, session: { id: string; course_id: string; session_at: string }, course: { name: string }): Promise<string> {
  const day = session.session_at.slice(0, 10);
  const { data: sameDay } = await db
    .from("class_sessions")
    .select("id, created_at")
    .eq("course_id", session.course_id)
    .gte("session_at", `${day}T00:00:00Z`)
    .lte("session_at", `${day}T23:59:59Z`)
    .order("created_at");
  const idx = Math.max(0, (sameDay ?? []).findIndex((s) => s.id === session.id));
  return relPath(courseDir(course), "Clases", idx ? `${day} (${idx + 1})` : day);
}

/** Carpeta de un tema: "NN Nombre del tema" en el orden de Canvas. */
export async function moduleDirFor(db: DB, courseId: string, moduleId: string, course: { name: string }): Promise<string> {
  const { data: modules } = await db.from("course_modules").select("id, name, position").eq("course_id", courseId).order("position", { ascending: true, nullsFirst: false });
  const list = modules ?? [];
  const i = list.findIndex((m) => m.id === moduleId);
  const name = i >= 0 ? list[i]!.name : "Otros";
  return relPath(courseDir(course), "Material", `${String(i >= 0 ? i + 1 : 99).padStart(2, "0")} ${name}`);
}

/** Escribe (o reescribe) los archivos de una clase. */
export async function mirrorSession(db: DB, sessionId: string): Promise<string | null> {
  if (!mirrorEnabled()) return null;
  try {
    const { data: s } = await db.from("class_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!s) return null;
    const [{ data: course }, { data: t }, { data: notes }, { data: links }] = await Promise.all([
      db.from("courses").select("name").eq("id", s.course_id).maybeSingle(),
      db.from("transcripts").select("content_text, speakers").eq("session_id", sessionId).maybeSingle(),
      db.from("study_notes").select("kind, content_md, created_at, model").eq("session_id", sessionId),
      db.from("class_resources").select("title, url, note").eq("session_id", sessionId).order("created_at"),
    ]);
    if (!course) return null;
    const dir = await classDirFor(db, s, course);
    const courseName = displayCourseName(course.name);
    writeTextFile(`${dir}/transcripcion.md`, sessionToMarkdown(s, courseName, t ?? null));
    for (const n of notes ?? []) {
      writeTextFile(`${dir}/${NOTE_FILE[n.kind]}.md`, `# ${s.title}\n\n_${courseName} · generado con ${n.model} el ${n.created_at.slice(0, 10)}_\n\n${n.content_md}\n`);
    }
    if (links?.length) {
      writeTextFile(`${dir}/enlaces.md`, `# Enlaces de refuerzo · ${s.title}\n\n${links.map((l) => `- [${l.title}](${l.url})${l.note ? ` — ${l.note}` : ""}`).join("\n")}\n`);
    }
    return dir;
  } catch (err) {
    logger.warn("mirror_session_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return null;
  }
}

/** Escribe las notas (y enlaces) de un archivo del material junto a él. */
export async function mirrorMaterialNote(db: DB, itemId: string): Promise<void> {
  if (!mirrorEnabled()) return;
  try {
    const { data: item } = await db.from("course_module_items").select("id, course_id, module_id, title").eq("id", itemId).maybeSingle();
    if (!item) return;
    const [{ data: course }, { data: note }, { data: links }] = await Promise.all([
      db.from("courses").select("name").eq("id", item.course_id).maybeSingle(),
      db.from("material_notes").select("content_md").eq("module_item_id", itemId).maybeSingle(),
      db.from("class_resources").select("title, url, note").eq("module_item_id", itemId).order("created_at"),
    ]);
    if (!course || (!note?.content_md.trim() && !links?.length)) return;
    const dir = await moduleDirFor(db, item.course_id, item.module_id, course);
    const base = item.title.replace(/\.[a-z0-9]{2,5}$/i, "");
    const body = [
      `# Notas · ${item.title}`,
      "",
      note?.content_md.trim() ?? "",
      links?.length ? `\n## Enlaces de refuerzo\n\n${links.map((l) => `- [${l.title}](${l.url})${l.note ? ` — ${l.note}` : ""}`).join("\n")}` : "",
    ].join("\n");
    writeTextFile(`${dir}/${relPath(`${base} - notas.md`)}`, `${body.trim()}\n`);
  } catch (err) {
    logger.warn("mirror_material_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
  }
}

/** Regenera todos los archivos .md (tras importar de la web o si se borraron). */
export async function mirrorAll(db: DB): Promise<{ classes: number; materials: number }> {
  if (!mirrorEnabled()) return { classes: 0, materials: 0 };
  const [{ data: sessions }, { data: matNotes }, { data: matLinks }] = await Promise.all([
    db.from("class_sessions").select("id"),
    db.from("material_notes").select("module_item_id"),
    db.from("class_resources").select("module_item_id").not("module_item_id", "is", null),
  ]);
  let classes = 0;
  for (const s of sessions ?? []) if (await mirrorSession(db, s.id)) classes++;
  const items = new Set([...(matNotes ?? []).map((n) => n.module_item_id), ...(matLinks ?? []).map((l) => l.module_item_id!).filter(Boolean)]);
  for (const id of items) await mirrorMaterialNote(db, id);
  return { classes, materials: items.size };
}
