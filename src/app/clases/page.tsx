import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { MissingClasses } from "@/components/app/missing-classes";
import { CopyButton } from "@/components/app/copy-button";
import { CopySecretButton } from "@/components/app/copy-secret-button";
import { countResourcesBySession } from "@/features/resources/queries";
import { SessionItem } from "@/components/app/session-item";
import { buttonClass } from "@/components/ui/button";
import { courseProgress, matchesFilter, parseStudyFilter, STUDY_FILTERS, type StudyFilter } from "@/features/classes/progress";
import { listMissingClasses, listSessions, type SessionListItem } from "@/features/classes/queries";
import { requirePageUser } from "@/lib/auth/page-guard";
import { courseHue, displayCourseName } from "@/lib/course-color";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clases" };

/** Clases visibles de cada grupo antes de plegar las antiguas. */
const VISIBLE = 4;

function href(asignatura: string | undefined, estado: StudyFilter) {
  const p = new URLSearchParams();
  if (asignatura) p.set("asignatura", asignatura);
  if (estado !== "todas") p.set("estado", estado);
  const q = p.toString();
  return q ? `/clases?${q}` : "/clases";
}

function ProgressBar({ total, mastered, toReview, watched }: { total: number; mastered: number; toReview: number; watched: number }) {
  if (total === 0) return <div className="h-1.5 rounded-full bg-muted" />;
  const pct = (n: number) => `${(n / total) * 100}%`;
  const plainWatched = watched - mastered - toReview;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="bg-emerald-500" style={{ width: pct(mastered) }} />
      <span className="bg-amber-500" style={{ width: pct(toReview) }} />
      <span className="bg-sky-500" style={{ width: pct(plainWatched) }} />
    </div>
  );
}

