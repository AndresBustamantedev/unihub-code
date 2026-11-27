import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { listMissingClasses } from "@/features/classes/queries";
import { missingDedupeKey } from "@/features/classes/missing";
import { deliverToUser } from "@/features/notify/deliver";
import { displayCourseName } from "@/lib/course-color";
import { madridTime } from "@/lib/format";
import { logger } from "@/lib/redact";

type DB = SupabaseClient<Database>;

function dayLabel(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
}

/**
 * Avisa (una sola vez por clase) de las clases del horario que pasaron hace más de un día
 * sin grabación importada. Idempotente gracias al índice único (user_id, dedupe_key).
 */
export async function runMissingClassReminders(db: DB, userId: string, now = new Date()): Promise<{ missing: number; sent: number }> {
  const missing = await listMissingClasses(db, userId, now);
  if (!missing?.length) return { missing: 0, sent: 0 };

  const rows = missing.map((o) => ({
    user_id: userId,
    course_id: o.course_id,
    kind: "class_missing" as const,
    due_at: o.startIso,
    dedupe_key: missingDedupeKey(o),
    status: "pending" as const,
    title: `Falta importar la clase de ${displayCourseName(o.course.name)}`,
    body: `Clase del ${dayLabel(o.date)} (${madridTime(o.startIso)}) sin grabación ni transcripción.`,
    url: `/clases/nueva?asignatura=${o.course_id}&fecha=${o.date}`,
  }));
  const { data: inserted, error } = await db
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id, title, body, url, dedupe_key");
  if (error) {
    logger.error("missing_classes_insert_failed", { code: error.code ?? null });
    return { missing: missing.length, sent: 0 };
  }

  let sent = 0;
  for (const n of inserted ?? []) {
    const { delivered, devices } = await deliverToUser(db, userId, { title: n.title, body: n.body, url: n.url, tag: n.dedupe_key ?? n.id });
    const failed = devices > 0 && delivered === 0;
    await db
      .from("notifications")
      .update({ status: failed ? "failed" : "sent", sent_at: new Date().toISOString(), delivered_count: delivered, error: failed ? "push_failed" : null })
      .eq("id", n.id);
    if (!failed) sent++;
  }
  return { missing: missing.length, sent };
}
