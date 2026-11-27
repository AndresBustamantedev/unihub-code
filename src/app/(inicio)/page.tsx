import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { MissingClasses } from "@/components/app/missing-classes";
import { AppShell } from "@/components/app/app-shell";
import { ChangeItem } from "@/components/app/change-item";
import { CourseTag } from "@/components/app/course-tag";
import { CourseCard } from "@/components/app/course-card";
import { EventItem } from "@/components/app/event-item";
import { SessionItem } from "@/components/app/session-item";
import { SyncStatus } from "@/components/app/sync-status";
import { WeekStrip } from "@/components/app/week-strip";
import { listMissingClasses, listSessions } from "@/features/classes/queries";
import { listAssignments, listChanges } from "@/features/content/queries";
import { listCourses } from "@/features/courses/queries";
import { countUnreadActivity, countUnreadConversations } from "@/features/inbox/queries";
import { listSchedule } from "@/features/schedule/queries";
import { listRecentFiles, listUpcomingEvents } from "@/features/materials/queries";
import { getSyncOverview } from "@/features/sync/status";
import { requirePageUser } from "@/lib/auth/page-guard";
import { formatDue, longToday, shortDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RecoveryBanner } from "@/components/app/recovery-banner";
import { CanvasTokenNotice } from "@/components/app/canvas-token-notice";
import { UpdateBanner } from "@/components/app/update-banner";
import { ReviewToday } from "@/components/app/review-today";
import { isDesktop } from "@/lib/desktop";
import { readRecoveryNote } from "@/lib/local-db/pg";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inicio" };

