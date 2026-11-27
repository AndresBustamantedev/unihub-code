import Link from "next/link";
import type { CourseRow } from "@/lib/supabase/database.types";
import { courseHue, courseShort, displayCourseName } from "@/lib/course-color";
import { coverSources } from "@/lib/course-cover";
import { CourseCover } from "./course-cover";

/** Tarjeta con portada (estilo galería). */
export function CourseCard({
  c,
  pending,
  overdue,
  next,
  compact = false,
}: {
  c: Pick<CourseRow, "id" | "name" | "course_code" | "cover_url" | "canvas_image_url" | "content_synced_at">;
  pending?: number;
  overdue?: number;
  next?: string | null;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/asignaturas/${c.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus-visible:shadow-md"
    >
      <div className={compact ? "h-20" : "h-28"}>
        <CourseCover sources={coverSources(c)} alt="" className="transition-transform duration-300 group-hover:scale-[1.03]" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="flex items-start gap-2">
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ background: `hsl(${courseHue(c.id)} 65% 50%)` }}
            aria-hidden
          />
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{displayCourseName(c.name)}</span>
        </span>
        {pending !== undefined && (
          <span className="pl-4 text-xs text-muted-foreground">
            {c.content_synced_at === null ? (
              "Pendiente de sincronizar"
            ) : (
              <>
                <span className="tabular">{pending}</span> pendiente{pending === 1 ? "" : "s"}
                {!!overdue && <span className="text-urgent"> · {overdue} vencida{overdue === 1 ? "" : "s"}</span>}
              </>
            )}
          </span>
        )}
        {next && <span className="mt-auto truncate pl-4 text-xs text-muted-foreground">{next}</span>}
        <span className="sr-only">{courseShort(c.name, c.course_code)}</span>
      </div>
    </Link>
  );
}
