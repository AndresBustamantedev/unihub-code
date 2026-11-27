import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanvasClient } from "@/integrations/canvas/client";
import { CanvasApiError, describeCanvasError } from "@/integrations/canvas/errors";
import { CanvasNotConfiguredError, getCanvasClient } from "@/integrations/canvas/server";
import type { CanvasCalendarEvent, CanvasFile, CanvasModule, CanvasModuleItem, CanvasPage } from "@/integrations/canvas/types";
import type { CourseRow, Database, Json, MaterialsResource, ResourceStatus } from "@/lib/supabase/database.types";
import { htmlToText } from "@/lib/html";
import { logger } from "@/lib/redact";
import { finishRun, startRun } from "@/features/sync/runs";
import { diffMaterials, type MaterialChange } from "./map";

type DB = SupabaseClient<Database>;
type CourseRef = Pick<CourseRow, "id" | "external_id" | "name" | "materials_synced_at" | "materials_status">;

const CALENDAR_BACK_DAYS = 1;
const CALENDAR_AHEAD_DAYS = 30;

export type MaterialsSyncResult =
  | { status: "success" | "partial"; courses: number; failed: string[]; changes: number }
  | { status: "already_running" }
  | { status: "error"; code: string; message: string };

type Fetched<T> = { status: "ok"; data: T } | { status: "unavailable" } | { status: "error"; error: unknown };

/** 401/403/404 en un recurso concreto = la institución lo oculta; no es un fallo ni "vacío". */
async function tryResource<T>(fn: () => Promise<T>): Promise<Fetched<T>> {
  try {
    return { status: "ok", data: await fn() };
  } catch (err) {
    if (err instanceof CanvasApiError && (err.kind === "unauthorized" || err.kind === "forbidden" || err.kind === "not_found")) {
      return { status: "unavailable" };
    }
    return { status: "error", error: err };
  }
}

function statusOf(f: Fetched<unknown>): ResourceStatus {
  return f.status;
}

/**
 * Módulos, archivos, páginas y calendario de las asignaturas seguidas.
 * Solo metadatos y enlaces: nunca se descargan archivos ni se guardan cuerpos de páginas.
 */
export async function syncMaterials(db: DB, userId: string): Promise<MaterialsSyncResult> {
  const run = await startRun(db, userId, "canvas", "materials");
  if (!run.ok) return run.reason === "already_running" ? { status: "already_running" } : { status: "error", code: "db", message: "No se pudo registrar la sincronización." };

  const fail = async (code: string, message: string): Promise<MaterialsSyncResult> => {
    await finishRun(db, run.id, { status: "error", code, message });
    return { status: "error", code, message };
  };

  const { data: courses, error } = await db
    .from("courses")
    .select("id, external_id, name, materials_synced_at, materials_status")
    .eq("user_id", userId)
    .eq("followed", true)
    .is("missing_since", null);
  if (error) return fail("db", "No se pudieron leer las asignaturas seguidas.");
  if (!courses?.length) {
    await finishRun(db, run.id, { status: "success", stats: { courses: 0 } });
    return { status: "success", courses: 0, failed: [], changes: 0 };
  }

  let canvas: ReturnType<typeof getCanvasClient>;
  try {
    canvas = getCanvasClient();
  } catch (err) {
    return fail("not_configured", err instanceof CanvasNotConfiguredError ? "Canvas no está configurado (revisa /diagnostico)." : "Error inesperado.");
  }
  const { client, origin } = canvas;
  const now = new Date();
  const nowIso = now.toISOString();

  // Calendario: una petición para todas las asignaturas.
  const windowStart = new Date(now.getTime() - CALENDAR_BACK_DAYS * 86_400_000);
  const windowEnd = new Date(now.getTime() + CALENDAR_AHEAD_DAYS * 86_400_000);
  const calendar = await tryResource(() =>
    client.getAll<CanvasCalendarEvent>(
      "calendar_events",
      { type: "event", "context_codes[]": courses.map((c) => `course_${c.external_id}`), start_date: windowStart.toISOString(), end_date: windowEnd.toISOString() },
      5,
    ),
  );

  const failed: string[] = [];
  let firstError: unknown = null;
  let totalChanges = 0;
  for (const course of courses) {
    try {
      const events = calendar.status === "ok" ? calendar.data.filter((e) => e.context_code === `course_${course.external_id}`) : null;
      totalChanges += await syncOneCourse(db, client, origin, userId, course, events, { nowIso, windowStart, windowEnd });
    } catch (err) {
      failed.push(course.name);
      firstError ??= err;
      logger.warn("materials_course_failed", { course: course.external_id, kind: err instanceof CanvasApiError ? err.kind : err instanceof Error ? err.message.slice(0, 80) : "unknown" });
    }
  }

  const stats: Json = { courses: courses.length, failed: failed.length, changes: totalChanges, calendar: calendar.status };
  if (failed.length === courses.length) {
    const message = firstError instanceof CanvasApiError ? describeCanvasError(firstError) : "No se pudo sincronizar ningún material.";
    await finishRun(db, run.id, { status: "error", code: firstError instanceof CanvasApiError ? firstError.kind : "internal", message, stats });
    return { status: "error", code: "all_failed", message };
  }
  if (failed.length > 0 || calendar.status === "error") {
    const message = [failed.length ? `Materiales: falló ${failed.length} de ${courses.length} (${failed.join(", ")}).` : "", calendar.status === "error" ? "No se pudo leer el calendario." : ""].filter(Boolean).join(" ");
    await finishRun(db, run.id, { status: "error", code: "partial", message, stats });
    return { status: "partial", courses: courses.length, failed, changes: totalChanges };
  }
  await finishRun(db, run.id, { status: "success", stats });
  return { status: "success", courses: courses.length, failed: [], changes: totalChanges };
}

