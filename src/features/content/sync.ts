import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasApiError, describeCanvasError } from "@/integrations/canvas/errors";
import { CanvasNotConfiguredError, getCanvasClient } from "@/integrations/canvas/server";
import type { CanvasAnnouncement, CanvasAssignment } from "@/integrations/canvas/types";
import type { CourseRow, Database } from "@/lib/supabase/database.types";
import { logger } from "@/lib/redact";
import { finishRun, startRun } from "@/features/sync/runs";
import { diffAssignments, mapAnnouncement, mapAssignment, type ChangeDraft } from "./map";

type DB = SupabaseClient<Database>;
const ANNOUNCEMENT_LOOKBACK_DAYS = 120;

export type ContentSyncResult =
  | { status: "success"; courses: number; assignments: number; announcements: number; changes: number }
  | { status: "partial"; courses: number; failed: string[]; changes: number }
  | { status: "already_running" }
  | { status: "error"; code: string; message: string };

type CourseRef = Pick<CourseRow, "id" | "external_id" | "name" | "content_synced_at">;

/**
 * Sincroniza tareas y anuncios de las asignaturas SEGUIDAS.
 * Cada asignatura se procesa de forma independiente: si una falla, las demás se guardan
 * y la ejecución queda marcada como error parcial (los datos viejos de la que falló se conservan).
 */
export async function syncContent(supabase: DB, userId: string): Promise<ContentSyncResult> {
  const run = await startRun(supabase, userId, "canvas", "content");
  if (!run.ok) {
    return run.reason === "already_running"
      ? { status: "already_running" }
      : { status: "error", code: "db", message: "No se pudo registrar la sincronización." };
  }

  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, external_id, name, content_synced_at")
    .eq("user_id", userId)
    .eq("followed", true)
    .is("missing_since", null);
  if (coursesError) {
    await finishRun(supabase, run.id, { status: "error", code: "db", message: "No se pudieron leer las asignaturas seguidas." });
    return { status: "error", code: "db", message: "No se pudieron leer las asignaturas seguidas." };
  }
  if (!courses || courses.length === 0) {
    await finishRun(supabase, run.id, { status: "success", stats: { courses: 0 } });
    return { status: "success", courses: 0, assignments: 0, announcements: 0, changes: 0 };
  }

  let canvas: ReturnType<typeof getCanvasClient>;
  try {
    canvas = getCanvasClient();
  } catch (err) {
    const message = err instanceof CanvasNotConfiguredError ? "Canvas no está configurado (revisa /diagnostico)." : "Error inesperado.";
    await finishRun(supabase, run.id, { status: "error", code: "not_configured", message });
    return { status: "error", code: "not_configured", message };
  }
  const { client } = canvas;
  const now = new Date();
  const nowIso = now.toISOString();

  // Anuncios: una sola petición para todas las asignaturas seguidas.
  let announcementsByCourse: Map<number, CanvasAnnouncement[]> | null = new Map();
  try {
    const start = new Date(now.getTime() - ANNOUNCEMENT_LOOKBACK_DAYS * 86_400_000).toISOString();
    const end = new Date(now.getTime() + 86_400_000).toISOString();
    const list = await client.getAll<CanvasAnnouncement>("announcements", {
      "context_codes[]": courses.map((c) => `course_${c.external_id}`),
      start_date: start,
      end_date: end,
      active_only: true,
    });
    for (const a of list) {
      const ext = Number(a.context_code?.replace(/^course_/, ""));
      if (!Number.isFinite(ext)) continue;
      const arr = announcementsByCourse.get(ext) ?? [];
      arr.push(a);
      announcementsByCourse.set(ext, arr);
    }
  } catch (err) {
    logger.warn("announcements_fetch_failed", { kind: err instanceof CanvasApiError ? err.kind : "unknown" });
    announcementsByCourse = null; // no tocar anuncios guardados
  }

  const failed: string[] = [];
  let firstError: CanvasApiError | null = null;
  let totalAssignments = 0;
  let totalAnnouncements = 0;
  let totalChanges = 0;

  for (const course of courses) {
    try {
      const r = await syncOneCourse(supabase, client, userId, course, announcementsByCourse?.get(course.external_id) ?? (announcementsByCourse ? [] : null), nowIso);
      totalAssignments += r.assignments;
      totalAnnouncements += r.announcements;
      totalChanges += r.changes;
    } catch (err) {
      failed.push(course.name);
      if (err instanceof CanvasApiError && !firstError) firstError = err;
      logger.warn("course_content_sync_failed", { course: course.external_id, kind: err instanceof CanvasApiError ? err.kind : err instanceof Error ? err.message.slice(0, 80) : "unknown" });
    }
  }

  const stats = { courses: courses.length, assignments: totalAssignments, announcements: totalAnnouncements, changes: totalChanges, failed: failed.length, announcementsOk: announcementsByCourse !== null };
  if (failed.length === courses.length) {
    const message = firstError ? describeCanvasError(firstError) : "No se pudo sincronizar ninguna asignatura.";
    await finishRun(supabase, run.id, { status: "error", code: firstError?.kind ?? "internal", message, stats });
    return { status: "error", code: firstError?.kind ?? "internal", message };
  }
  if (failed.length > 0 || announcementsByCourse === null) {
    const parts = [
      failed.length > 0 ? `Falló ${failed.length} de ${courses.length}: ${failed.join(", ")}.` : "",
      announcementsByCourse === null ? "No se pudieron leer los anuncios." : "",
    ].filter(Boolean);
    await finishRun(supabase, run.id, { status: "error", code: "partial", message: parts.join(" "), stats });
    return { status: "partial", courses: courses.length, failed, changes: totalChanges };
  }
  await finishRun(supabase, run.id, { status: "success", stats });
  return { status: "success", courses: courses.length, assignments: totalAssignments, announcements: totalAnnouncements, changes: totalChanges };
}

