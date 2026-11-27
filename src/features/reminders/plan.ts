import type { ReminderKind, SubmissionState } from "@/lib/supabase/database.types";
import { formatDue } from "@/lib/format";

export const THRESHOLDS: ReadonlyArray<{ kind: ReminderKind; hours: number; label: string }> = [
  { kind: "due_72h", hours: 72, label: "72 h" },
  { kind: "due_24h", hours: 24, label: "24 h" },
  { kind: "due_6h", hours: 6, label: "6 h" },
];

/** Una fecha solo se considera verificada si la tarea se sincronizó hace poco. */
export const MAX_STALENESS_MS = 2 * 60 * 60 * 1000;

export interface ReminderCandidate {
  id: string;
  name: string;
  due_at: string | null;
  submission_state: SubmissionState;
  last_synced_at: string;
  missing_since: string | null;
  html_url: string | null;
  courseLabel: string;
}

export interface PlannedReminder {
  assignment_id: string;
  kind: ReminderKind;
  due_at: string;
  status: "pending" | "skipped";
  title: string;
  body: string;
  url: string | null;
}

/**
 * Decide qué recordatorios tocan ahora.
 * - Solo tareas pendientes, con fecha, presentes en Canvas y sincronizadas recientemente.
 * - Si se han abierto varias ventanas a la vez (p. ej. la tarea apareció con 5 h de margen),
 *   solo se envía la más urgente y las demás se registran como "skipped".
 * - La deduplicación real la hace la BD: (user, tarea, umbral, fecha) es única.
 */
export function planReminders(candidates: ReminderCandidate[], now: Date = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const a of candidates) {
    if (a.submission_state !== "pending" || !a.due_at || a.missing_since) continue;
    if (now.getTime() - new Date(a.last_synced_at).getTime() > MAX_STALENESS_MS) continue;
    const due = new Date(a.due_at).getTime();
    if (Number.isNaN(due) || due <= now.getTime()) continue;

    const open = THRESHOLDS.filter((t) => now.getTime() >= due - t.hours * 3_600_000);
    if (open.length === 0) continue;
    const urgent = open.reduce((min, t) => (t.hours < min.hours ? t : min));

    for (const t of open) {
      out.push({
        assignment_id: a.id,
        kind: t.kind,
        due_at: a.due_at,
        status: t === urgent ? "pending" : "skipped",
        title: `Entrega en menos de ${t.label}: ${a.name}`,
        body: `${a.courseLabel} · ${formatDue(a.due_at)}`,
        url: a.html_url,
      });
    }
  }
  return out;
}