async function syncOneCourse(
  db: DB,
  client: CanvasClient,
  origin: string,
  userId: string,
  course: CourseRef,
  events: CanvasCalendarEvent[] | null,
  w: { nowIso: string; windowStart: Date; windowEnd: Date },
): Promise<number> {
  const ext = course.external_id;
  const prevStatus = (course.materials_status ?? {}) as Partial<Record<MaterialsResource, ResourceStatus>>;
  const firstTime = course.materials_synced_at === null;
  const base = { user_id: userId, course_id: course.id, provider: "canvas" as const, last_synced_at: w.nowIso, missing_since: null };

  const [modulesRes, filesRes, pagesRes] = [
    await tryResource(async () => {
      const mods = await client.getAll<CanvasModule>(`courses/${ext}/modules`, { "include[]": ["items"] }, 10);
      // Canvas omite `items` en módulos grandes: se piden aparte.
      for (const m of mods) {
        if (!m.items && (m.items_count ?? 0) > 0) m.items = await client.getAll<CanvasModuleItem>(`courses/${ext}/modules/${m.id}/items`, undefined, 5);
      }
      return mods;
    }),
    await tryResource(() => client.getAll<CanvasFile>(`courses/${ext}/files`, { sort: "created_at", order: "desc" }, 5)),
    await tryResource(() => client.getAll<CanvasPage>(`courses/${ext}/pages`, { sort: "updated_at", order: "desc", published: true }, 3)),
  ];

  const results = { modules: modulesRes, files: filesRes, pages: pagesRes };
  const hardError = Object.values(results).find((r) => r.status === "error");
  if (hardError && hardError.status === "error") throw hardError.error;
  if (Object.values(results).every((r) => r.status === "unavailable")) throw new CanvasApiError("forbidden", "Sin acceso a materiales", 403);

  const changes: MaterialChange[] = [];
  const entityIds = new Map<string, string>(); // `${type}:${external_id}` -> uuid

  // ── Módulos e ítems ──
  if (modulesRes.status === "ok") {
    const mods = modulesRes.data;
    const [{ data: knownMods }, { data: knownItems }] = await Promise.all([
      db.from("course_modules").select("external_id").eq("user_id", userId).eq("course_id", course.id),
      db.from("course_module_items").select("external_id").eq("user_id", userId).eq("course_id", course.id),
    ]);
    const moduleRows = mods.map((m) => ({
      ...base,
      external_id: m.id,
      name: m.name?.trim() || `Módulo ${m.position ?? m.id}`,
      position: m.position ?? null,
      unlock_at: m.unlock_at ?? null,
      state: m.state ?? null,
      items_count: m.items_count ?? m.items?.length ?? 0,
    }));
    const moduleIdByExt = new Map<number, string>();
    if (moduleRows.length) {
      const { data, error } = await db.from("course_modules").upsert(moduleRows, { onConflict: "user_id,provider,external_id" }).select("id, external_id");
      if (error) throw new Error("db_upsert_modules");
      for (const r of data ?? []) {
        moduleIdByExt.set(r.external_id, r.id);
        entityIds.set(`module:${r.external_id}`, r.id);
      }
    }
    const itemRows = mods.flatMap((m) =>
      (m.items ?? [])
        .filter((i) => typeof i.id === "number" && moduleIdByExt.has(m.id))
        .map((i) => ({
          ...base,
          module_id: moduleIdByExt.get(m.id)!,
          external_id: i.id,
          title: i.title?.trim() || "(sin título)",
          item_type: i.type ?? "Unknown",
          position: i.position ?? null,
          indent: i.indent ?? 0,
          content_id: i.content_id ?? null,
          html_url: i.html_url ?? null,
          external_url: i.external_url ?? null,
        })),
    );
    if (itemRows.length) {
      const { error } = await db.from("course_module_items").upsert(itemRows, { onConflict: "user_id,provider,external_id" });
      if (error) throw new Error("db_upsert_module_items");
    }
    await markMissing(db, "course_modules", userId, course.id, moduleRows.map((r) => r.external_id), w.nowIso);
    await markMissing(db, "course_module_items", userId, course.id, itemRows.map((r) => r.external_id), w.nowIso);

    changes.push(
      ...diffMaterials({
        baseline: firstTime || prevStatus.modules !== "ok",
        knownFileIds: new Set(),
        files: [],
        knownModuleIds: new Set((knownMods ?? []).map((k) => k.external_id)),
        modules: moduleRows.map((r) => ({ external_id: r.external_id, name: r.name, html_url: `${origin}/courses/${ext}/modules#module_${r.external_id}` })),
        knownItemIds: new Set((knownItems ?? []).map((k) => k.external_id)),
        items: mods.flatMap((m) => (m.items ?? []).map((i) => ({ external_id: i.id, module_external_id: m.id, title: i.title ?? "", item_type: i.type ?? "" }))),
      }),
    );
  }

  // ── Archivos ──
  if (filesRes.status === "ok") {
    const { data: known } = await db.from("course_files").select("external_id").eq("user_id", userId).eq("course_id", course.id);
    const fileRows = filesRes.data
      .filter((f) => typeof f.id === "number")
      .map((f) => ({
        ...base,
        external_id: f.id,
        display_name: f.display_name?.trim() || f.filename || `Archivo ${f.id}`,
        content_type: f["content-type"] ?? null,
        size_bytes: f.size ?? null,
        canvas_created_at: f.created_at ?? null,
        canvas_updated_at: f.modified_at ?? f.updated_at ?? null,
        // Vista del archivo en Canvas; NO la URL de descarga firmada (lleva un verificador).
        html_url: `${origin}/courses/${ext}/files/${f.id}`,
      }));
    if (fileRows.length) {
      const { data, error } = await db.from("course_files").upsert(fileRows, { onConflict: "user_id,provider,external_id" }).select("id, external_id");
      if (error) throw new Error("db_upsert_files");
      for (const r of data ?? []) entityIds.set(`file:${r.external_id}`, r.id);
    }
    await markMissing(db, "course_files", userId, course.id, fileRows.map((r) => r.external_id), w.nowIso);
    changes.push(
      ...diffMaterials({
        baseline: firstTime || prevStatus.files !== "ok",
        knownFileIds: new Set((known ?? []).map((k) => k.external_id)),
        files: fileRows.map((r) => ({ external_id: r.external_id, display_name: r.display_name, html_url: r.html_url })),
        knownModuleIds: new Set(),
        modules: [],
        knownItemIds: new Set(),
        items: [],
      }),
    );
  }

  // ── Páginas (sin cuerpo) ──
  if (pagesRes.status === "ok") {
    const pageRows = pagesRes.data
      .filter((p) => typeof p.page_id === "number")
      .map((p) => ({
        ...base,
        external_id: p.page_id,
        slug: p.url ?? null,
        title: p.title?.trim() || "(sin título)",
        front_page: !!p.front_page,
        canvas_updated_at: p.updated_at ?? null,
        html_url: p.html_url ?? (p.url ? `${origin}/courses/${ext}/pages/${p.url}` : null),
      }));
    if (pageRows.length) {
      const { error } = await db.from("course_pages").upsert(pageRows, { onConflict: "user_id,provider,external_id" });
      if (error) throw new Error("db_upsert_pages");
    }
    await markMissing(db, "course_pages", userId, course.id, pageRows.map((r) => r.external_id), w.nowIso);
  }

  // ── Calendario (solo la ventana consultada) ──
  if (events !== null) {
    const eventRows = events
      .map((e) => ({ e, id: typeof e.id === "number" ? e.id : Number(e.id) }))
      .filter(({ e, id }) => Number.isFinite(id) && e.workflow_state !== "deleted")
      .map(({ e, id }) => ({
        ...base,
        external_id: id,
        title: e.title?.trim() || "(evento sin título)",
        start_at: e.start_at ?? null,
        end_at: e.end_at ?? null,
        all_day: !!e.all_day,
        location_name: e.location_name ?? null,
        description_text: htmlToText(e.description, 400),
        html_url: e.html_url ?? null,
        online_meeting_url: e.online_meeting_url ?? null,
      }));
    if (eventRows.length) {
      const { error } = await db.from("calendar_events").upsert(eventRows, { onConflict: "user_id,provider,external_id" });
      if (error) throw new Error("db_upsert_events");
    }
    let q = db
      .from("calendar_events")
      .update({ missing_since: w.nowIso })
      .eq("user_id", userId)
      .eq("course_id", course.id)
      .is("missing_since", null)
      .gte("start_at", w.windowStart.toISOString())
      .lte("start_at", w.windowEnd.toISOString());
    if (eventRows.length) q = q.not("external_id", "in", `(${eventRows.map((r) => r.external_id).join(",")})`);
    await q;
  }

  // ── Novedades ──
  if (changes.length) {
    const { error } = await db.from("changes").upsert(
      changes.map((c) => ({
        user_id: userId,
        course_id: course.id,
        entity_type: c.entity_type,
        entity_id: entityIds.get(`${c.entity_type}:${c.external_id}`) ?? null,
        external_id: c.external_id,
        kind: c.kind,
        title: c.title,
        detail: c.detail,
        dedupe_key: c.dedupe_key,
        detected_at: w.nowIso,
      })),
      { onConflict: "user_id,entity_type,external_id,kind,dedupe_key", ignoreDuplicates: true },
    );
    if (error) throw new Error("db_insert_changes");
  }

  const materialsStatus = { modules: statusOf(modulesRes), files: statusOf(filesRes), pages: statusOf(pagesRes) };
  await db.from("courses").update({ materials_synced_at: w.nowIso, materials_status: materialsStatus }).eq("user_id", userId).eq("id", course.id);
  return changes.length;
}

type MissingTable = "course_modules" | "course_module_items" | "course_files" | "course_pages";

async function markMissing(db: DB, table: MissingTable, userId: string, courseId: string, seen: number[], nowIso: string) {
  let q = db.from(table).update({ missing_since: nowIso }).eq("user_id", userId).eq("course_id", courseId).is("missing_since", null);
  if (seen.length) q = q.not("external_id", "in", `(${seen.join(",")})`);
  await q;
}
