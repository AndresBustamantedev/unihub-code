import Link from "next/link";
import { FileText, Link2, PlayCircle } from "lucide-react";
import type { SessionListItem } from "@/features/classes/queries";
import { STUDY_LABEL, studyStatus, type StudyStatus } from "@/features/classes/progress";
import { madridTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CourseTag } from "./course-tag";
import { StudyControls } from "./study-controls";

const STATUS_STYLE: Record<StudyStatus, { dot: string; text: string }> = {
  unwatched: { dot: "border-2 border-muted-foreground/50 bg-transparent", text: "text-muted-foreground" },
  watched: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  unclear: { dot: "bg-red-500", text: "text-red-700 dark:text-red-300" },
  reviewing: { dot: "bg-amber-500", text: "text-amber-800 dark:text-amber-300" },
  mastered: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
};

export function StudyBadge({ status, className }: { status: StudyStatus; className?: string }) {
  const st = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", st.text, className)}>
      <span className={cn("size-2 rounded-full", st.dot)} aria-hidden />
      {STUDY_LABEL[status]}
    </span>
  );
}

function sessionDate(iso: string): string {
  const s = new Date(iso).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Título útil de la sesión: quita el nombre de la asignatura (ya visible en el grupo) y,
 * si solo queda una fecha, no repite nada.
 */
export function sessionSubtitle(title: string, courseName: string | null | undefined): string | null {
  let t = title.trim();
  if (courseName) {
    const base = courseName.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (t.toLowerCase().startsWith(base.toLowerCase())) t = t.slice(base.length);
  }
  t = t.replace(/^[\s·\-–—:|]+/, "").trim();
  if (!t || /^\d{1,2}\s+[a-zé]{3,}\.?$/i.test(t)) return null;
  return t;
}

/**
 * Una clase importada. `controls` añade el seguimiento de estudio (vista, entendida, repaso);
 * `number` muestra "Clase N" dentro de su asignatura.
 */
export function SessionItem({ s, showCourse = true, controls = false, number, resources = 0 }: { s: SessionListItem; showCourse?: boolean; controls?: boolean; number?: number; resources?: number }) {
  const status = studyStatus(s);
  const subtitle = sessionSubtitle(s.title, s.course?.name);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {showCourse && s.course && <CourseTag id={s.course.id} name={s.course.name} code={s.course.course_code} />}
          <Link href={`/clases/${s.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
            {number ? <span className="tabular">Clase {number}</span> : null}
            {number ? " · " : ""}
            <span>{sessionDate(s.session_at)}</span>
            {subtitle ? <span className="text-muted-foreground"> · {subtitle}</span> : null}
          </Link>
          {!controls && <StudyBadge status={status} className="ml-auto" />}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {madridTime(s.session_at)}
          {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
          {s.transcript ? ` · ${s.transcript.word_count.toLocaleString("es-ES")} palabras` : ""}
          {s.topics.length > 0 ? ` · ${s.topics.slice(0, 4).join(", ")}` : ""}
        </p>
        {controls && (
          <StudyControls
            id={s.id}
            watched={!!s.watched_at}
            understanding={s.understanding}
            review={s.review_state}
            reviewCount={s.review_count}
            className="mt-1.5"
          />
        )}
      </div>
      <div className="mt-0.5 flex shrink-0 items-center gap-2 text-muted-foreground">
        {controls && <StudyBadge status={status} className="hidden sm:inline-flex" />}
        {resources > 0 && (
          <Link href={`/clases/${s.id}`} className="inline-flex items-center gap-0.5 text-xs hover:text-foreground" aria-label={`${resources} recursos externos`}>
            <Link2 className="size-3.5" />
            <span className="tabular">{resources}</span>
          </Link>
        )}
        {s.transcript && <FileText className="size-3.5" aria-label="Con transcripción" />}
        {s.recording_url && (
          <a href={s.recording_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground" aria-label="Ver grabación">
            <PlayCircle className="size-4" />
          </a>
        )}
      </div>
    </li>
  );
}