export default async function ClasesPage({ searchParams }: { searchParams: Promise<{ asignatura?: string; estado?: string }> }) {
  const user = await requirePageUser("/clases");
  const sp = await searchParams;
  const asignatura = sp.asignatura && /^[0-9a-f-]{36}$/.test(sp.asignatura) ? sp.asignatura : undefined;
  const estado = parseStudyFilter(sp.estado);
  const supabase = await createSupabaseServerClient();
  const [{ data: courses }, sessions, missing] = await Promise.all([
    supabase.from("courses").select("id, name, course_code").eq("followed", true).order("name"),
    listSessions(supabase),
    listMissingClasses(supabase, user.id),
  ]);
  const all = sessions ?? [];
  const [resourceCounts, { data: profile }] = await Promise.all([
    countResourcesBySession(supabase, all.map((x) => x.id)),
    supabase.from("profiles").select("university_login, university_secret").maybeSingle(),
  ]);

  // "Clase N": orden cronológico dentro de cada asignatura.
  const numberOf = new Map<string, number>();
  const byCourse = new Map<string, SessionListItem[]>();
  for (const s of [...all].sort((a, b) => a.session_at.localeCompare(b.session_at))) {
    const list = byCourse.get(s.course_id) ?? [];
    list.push(s);
    byCourse.set(s.course_id, list);
    numberOf.set(s.id, list.length);
  }

  const overview = (courses ?? []).map((c) => ({ c, p: courseProgress(byCourse.get(c.id) ?? []) }));
  const scoped = asignatura ? all.filter((s) => s.course_id === asignatura) : all;
  const counts = Object.fromEntries(STUDY_FILTERS.map((f) => [f.id, scoped.filter((s) => matchesFilter(s, f.id)).length])) as Record<StudyFilter, number>;
  const visible = scoped.filter((s) => matchesFilter(s, estado));
  const groups = (courses ?? [])
    .filter((c) => !asignatura || c.id === asignatura)
    .map((c) => ({ c, items: visible.filter((s) => s.course_id === c.id) }))
    .filter((g) => g.items.length > 0);
  const missingHere = (missing ?? []).filter((m) => !asignatura || m.course_id === asignatura);

  return (
    <AppShell active="/clases">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Clases</h1>
            <p className="text-sm text-muted-foreground">Marca cada clase como vista, si la entendiste y si la estás repasando.</p>
          </div>
          <div className="flex items-center gap-1.5">
            {profile?.university_login ? (
              <>
                <CopyButton value={profile.university_login} label="Copiar usuario" />
                {profile.university_secret && <CopySecretButton />}
              </>
            ) : (
              <Link href="/ajustes" className="text-xs text-muted-foreground hover:text-foreground">Guardar mi usuario de Teams</Link>
            )}
            <Link href={`/clases/nueva${asignatura ? `?asignatura=${asignatura}` : ""}`} className={buttonClass({ size: "sm" })}>Importar clase</Link>
          </div>
        </div>

        <MissingClasses items={missingHere} />

        {overview.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Progreso por asignatura">
            {overview.map(({ c, p }) => {
              const active = asignatura === c.id;
              return (
                <li key={c.id}>
                  <Link
                    href={href(active ? undefined : c.id, estado)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-full flex-col gap-1.5 rounded-lg border bg-card p-2.5 transition-colors hover:border-foreground/20",
                      active ? "border-primary ring-1 ring-primary" : "border-border",
                    )}
                    style={{ borderTopColor: active ? undefined : `hsl(${courseHue(c.id)} 65% 50%)`, borderTopWidth: 3 } as CSSProperties}
                  >
                    <span className="line-clamp-2 text-xs font-semibold leading-snug">{displayCourseName(c.name)}</span>
                    <ProgressBar total={p.total} mastered={p.mastered} toReview={p.toReview} watched={p.watched} />
                    <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="tabular">{p.total === 0 ? "Sin clases" : `${p.watched}/${p.total} vistas`}</span>
                      {p.upToDate ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-3" /> Al día</span>
                      ) : p.unwatched > 0 ? (
                        <span className="font-medium text-foreground">{p.unwatched} sin ver</span>
                      ) : p.toReview > 0 ? (
                        <span className="font-medium text-amber-800 dark:text-amber-300">{p.toReview} por repasar</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap gap-1" aria-label="Filtrar por estado">
            {STUDY_FILTERS.map((f) => (
              <Link
                key={f.id}
                href={href(asignatura, f.id)}
                aria-current={estado === f.id ? "page" : undefined}
                className={cn("rounded-md px-2.5 py-1 text-sm", estado === f.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {f.label} <span className="tabular text-xs text-muted-foreground">{counts[f.id]}</span>
              </Link>
            ))}
          </nav>
          {asignatura && <Link href={href(undefined, estado)} className="text-xs text-muted-foreground hover:text-foreground">Ver todas las asignaturas</Link>}
        </div>

        {sessions === null ? (
          <p className="text-sm text-red-600">No se pudieron cargar las clases.</p>
        ) : all.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <p>Aún no has importado ninguna clase.</p>
            <p className="mt-1 text-xs">En Teams: abre la reunión → Grabaciones y transcripciones → Descargar (.vtt o .docx). Copia también el enlace de la grabación.</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {estado === "sin-ver" ? "Has visto todas las clases. Estás al día." : estado === "repasar" ? "No tienes clases pendientes de repasar." : "Ninguna clase en este filtro."}
          </p>
        ) : (
          groups.map(({ c, items }) => {
            const recent = items.slice(0, VISIBLE);
            const older = items.slice(VISIBLE);
            return (
              <section key={c.id} className="rounded-lg border border-border bg-card" aria-labelledby={`g-${c.id}`}>
                <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <span className="size-2.5 rounded-full" style={{ background: `hsl(${courseHue(c.id)} 65% 50%)` }} aria-hidden />
                  <h2 id={`g-${c.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold">
                    <Link href={`/asignaturas/${c.id}?tab=clases`} className="hover:underline">{displayCourseName(c.name)}</Link>
                  </h2>
                  <span className="tabular text-xs text-muted-foreground">{items.length} clase{items.length === 1 ? "" : "s"}</span>
                </header>
                <ul className="divide-y divide-border px-3">
                  {recent.map((s) => <SessionItem key={s.id} s={s} showCourse={false} controls number={numberOf.get(s.id)} resources={resourceCounts.get(s.id) ?? 0} />)}
                </ul>
                {older.length > 0 && (
                  <details className="group border-t border-border">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <span className="group-open:hidden">Ver {older.length} clase{older.length === 1 ? "" : "s"} anterior{older.length === 1 ? "" : "es"}</span>
                      <span className="hidden group-open:inline">Ocultar clases anteriores</span>
                    </summary>
                    <ul className="divide-y divide-border border-t border-border px-3">
                      {older.map((s) => <SessionItem key={s.id} s={s} showCourse={false} controls number={numberOf.get(s.id)} resources={resourceCounts.get(s.id) ?? 0} />)}
                    </ul>
                  </details>
                )}
              </section>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