function Section({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">{linkLabel}</Link>}
      </div>
      <div className="px-4 pb-2">{children}</div>
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="py-2 text-sm text-muted-foreground">{children}</p>;

const MAX_WEEKS_AHEAD = 12;

function rangeLabel(now: Date, week: number): string {
  const fmt = (d: Date) => d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short" }).replace(".", "");
  const a = new Date(now.getTime() + week * 7 * 86_400_000);
  const b = new Date(a.getTime() + 6 * 86_400_000);
  return `${fmt(a)} – ${fmt(b)}`;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const user = await requirePageUser("/");
  const recovery = isDesktop() ? readRecoveryNote(user.id) : null;
  const rawWeek = Number((await searchParams).semana ?? 0);
  const week = Number.isInteger(rawWeek) ? Math.min(Math.max(rawWeek, 0), MAX_WEEKS_AHEAD) : 0;
  const supabase = await createSupabaseServerClient();
  // Todo en paralelo: una sola ronda de consultas.
  const [followed, assignments, changes, sync, events, files, sessions, unreadMessages, schedule, unreadActivity, missing] = await Promise.all([
    listCourses(supabase, { followedOnly: true }),
    listAssignments(supabase),
    listChanges(supabase, { unreadOnly: true, limit: 6 }),
    getSyncOverview(supabase),
    listUpcomingEvents(supabase, 7, 6),
    listRecentFiles(supabase, 14, 6),
    listSessions(supabase, { limit: 4 }),
    countUnreadConversations(supabase),
    listSchedule(supabase),
    countUnreadActivity(supabase),
    listMissingClasses(supabase, user.id),
  ]);
  const followedIds = new Set(followed.ok ? followed.data.map((c) => c.id) : []);
  const classes = (schedule ?? []).filter((s) => followedIds.has(s.course_id));
  const now = new Date();
  const neverSynced = !sync || sync.neverSucceeded;
  const pendingAll = assignments.ok ? assignments.data.filter((a) => a.submission_state === "pending" || a.submission_state === "unknown") : [];
  const windowEnd = now.getTime() + (week + 1) * 7 * 86_400_000;
  const later = pendingAll.filter((a) => a.due_at && new Date(a.due_at).getTime() > windowEnd).length;
  const title = week === 0 ? "Tu semana" : week === 1 ? "La semana que viene" : `Dentro de ${week} semanas`;
  const nav = "inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40";

  return (
    <AppShell active="/">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{week === 0 ? longToday(now) : rangeLabel(now, week)}</p>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <nav className="flex items-center gap-1" aria-label="Cambiar de semana">
                <Link href={week <= 1 ? "/" : `/?semana=${week - 1}`} scroll={false} aria-disabled={week === 0} aria-label="Semana anterior" className={nav}>
                  <ChevronLeft className="size-4" />
                </Link>
                <Link href={`/?semana=${week + 1}`} scroll={false} aria-disabled={week >= MAX_WEEKS_AHEAD} aria-label="Semana siguiente" className={nav}>
                  <ChevronRight className="size-4" />
                </Link>
                {week > 0 && <Link href="/" scroll={false} className="ml-1 text-xs font-medium text-primary hover:underline">Volver a hoy</Link>}
              </nav>
            </div>
          </div>
          <div className="min-w-0 flex-1 sm:max-w-md">
            <SyncStatus state={sync} />
          </div>
        </header>

        {!assignments.ok ? (
          <Muted>No se pudieron cargar las tareas.</Muted>
        ) : neverSynced ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Aún no hay datos de Canvas. Pulsa «Sincronizar ahora» para ver aquí tus entregas de la semana.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <WeekStrip assignments={assignments.data} classes={classes} now={now} week={week} />
            <p className="text-xs text-muted-foreground">
              {later > 0 ? <>{`${later} entrega${later === 1 ? "" : "s"} más adelante (`}<Link href={`/?semana=${week + 1}`} scroll={false} className="underline-offset-2 hover:underline">ver la semana siguiente</Link>{"). "}</> : ""}
              <Link href="/tareas" className="underline-offset-2 hover:underline">Ver todas las tareas</Link>
              {classes.length === 0 && followed.ok && followed.data[0] && (
                <>
                  {" · "}
                  <Link href={`/asignaturas/${followed.data[0].id}?tab=info`} className="text-primary underline-offset-2 hover:underline">Añade tu horario de clases</Link>
                  {" (en «Info» de cada asignatura) para verlo aquí"}
                </>
              )}
              {sync?.failure ? " · según la última sincronización correcta" : ""}
            </p>
          </div>
        )}

        {recovery && <RecoveryBanner note={recovery} />}
        <Suspense fallback={null}>
          <CanvasTokenNotice />
        </Suspense>
        {isDesktop() && <UpdateBanner />}
        <Suspense fallback={null}>
          <ReviewToday />
        </Suspense>
        {week === 0 && missing && <MissingClasses items={missing} compact />}

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Novedades sin leer" href="/novedades" linkLabel="Ver todo">
            {!!unreadMessages && (
              <Link href="/novedades?vista=mensajes" className="mt-2 block rounded-md bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-primary hover:brightness-95">
                {unreadMessages} mensaje{unreadMessages === 1 ? "" : "s"} sin leer en tu bandeja de Canvas
              </Link>
            )}
            {!!unreadActivity && (
              <Link href="/novedades?vista=canvas" className="mt-2 block rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium hover:brightness-95">
                {unreadActivity} notificaci{unreadActivity === 1 ? "ón" : "ones"} de Canvas sin leer
              </Link>
            )}
            {!changes.ok ? (
              <Muted>No se pudieron cargar las novedades.</Muted>
            ) : changes.data.length === 0 ? (
              <Muted>{neverSynced ? "Sin datos todavía." : "Estás al día."}</Muted>
            ) : (
              <ul className="divide-y divide-border">{changes.data.map((c) => <ChangeItem key={c.id} c={c} />)}</ul>
            )}
          </Section>

          <Section title="Últimas clases" href="/clases" linkLabel="Clases">
            {sessions === null ? (
              <Muted>No se pudieron cargar las clases.</Muted>
            ) : sessions.length === 0 ? (
              <Muted>
                Importa la transcripción de una clase de Teams para tenerla aquí. <Link href="/clases/nueva" className="font-medium text-primary hover:underline">Importar clase</Link>
              </Muted>
            ) : (
              <ul className="divide-y divide-border">{sessions.map((s) => <SessionItem key={s.id} s={s} />)}</ul>
            )}
          </Section>

          {events.ok && events.data.length > 0 && (
            <Section title="Próximas clases y eventos">
              <ul className="divide-y divide-border">
                {events.data.map((e) => <EventItem key={e.id} e={e} course={e.course} />)}
              </ul>
            </Section>
          )}

          {files.ok && files.data.length > 0 && (
            <Section title="Materiales nuevos">
              <ul className="divide-y divide-border">
                {files.data.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
                    <CourseTag id={f.course.id} name={f.course.name} code={f.course.course_code} />
                    <a href={f.html_url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 hover:underline">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.display_name}</span>
                    </a>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{shortDate(f.canvas_created_at)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Mis asignaturas</h2>
            <Link href="/asignaturas" className="text-xs text-muted-foreground hover:text-foreground">Gestionar</Link>
          </div>
          {!followed.ok ? (
            <Muted>No se pudieron cargar tus asignaturas.</Muted>
          ) : followed.data.length === 0 ? (
            <Muted>
              Aún no sigues ninguna. <Link href="/asignaturas" className="font-medium text-primary hover:underline">Elige cuáles seguir</Link> con la estrella.
            </Muted>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {followed.data.map((c) => {
                const mine = pendingAll.filter((a) => a.course_id === c.id);
                const late = mine.filter((a) => a.due_at && new Date(a.due_at) < now).length;
                const next = mine.find((a) => a.due_at && new Date(a.due_at) >= now);
                return (
                  <li key={c.id}>
                    <CourseCard c={c} compact pending={mine.length} overdue={late} next={next ? `Próxima: ${next.name} · ${formatDue(next.due_at)}` : null} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
