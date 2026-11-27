import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CanvasApiError, describeCanvasError } from "@/integrations/canvas/errors";
import { CanvasNotConfiguredError, getCanvasClient } from "@/integrations/canvas/server";
import type { CanvasConversation, CanvasStreamItem } from "@/integrations/canvas/types";
import type { Database } from "@/lib/supabase/database.types";
import { logger } from "@/lib/redact";
import { finishRun, startRun } from "@/features/sync/runs";
import { diffConversations, mapActivity, mapConversation } from "./map";

type DB = SupabaseClient<Database>;
type Status = "ok" | "unavailable" | "error";

export type InboxSyncResult =
  | { status: "success" | "partial"; conversations: Status; activity: Status; changes: number; unread: number | null }
  | { status: "already_running" }
  | { status: "error"; message: string };

async function attempt<T>(fn: () => Promise<T>): Promise<{ status: "ok"; data: T } | { status: "unavailable" | "error"; error?: unknown }> {
  try {
    return { status: "ok", data: await fn() };
  } catch (err) {
    if (err instanceof CanvasApiError && (err.kind === "unauthorized" || err.kind === "forbidden" || err.kind === "not_found")) return { status: "unavailable" };
    return { status: "error", error: err };
  }
}

/**
 * Bandeja de entrada y flujo de actividad de Canvas (todas las asignaturas).
 * SOLO LECTURA: GET /conversations (listado) no marca nada como leído; nunca se abre
 * una conversación concreta ni se modifica nada en Canvas.
 */
export async function syncInbox(db: DB, userId: string): Promise<InboxSyncResult> {
  const run = await startRun(db, userId, "canvas", "inbox");
  if (!run.ok) return run.reason === "already_running" ? { status: "already_running" } : { status: "error", message: "No se pudo registrar la sincronización." };

  let canvas: ReturnType<typeof getCanvasClient>;
  try {
    canvas = getCanvasClient();
  } catch (err) {
    const message = err instanceof CanvasNotConfiguredError ? "Canvas no está configurado." : "Error inesperado.";
    await finishRun(db, run.id, { status: "error", code: "not_configured", message });
    return { status: "error", message };
  }
  const { client, origin } = canvas;
  const nowIso = new Date().toISOString();

  const { data: courses } = await db.from("courses").select("id, external_id").eq("user_id", userId);
  const courseIdByExternal = new Map((courses ?? []).map((c) => [c.external_id, c.id]));
  const self = await attempt(() => client.get<{ id: number }>("users/self"));
  const ctx = { userId, selfId: self.status === "ok" ? self.data.data.id : null, courseIdByExternal, nowIso };

  const [convs, stream, unread] = [
    await attempt(() => client.getAll<CanvasConversation>("conversations", { per_page: 50 }, 2)),
    await attempt(() => client.getAll<CanvasStreamItem>("users/self/activity_stream", { per_page: 50, only_active_courses: true }, 2)),
    await attempt(() => client.get<{ unread_count: string | number }>("conversations/unread_count")),
  ];

  let changes = 0;
  try {
    if (convs.status === "ok") {
      const { data: prev } = await db.from("canvas_conversations").select("external_id, last_message_at").eq("user_id", userId);
      const previous = new Map((prev ?? []).map((p) => [p.external_id, p.last_message_at]));
      const rows = convs.data.filter((c) => typeof c.id === "number").map((c) => mapConversation(c, ctx));
      const { data: up, error } = rows.length
        ? await db.from("canvas_conversations").upsert(rows, { onConflict: "user_id,external_id" }).select("id, external_id")
        : { data: [], error: null };
      if (error) throw new Error("db_upsert_conversations");
      const idByExt = new Map((up ?? []).map((u) => [u.external_id, u.id]));

      const news = diffConversations(previous, rows, previous.size === 0);
      if (news.length) {
        const { error: cErr } = await db.from("changes").upsert(
          news.map((n) => ({
            user_id: userId,
            course_id: n.course_id,
            entity_type: "conversation" as const,
            entity_id: idByExt.get(n.external_id) ?? null,
            external_id: n.external_id,
            kind: n.kind,
            title: n.title,
            detail: { ...n.detail, url: `${origin}/conversations` },
            dedupe_key: n.dedupe_key,
            detected_at: nowIso,
          })),
          { onConflict: "user_id,entity_type,external_id,kind,dedupe_key", ignoreDuplicates: true },
        );
        if (cErr) throw new Error("db_insert_changes");
        changes = news.length;
      }
    }

    if (stream.status === "ok") {
      const rows = stream.data.filter((i) => typeof i.id === "number").map((i) => mapActivity(i, ctx)).filter((r): r is NonNullable<typeof r> => r !== null);
      if (rows.length) {
        const { error } = await db.from("canvas_activity").upsert(rows, { onConflict: "user_id,external_id" });
        if (error) throw new Error("db_upsert_activity");
      }
    }
  } catch (err) {
    logger.error("inbox_sync_failed", { error: err instanceof Error ? err.message.slice(0, 60) : "unknown" });
    await finishRun(db, run.id, { status: "error", code: "db", message: "No se pudieron guardar los mensajes de Canvas." });
    return { status: "error", message: "No se pudieron guardar los mensajes de Canvas." };
  }

  const unreadCount = unread.status === "ok" ? Number(unread.data.data.unread_count) : null;
  const stats = { conversations: convs.status, activity: stream.status, changes, unread: unreadCount };
  const problems = [convs, stream].filter((r) => r.status === "error");
  if (problems.length) {
    const first = problems[0] as { error?: unknown };
    const message = first.error instanceof CanvasApiError ? `Mensajes de Canvas: ${describeCanvasError(first.error)}` : "No se pudieron leer los mensajes de Canvas.";
    await finishRun(db, run.id, { status: "error", code: problems.length === 2 ? "all_failed" : "partial", message, stats });
    return problems.length === 2 ? { status: "error", message } : { status: "partial", conversations: convs.status, activity: stream.status, changes, unread: unreadCount };
  }
  await finishRun(db, run.id, { status: "success", stats });
  return { status: "success", conversations: convs.status, activity: stream.status, changes, unread: unreadCount };
}
