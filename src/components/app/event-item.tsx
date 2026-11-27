import { ExternalLink, Video } from "lucide-react";
import type { CalendarEventRow } from "@/lib/supabase/database.types";
import { formatEventRange } from "@/lib/format";
import { CourseTag } from "./course-tag";

export function EventItem({ e, course }: { e: CalendarEventRow; course?: { id: string; name: string; course_code: string | null } | null }) {
  const live = e.start_at && e.end_at && new Date(e.start_at) <= new Date() && new Date(e.end_at) >= new Date();
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {course && <CourseTag id={course.id} name={course.name} code={course.course_code} />}
          <span className="truncate text-sm font-medium">{e.title}</span>
          {live && <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">ahora</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatEventRange(e.start_at, e.end_at, e.all_day)}
          {e.location_name && ` · ${e.location_name}`}
        </p>
      </div>
      {e.online_meeting_url && (
        <a href={e.online_meeting_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Unirse a la reunión">
          <Video className="size-3.5" />
        </a>
      )}
      {e.html_url && (
        <a href={e.html_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir evento en Canvas">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}
