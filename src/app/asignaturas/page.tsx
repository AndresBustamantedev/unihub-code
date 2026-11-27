import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { FollowToggle } from "@/components/app/follow-toggle";
import { CourseCard } from "@/components/app/course-card";
import { listAssignments } from "@/features/content/queries";
import { SyncStatus } from "@/components/app/sync-status";
import { listCourses } from "@/features/courses/queries";
import { getSyncOverview } from "@/features/sync/status";
import { requirePageUser } from "@/lib/auth/page-guard";
import type { CourseCategory, CourseRow } from "@/lib/supabase/database.types";
import { shortDate } from "@/lib/format";
import { academicYearLabel, courseAcademicYear, semesterTitle } from "@/lib/academic";
import { displayCourseName } from "@/lib/course-color";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GROUPS: { key: CourseCategory; title: string; open: boolean }[] = [
  { key: "current", title: "Actuales", open: true },
  { key: "future", title: "Próximas", open: true },
  { key: "auxiliary", title: "Auxiliares y comunidades", open: false },
  { key: "past", title: "Anteriores", open: false },
];

function CourseItem({ c }: { c: CourseRow }) {
  const dates = [shortDate(c.start_at ?? c.term_start_at), shortDate(c.end_at ?? c.term_end_at)].filter(Boolean).join(" – ");
  return (
    <li className="flex items-start gap-2 py-2">
      <FollowToggle courseId={c.id} followed={c.followed} name={c.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/asignaturas/${c.id}`} className="truncate text-sm font-medium hover:underline" title={c.name}>{displayCourseName(c.name)}</Link>
          {c.missing_since && <span className="shrink-0 text-xs text-amber-600">ya no aparece en Canvas</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[c.course_code, c.term_name, dates].filter(Boolean).join(" · ")}
        </p>
        <p className="truncate text-xs text-muted-foreground/80">{c.category_reason}</p>
      </div>
      {c.html_url && (
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="mt-1 shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Abrir ${c.name} en Canvas`}>
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}

export default async function AsignaturasPage() {
  await requirePageUser("/asignaturas");
  const supabase = await createSupabaseServerClient();
  const [courses, sync, assignments] = await Promise.all([listCourses(supabase), getSyncOverview(supabase), listAssignments(supabase)]);
  const syncFailedNeverOk = !!sync?.failure && sync.neverSucceeded;
  const now = new Date();
  const followed = courses.ok ? courses.data.filter((c) => c.followed) : [];
  const stats = (id: string) => {
    const p = assignments.ok ? assignments.data.filter((a) => a.course_id === id && (a.submission_state === "pending" || a.submission_state === "unknown")) : [];
    return { pending: p.length, overdue: p.filter((a) => a.due_at && new Date(a.due_at) < now).length };
  };
  // Semestres de la carrera (1–10). Las asignaturas que dejas de seguir y tienen semestre
  // pasan a "Semestres anteriores" con todas sus clases, apuntes y recursos.
  const yearsOf = (list: CourseRow[]) => [...new Set(list.map(courseAcademicYear).filter((y): y is number => y !== null))].sort().map(academicYearLabel).join(", ");
  const bySemester = (list: CourseRow[]) => {
    const keys = [...new Set(list.map((c) => c.semester).filter((n): n is number => n !== null))].sort((a, b) => a - b);
    return keys.map((k) => {
      const items = list.filter((c) => c.semester === k);
      return { key: k, title: semesterTitle(k), years: yearsOf(items), items };
    });
  };
  const semesters = [
    ...bySemester(followed),
    { key: null, title: followed.some((c) => c.semester) ? "Sin semestre asignado" : "Mis asignaturas", years: "", items: followed.filter((c) => c.semester === null) },
  ];
  const archived = bySemester(courses.ok ? courses.data.filter((c) => !c.followed && c.semester !== null) : []).reverse();

  return (
    <AppShell active="/asignaturas">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Asignaturas</h1>
          <p className="text-sm text-muted-foreground">
            Se importan todas las de Canvas. Marca con ★ las que quieres seguir en la pantalla principal. La categoría es una sugerencia automática.
          </p>
        </div>
        <SyncStatus state={sync} />

        {semesters.map((g) =>
          g.items.length === 0 ? null : (
            <section key={String(g.key)} className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">
                {g.title}
                {g.years && <span className="ml-2 text-sm font-normal text-muted-foreground">{g.years}</span>}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {g.items.map((c) => (
                  <li key={c.id}>
                    <CourseCard c={c} {...stats(c.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
        {followed.length > 0 && !followed.some((c) => c.semester) && (
          <p className="text-xs text-muted-foreground">Puedes agruparlas por semestre y cambiar la portada en la pestaña «Info» de cada asignatura.</p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Semestres anteriores</h2>
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cuando termine un semestre, quita la ★ a sus asignaturas: aparecerán aquí, agrupadas por semestre, con todas tus clases, apuntes y recursos. Después sigue las del semestre nuevo.
            </p>
          ) : (
            archived.map((g) => (
              <details key={g.key} className="group rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
                  <span>{g.title} {g.years && <span className="font-normal text-muted-foreground">· {g.years}</span>}</span>
                  <span className="text-xs font-normal text-muted-foreground">{g.items.length} asignatura{g.items.length === 1 ? "" : "s"}</span>
                </summary>
                <ul className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {g.items.map((c) => (
                    <li key={c.id}>
                      <CourseCard c={c} compact />
                    </li>
                  ))}
                </ul>
              </details>
            ))
          )}
        </section>

        <h2 className="mt-2 text-base font-semibold">Todos los cursos de Canvas</h2>

        {!courses.ok ? (
          <p className="text-sm text-red-600">No se pudieron cargar las asignaturas.</p>
        ) : courses.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {syncFailedNeverOk
              ? "No hay datos porque la importación falló; no significa que no tengas asignaturas."
              : "Pulsa «Sincronizar ahora» para importar tus asignaturas de Canvas."}
          </p>
        ) : (
          GROUPS.map((g) => {
            const items = courses.data.filter((c) => c.category === g.key);
            if (items.length === 0) return null;
            const followedCount = items.filter((c) => c.followed).length;
            return (
              <details key={g.key} open={g.open} className="group rounded-lg border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
                  <span>{g.title} <span className="font-normal text-muted-foreground">({items.length})</span></span>
                  {followedCount > 0 && <span className="text-xs font-normal text-muted-foreground">{followedCount} seguidas</span>}
                </summary>
                <ul className="divide-y divide-border border-t border-border px-3">
                  {items.map((c) => <CourseItem key={c.id} c={c} />)}
                </ul>
              </details>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
