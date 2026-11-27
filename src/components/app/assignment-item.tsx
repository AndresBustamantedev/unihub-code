import { ExternalLink } from "lucide-react";
import type { AssignmentWithCourse } from "@/features/content/queries";
import type { SubmissionState } from "@/lib/supabase/database.types";
import { formatDue, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CourseTag } from "./course-tag";

const STATE: Record<SubmissionState, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  submitted: { label: "Entregada", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  graded: { label: "Calificada", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
  excused: { label: "Exenta", cls: "bg-muted text-muted-foreground" },
  not_required: { label: "Sin entrega online", cls: "bg-muted text-muted-foreground" },
  unknown: { label: "Estado desconocido", cls: "bg-muted text-muted-foreground" },
};

export function isOverdue(a: Pick<AssignmentWithCourse, "due_at" | "submission_state">, now = new Date()): boolean {
  return a.submission_state === "pending" && !!a.due_at && new Date(a.due_at) < now;
}

export function AssignmentItem({ a, showCourse = true }: { a: AssignmentWithCourse; showCourse?: boolean }) {
  const overdue = isOverdue(a);
  const st = overdue ? { label: "Vencida", cls: "bg-urgent/12 text-urgent" } : STATE[a.submission_state];
  const score =
    a.submission_state === "graded" && (a.score !== null || a.grade)
      ? a.points_possible ? `${a.score ?? a.grade}/${a.points_possible}` : `${a.grade ?? a.score}`
      : null;
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {showCourse && <CourseTag id={a.course.id} name={a.course.name} code={a.course.course_code} />}
          <span className="truncate text-sm font-medium">{a.name}</span>
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", st.cls)}>{st.label}</span>
          {a.late && a.submission_state !== "pending" && <span className="shrink-0 text-[11px] text-amber-600">con retraso</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">

          {a.due_at ? (
            <span className={cn("tabular", overdue && "text-urgent")}>
              {formatDue(a.due_at)} ({timeAgo(a.due_at)})
            </span>
          ) : (
            "sin fecha de entrega"
          )}
          {score && ` · nota ${score}`}
        </p>
      </div>
      {a.html_url && (
        <a href={a.html_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Abrir ${a.name} en Canvas`}>
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}
