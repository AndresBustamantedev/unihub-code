import type { CanvasAnnouncement, CanvasAssignment } from "@/integrations/canvas/types";
import type { AssignmentRow, ChangeKind, Json, SubmissionState } from "@/lib/supabase/database.types";
import { htmlToText } from "@/lib/html";

const NO_ONLINE_SUBMISSION = new Set(["none", "not_graded", "on_paper", "wiki_page", "external_tool_no_submission"]);

export function submissionStateOf(a: CanvasAssignment): SubmissionState {
  const s = a.submission;
  const types = a.submission_types ?? [];
  if (s?.excused) return "excused";
  if (s?.workflow_state === "graded" && (s.score !== null && s.score !== undefined || !!s.grade)) return "graded";
  if (s?.submitted_at || s?.workflow_state === "submitted" || s?.workflow_state === "pending_review") return "submitted";
  if (types.length > 0 && types.every((t) => NO_ONLINE_SUBMISSION.has(t))) return "not_required";
  if (!s) return "unknown"; // Canvas no envía la entrega (p. ej. rol no estudiante)
  return "pending";
}

export type AssignmentUpsert = Omit<AssignmentRow, "id" | "first_seen_at">;

export function mapAssignment(a: CanvasAssignment, ctx: { userId: string; courseId: string; nowIso: string }): AssignmentUpsert {
  const s = a.submission;
  return {
    user_id: ctx.userId,
    course_id: ctx.courseId,
    provider: "canvas",
    external_id: a.id,
    name: a.name?.trim() || `Tarea ${a.id}`,
    description_text: htmlToText(a.description, 1500),
    due_at: a.due_at ?? null,
    unlock_at: a.unlock_at ?? null,
    lock_at: a.lock_at ?? null,
    points_possible: a.points_possible ?? null,
    submission_types: a.submission_types ?? [],
    html_url: a.html_url ?? null,
    canvas_updated_at: a.updated_at ?? null,
    submission_state: submissionStateOf(a),
    submitted_at: s?.submitted_at ?? null,
    score: s?.score ?? null,
    grade: s?.grade ?? null,
    late: !!s?.late,
    missing: !!s?.missing,
    last_seen_at: ctx.nowIso,
    missing_since: null,
    last_synced_at: ctx.nowIso,
  };
}

export interface ChangeDraft {
  kind: ChangeKind;
  external_id: number;
  title: string;
  detail: Json;
  dedupe_key: string;
}

type Previous = Pick<AssignmentRow, "external_id" | "name" | "due_at" | "submission_state" | "missing_since">;

function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Compara el estado guardado con el nuevo y devuelve las novedades.
 * `baseline` = primera importación del curso: no se generan novedades.
 */
export function diffAssignments(previous: Previous[], next: AssignmentUpsert[], baseline: boolean): ChangeDraft[] {
  if (baseline) return [];
  const prevById = new Map(previous.map((p) => [p.external_id, p]));
  const nextIds = new Set(next.map((n) => n.external_id));
  const out: ChangeDraft[] = [];

  for (const n of next) {
    const p = prevById.get(n.external_id);
    if (!p) {
      out.push({ kind: "new_assignment", external_id: n.external_id, title: n.name, detail: { due_at: n.due_at }, dedupe_key: "" });
      continue;
    }
    if (!sameInstant(p.due_at, n.due_at)) {
      out.push({
        kind: "due_date_changed",
        external_id: n.external_id,
        title: n.name,
        detail: { from: p.due_at, to: n.due_at },
        dedupe_key: n.due_at ?? "none",
      });
    }
    if (p.submission_state !== "graded" && n.submission_state === "graded") {
      out.push({ kind: "graded", external_id: n.external_id, title: n.name, detail: { score: n.score, grade: n.grade, points_possible: n.points_possible }, dedupe_key: "" });
    }
  }
  for (const p of previous) {
    if (!nextIds.has(p.external_id) && !p.missing_since) {
      out.push({ kind: "assignment_removed", external_id: p.external_id, title: p.name, detail: { due_at: p.due_at }, dedupe_key: "" });
    }
  }
  return out;
}

export function mapAnnouncement(a: CanvasAnnouncement, ctx: { userId: string; courseId: string; nowIso: string }) {
  return {
    user_id: ctx.userId,
    course_id: ctx.courseId,
    provider: "canvas" as const,
    external_id: a.id,
    title: a.title?.trim() || "(Anuncio sin título)",
    message_excerpt: htmlToText(a.message, 600),
    author_name: a.author?.display_name ?? a.user_name ?? null,
    posted_at: a.posted_at ?? a.delayed_post_at ?? null,
    html_url: a.html_url ?? null,
    last_synced_at: ctx.nowIso,
  };
}
