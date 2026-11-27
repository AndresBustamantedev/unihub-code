import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasApiError, describeCanvasError } from "@/integrations/canvas/errors";
import { CanvasNotConfiguredError, getCanvasClient } from "@/integrations/canvas/server";
import type { CourseCategory, Database } from "@/lib/supabase/database.types";
import { logger } from "@/lib/redact";
import { classifyCourse } from "./classify";
import { fetchAllCanvasCourses } from "./fetch";

type DB = SupabaseClient<Database>;

const PROVIDER = "canvas";
const RESOURCE = "courses";
/** Una ejecución "running" más antigua que esto se considera colgada. */
const STALE_RUN_MS = 10 * 60 * 1000;

export type SyncResult =
  | { status: "success"; total: number; created: number; missing: number; byCategory: Record<CourseCategory, number> }
  | { status: "already_running" }
  | { status: "error"; code: string; message: string };

/**
 * Importa TODOS los cursos de Canvas para el usuario autenticado.
 * - Idempotente: upsert por (user_id, provider, external_id).
 * - Nunca toca `followed`: la selección del usuario sobrevive a cada sync.
 * - Los cursos que dejan de aparecer se marcan con `missing_since`, no se borran.
 * - Si Canvas falla, los datos anteriores se conservan y el fallo queda en sync_runs.
 */
export async function syncCourses(supabase: DB, userId: string): Promise<SyncResult> {
  const now = new Date();
  const nowIso = now.toISOString();

  // Libera ejecuciones colgadas (p. ej. una función que murió a mitad).
  await supabase
    .from("sync_runs")
    .update({ status: "error", finished_at: nowIso, error_code: "stale", error_message: "Ejecución abandonada" })
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .eq("resource", RESOURCE)
    .eq("status", "running")
    .lt("started_at", new Date(now.getTime() - STALE_RUN_MS).toISOString());

  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ user_id: userId, provider: PROVIDER, resource: RESOURCE, status: "running" })
    .select("id")
    .single();
  if (runError || !run) {
    // 23505 = unique_violation sobre sync_runs_one_running_idx
    if (runError?.code === "23505") return { status: "already_running" };
    logger.error("sync_run_insert_failed", { code: runError?.code ?? null });
    return { status: "error", code: "db", message: "No se pudo registrar la sincronización." };
  }

  const fail = async (code: string, message: string): Promise<SyncResult> => {
    await supabase
      .from("sync_runs")
      .update({ status: "error", finished_at: new Date().toISOString(), error_code: code, error_message: message })
      .eq("id", run.id);
    return { status: "error", code, message };
  };

  try {
    const { client, origin } = getCanvasClient();
    const fetched = await fetchAllCanvasCourses(client);

    const { data: existing, error: existingError } = await supabase
      .from("courses")
      .select("external_id")
      .eq("user_id", userId)
      .eq("provider", PROVIDER);
    if (existingError) return await fail("db", "No se pudieron leer las asignaturas guardadas.");
    const known = new Set((existing ?? []).map((r) => r.external_id));

    const byCategory: Record<CourseCategory, number> = { current: 0, future: 0, past: 0, auxiliary: 0 };
    const rows = fetched.map(({ course, seenAs }) => {
      const { category, reason } = classifyCourse(course, now);
      byCategory[category] += 1;
      const enrollments = course.enrollments ?? [];
      return {
        user_id: userId,
        provider: PROVIDER as "canvas",
        external_id: course.id,
        name: course.name?.trim() || `Curso ${course.id}`,
        course_code: course.course_code ?? null,
        workflow_state: course.workflow_state ?? null,
        enrollment_types: [...new Set(enrollments.map((e) => e.type).filter((t): t is string => !!t))],
        enrollment_states: [...new Set([...enrollments.map((e) => e.enrollment_state).filter((s): s is string => !!s), ...seenAs])],
        term_name: course.term?.name ?? null,
        term_start_at: course.term?.start_at ?? null,
        term_end_at: course.term?.end_at ?? null,
        start_at: course.start_at ?? null,
        end_at: course.end_at ?? null,
        html_url: `${origin}/courses/${course.id}`,
        canvas_image_url: course.image_download_url?.startsWith("https://") ? course.image_download_url : null,
        category,
        category_reason: reason,
        last_seen_at: nowIso,
        last_synced_at: nowIso,
        missing_since: null,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("courses")
        .upsert(rows, { onConflict: "user_id,provider,external_id", ignoreDuplicates: false });
      if (error) {
        logger.error("courses_upsert_failed", { code: error.code ?? null });
        return await fail("db", "No se pudieron guardar las asignaturas.");
      }
    }

    // Marca como desaparecidos los que ya no devuelve Canvas.
    const seenIds = rows.map((r) => r.external_id);
    let missingQuery = supabase
      .from("courses")
      .update({ missing_since: nowIso })
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .is("missing_since", null);
    if (seenIds.length > 0) missingQuery = missingQuery.not("external_id", "in", `(${seenIds.join(",")})`);
    const { data: missingRows } = await missingQuery.select("id");

    const result = {
      status: "success" as const,
      total: rows.length,
      created: seenIds.filter((id) => !known.has(id)).length,
      missing: missingRows?.length ?? 0,
      byCategory,
    };
    await supabase
      .from("sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        stats: { total: result.total, created: result.created, missing: result.missing, byCategory },
      })
      .eq("id", run.id);
    return result;
  } catch (err) {
    if (err instanceof CanvasNotConfiguredError) return await fail("not_configured", "Canvas no está configurado (revisa /diagnostico).");
    if (err instanceof CanvasApiError) return await fail(err.kind, describeCanvasError(err));
    logger.error("courses_sync_crash", { error: err instanceof Error ? err.name : "unknown" });
    return await fail("internal", "Error inesperado durante la sincronización.");
  }
}