async function syncOneCourse(
  supabase: DB,
  client: ReturnType<typeof getCanvasClient>["client"],
  userId: string,
  course: CourseRef,
  announcements: CanvasAnnouncement[] | null,
  nowIso: string,
): Promise<{ assignments: number; announcements: number; changes: number }> {
  const baseline = course.content_synced_at === null;
  const ctx = { userId, courseId: course.id, nowIso };

  // ── Tareas ──
  const raw = await client.getAll<CanvasAssignment>(`courses/${course.external_id}/assignments`, {
    "include[]": ["submission"],
    order_by: "due_at",
  });
  const rows = raw.filter((a) => a.published !== false && typeof a.id === "number").map((a) => mapAssignment(a, ctx));

  const { data: prev, error: prevError } = await supabase
    .from("assignments")
    .select("id, external_id, name, due_at, submission_state, missing_since")
    .eq("user_id", userId)
    .eq("course_id", course.id);
  if (prevError) throw new Error("db_read_assignments");

  const changes: ChangeDraft[] = diffAssignments(prev ?? [], rows, baseline);

  const idByExternal = new Map<number, string>((prev ?? []).map((p) => [p.external_id, p.id]));
  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from("assignments")
      .upsert(rows, { onConflict: "user_id,provider,external_id" })
      .select("id, external_id");
    if (error) throw new Error("db_upsert_assignments");
    for (const u of upserted ?? []) idByExternal.set(u.external_id, u.id);
  }
  const seen = rows.map((r) => r.external_id);
  let missingQ = supabase.from("assignments").update({ missing_since: nowIso }).eq("user_id", userId).eq("course_id", course.id).is("missing_since", null);
  if (seen.length > 0) missingQ = missingQ.not("external_id", "in", `(${seen.join(",")})`);
  await missingQ;

  // ── Anuncios ──
  let announcementCount = 0;
  const announcementIds = new Map<number, string>();
  if (announcements !== null) {
    const { data: known } = await supabase.from("announcements").select("external_id").eq("user_id", userId).eq("course_id", course.id);
    const knownIds = new Set((known ?? []).map((k) => k.external_id));
    const aRows = announcements.filter((a) => typeof a.id === "number").map((a) => mapAnnouncement(a, ctx));
    if (aRows.length > 0) {
      const { data: up, error } = await supabase
        .from("announcements")
        .upsert(aRows, { onConflict: "user_id,provider,external_id" })
        .select("id, external_id");
      if (error) throw new Error("db_upsert_announcements");
      for (const u of up ?? []) announcementIds.set(u.external_id, u.id);
    }
    announcementCount = aRows.length;
    if (!baseline) {
      for (const a of aRows) {
        if (!knownIds.has(a.external_id)) {
          changes.push({ kind: "new_announcement", external_id: a.external_id, title: a.title, detail: { author: a.author_name, posted_at: a.posted_at }, dedupe_key: "" });
        }
      }
    }
  }

  // ── Novedades (idempotente por dedupe_key) ──
  if (changes.length > 0) {
    const changeRows = changes.map((c) => ({
      user_id: userId,
      course_id: course.id,
      entity_type: c.kind === "new_announcement" ? ("announcement" as const) : ("assignment" as const),
      entity_id: (c.kind === "new_announcement" ? announcementIds : idByExternal).get(c.external_id) ?? null,
      external_id: c.external_id,
      kind: c.kind,
      title: c.title,
      detail: c.detail,
      dedupe_key: c.dedupe_key,
      detected_at: nowIso,
    }));
    const { error } = await supabase
      .from("changes")
      .upsert(changeRows, { onConflict: "user_id,entity_type,external_id,kind,dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error("db_insert_changes");
  }

  await supabase.from("courses").update({ content_synced_at: nowIso }).eq("user_id", userId).eq("id", course.id);
  return { assignments: rows.length, announcements: announcementCount, changes: changes.length };
}
