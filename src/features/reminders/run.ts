import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { deliverToUser } from "@/features/notify/deliver";
import { logger } from "@/lib/redact";
import { planReminders, type ReminderCandidate } from "./plan";

type DB = SupabaseClient<Database>;

/**
 * Genera y envía los recordatorios que tocan ahora para un usuario.
 * Idempotente: la restricción única de `notifications` impide duplicados aunque el cron
 * se ejecute dos veces seguidas o en paralelo; solo se envía lo recién insertado.
 */
export async function runReminders(db: DB, userId: string, now = new Date()): Promise<{ planned: number; sent: number }> {
  const horizon = new Date(now.getTime() + 73 * 3_600_000).toISOString();
  const { data: courses } = await db.from("courses").select("id, name, course_code").eq("user_id", userId).eq("followed", true);
  if (!courses?.length) return { planned: 0, sent: 0 };
  const label = new Map(courses.map((c) => [c.id, c.course_code ?? c.name]));

  const { data: assignments, error } = await db
    .from("assignments")
    .select("id, course_id, name, due_at, submission_state, last_synced_at, missing_since, html_url")
    .eq("user_id", userId)
    .in("course_id", [...label.keys()])
    .eq("submission_state", "pending")
    .is("missing_since", null)
    .gt("due_at", now.toISOString())
    .lte("due_at", horizon);
  if (error) {
    logger.error("reminders_read_failed", { code: error.code ?? null });
    return { planned: 0, sent: 0 };
  }

  const candidates: ReminderCandidate[] = (assignments ?? []).map((a) => ({ ...a, courseLabel: label.get(a.course_id) ?? "" }));
  const planned = planReminders(candidates, now);
  if (planned.length === 0) return { planned: 0, sent: 0 };

  // ON CONFLICT DO NOTHING + RETURNING: solo vuelven las filas nuevas.
  const { data: inserted, error: insError } = await db
    .from("notifications")
    .upsert(planned.map((p) => ({ ...p, user_id: userId })), { onConflict: "user_id,assignment_id,kind,due_at", ignoreDuplicates: true })
    .select("id, status, title, body, url, kind, assignment_id");
  if (insError) {
    logger.error("reminders_insert_failed", { code: insError.code ?? null });
    return { planned: planned.length, sent: 0 };
  }

  let sent = 0;
  for (const n of (inserted ?? []).filter((r) => r.status === "pending")) {
    const { delivered, devices } = await deliverToUser(db, userId, { title: n.title, body: n.body, url: n.url, tag: `${n.assignment_id}-${n.kind}` });
    // Sin dispositivos el aviso queda igualmente visible dentro de la app.
    const failed = devices > 0 && delivered === 0;
    await db
      .from("notifications")
      .update({ status: failed ? "failed" : "sent", sent_at: new Date().toISOString(), delivered_count: delivered, error: failed ? "push_failed" : null })
      .eq("id", n.id);
    if (!failed) sent++;
  }
  return { planned: planned.length, sent };
}
