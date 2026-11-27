import type { CanvasConversation, CanvasStreamItem } from "@/integrations/canvas/types";
import { htmlToText } from "@/lib/html";

interface Ctx {
  userId: string;
  selfId: number | null;
  courseIdByExternal: Map<number, string>;
  nowIso: string;
}

function courseOf(c: CanvasConversation, ctx: Ctx): string | null {
  const fromCode = c.context_code?.startsWith("course_") ? Number(c.context_code.slice(7)) : NaN;
  const candidates = [fromCode, ...Object.keys(c.audience_contexts?.courses ?? {}).map(Number)];
  for (const ext of candidates) {
    const id = Number.isFinite(ext) ? ctx.courseIdByExternal.get(ext) : undefined;
    if (id) return id;
  }
  return null;
}

export function mapConversation(c: CanvasConversation, ctx: Ctx) {
  const others = (c.participants ?? []).filter((p) => p.id !== ctx.selfId).map((p) => (p.full_name ?? p.name ?? "").trim()).filter(Boolean);
  return {
    user_id: ctx.userId,
    course_id: courseOf(c, ctx),
    external_id: c.id,
    subject: c.subject?.trim() || null,
    last_message_excerpt: c.last_message ? c.last_message.replace(/\s+/g, " ").trim().slice(0, 200) : null,
    last_message_at: c.last_message_at ?? null,
    participants: others.slice(0, 10),
    context_name: c.context_name ?? null,
    workflow_state: c.workflow_state ?? "read",
    message_count: c.message_count ?? 0,
    starred: !!c.starred,
    missing_since: null,
    last_synced_at: ctx.nowIso,
  };
}

export type ConversationUpsert = ReturnType<typeof mapConversation>;

/** Las conversaciones ya se muestran aparte; el resto del flujo son las "notificaciones" de Canvas. */
export function mapActivity(i: CanvasStreamItem, ctx: Ctx) {
  if (i.type === "Conversation") return null;
  return {
    user_id: ctx.userId,
    course_id: typeof i.course_id === "number" ? ctx.courseIdByExternal.get(i.course_id) ?? null : null,
    external_id: i.id,
    item_type: i.type ?? "Unknown",
    notification_category: i.notification_category ?? null,
    title: i.title?.trim() || null,
    excerpt: htmlToText(i.message, 300),
    html_url: i.html_url ?? i.url ?? null,
    read_state: typeof i.read_state === "boolean" ? i.read_state : null,
    canvas_created_at: i.created_at ?? null,
    canvas_updated_at: i.updated_at ?? i.created_at ?? null,
    last_synced_at: ctx.nowIso,
  };
}

/**
 * Novedad "nuevo mensaje": conversación sin leer que es nueva o tiene un último mensaje
 * más reciente que el visto. `dedupe_key` = fecha del último mensaje → nunca se repite.
 */
export function diffConversations(previous: Map<number, string | null>, rows: ConversationUpsert[], baseline: boolean) {
  if (baseline) return [];
  return rows
    .filter((r) => r.workflow_state === "unread" && r.last_message_at)
    .filter((r) => {
      if (!previous.has(r.external_id)) return true;
      const prev = previous.get(r.external_id);
      return !prev || new Date(r.last_message_at!).getTime() > new Date(prev).getTime();
    })
    .map((r) => ({
      kind: "new_message" as const,
      external_id: r.external_id,
      title: r.subject ?? "(sin asunto)",
      detail: { from: r.participants.slice(0, 3).join(", "), excerpt: r.last_message_excerpt, context: r.context_name },
      dedupe_key: r.last_message_at!,
      course_id: r.course_id,
    }));
}
