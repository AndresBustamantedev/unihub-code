import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, Mail, Video } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/app/app-shell";
import { CourseReview } from "./course-review";
import { AssignmentItem } from "@/components/app/assignment-item";
import { ActivityItem, ConversationItem } from "@/components/app/canvas-items";
import { ChangeItem } from "@/components/app/change-item";
import { CourseCover } from "@/components/app/course-cover";
import { FollowToggle } from "@/components/app/follow-toggle";
import { SessionItem } from "@/components/app/session-item";
import { buttonClass } from "@/components/ui/button";
import { listSessions } from "@/features/classes/queries";
import { courseProgress } from "@/features/classes/progress";
import { listActivity, listConversations } from "@/features/inbox/queries";
import { currentTopic } from "@/features/materials/map";
import { getCourseDetail } from "@/features/materials/queries";
import { displayPersonName } from "@/features/people/map";
import { readCanvasConfig } from "@/integrations/canvas/config";
import { requirePageUser } from "@/lib/auth/page-guard";
import { displayCourseName, courseShort } from "@/lib/course-color";
import { coverSources } from "@/lib/course-cover";
import { formatDue, hhmm, madridDayKey, timeAgo, WEEKDAYS } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AssignmentRow, CourseRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { AppearanceForm } from "./appearance-form";
import { MaterialBrowser } from "./material-browser";
import { ScheduleEditor } from "./schedule-editor";
import { ClassesEnd } from "./classes-end";
import { ResourcesPanel } from "@/components/app/resources-panel";
import { listResources } from "@/features/resources/queries";
import { academicYearLabel, courseAcademicYear } from "@/lib/academic";

export const dynamic = "force-dynamic";

const TABS = {
  resumen: "Resumen",
  tareas: "Tareas",
  material: "Material",
  clases: "Clases",
  avisos: "Avisos",
  info: "Info",
} as const;
type Tab = keyof typeof TABS;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: "Asignatura" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("courses").select("name").eq("id", id).maybeSingle();
  return { title: data ? displayCourseName(data.name) : "Asignatura" };
}

function Card({ title, children, right, className }: { title?: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card px-4 pb-2", className)}>
      {title && (
        <div className="flex items-center justify-between pt-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="py-2 text-sm text-muted-foreground">{children}</p>;

export default async function CourseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);
  await requirePageUser(`/asignaturas/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const tab: Tab = rawTab && rawTab in TABS ? (rawTab as Tab) : "resumen";
  const supabase = await createSupabaseServerClient();
  const detail = await getCourseDetail(supabase, id);
  if (detail === null) notFound();
  if (detail === "error") {
    return (
      <AppShell active="/asignaturas">
        <p className="text-sm text-urgent">No se pudo cargar la asignatura.</p>
      </AppShell>
    );
  }

  const { course, modules, items, assignments, changes, people, schedule, announcements } = detail;
  const now = new Date();
  const pending = assignments.filter((a) => a.submission_state === "pending" || a.submission_state === "unknown");
  const upcoming = pending.filter((a) => !a.due_at || new Date(a.due_at) >= now);
  const overdue = pending.filter((a) => a.due_at && new Date(a.due_at) < now);
  const done = assignments.filter((a) => ["submitted", "graded", "excused"].includes(a.submission_state));
  const nextDue = upcoming.find((a) => a.due_at) ?? null;
  const topic = currentTopic(modules, items, nextDue?.external_id ?? null, now);
  const teachers = people.filter((p) => p.role === "teacher");
  const lite = { id: course.id, name: course.name, course_code: course.course_code, html_url: course.html_url };
  const withCourse = (a: AssignmentRow) => ({ ...a, course: lite });
  const gradedWithScore = assignments.filter((a) => a.submission_state === "graded" && a.score !== null && a.points_possible);
  const title = displayCourseName(course.name);

  return (
    <AppShell active="/asignaturas">
      <div className="flex flex-col gap-4">
        {/* Banner */}
        <header className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative h-36 sm:h-44">
            <CourseCover sources={coverSources(course)} alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
              <div className="min-w-0 text-white">
                <Link href="/asignaturas" className="text-xs text-white/80 hover:text-white">← Asignaturas</Link>
                <h1 className="text-xl font-bold leading-tight tracking-tight drop-shadow-sm sm:text-2xl">{title}</h1>
                <p className="mt-0.5 text-xs text-white/85">
                  {courseShort(course.name, course.course_code)}
                  {course.semester ? ` · Semestre ${course.semester}` : ""}
                  {courseAcademicYear(course) !== null ? ` · ${academicYearLabel(courseAcademicYear(course)!)}` : ""}
                  {teachers[0] ? ` · ${displayPersonName(teachers[0].name)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/90 p-0.5 text-foreground shadow-sm dark:bg-card/90">
                <FollowToggle courseId={course.id} followed={course.followed} name={course.name} />
                {course.html_url && (
                  <a href={course.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted">
                    Canvas <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3" aria-label="Secciones de la asignatura">
            {(Object.keys(TABS) as Tab[]).map((k) => (
              <Link
                key={k}
                href={k === "resumen" ? `/asignaturas/${course.id}` : `/asignaturas/${course.id}?tab=${k}`}
                aria-current={k === tab ? "page" : undefined}
                className={cn(
                  "shrink-0 border-b-2 px-2.5 py-2.5 text-sm",
                  k === tab ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {TABS[k]}
                {k === "tareas" && upcoming.length + overdue.length > 0 && <span className="tabular ml-1 text-xs opacity-70">{upcoming.length + overdue.length}</span>}
              </Link>
            ))}
          </nav>
        </header>

        {/* Buscar o preguntar en todo lo de esta asignatura (abre «Buscar» ya filtrado). */}
        <form action="/buscar" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5 sm:flex-row sm:items-center">
          <input type="hidden" name="curso" value={course.id} />
          <label className="flex-1">
            <span className="sr-only">Buscar o preguntar en esta asignatura</span>
            <input
              name="q"
              required
              minLength={2}
              maxLength={2000}
              placeholder="Busca o pregunta en las clases, apuntes y material de esta asignatura…"
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Buscar</button>
            <button type="submit" name="preguntar" value="1" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              Preguntar a la IA
            </button>
          </div>
        </form>

        {!course.followed && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-primary">No sigues esta asignatura: sus tareas y materiales no se sincronizan. Márcala con la estrella para activarlo.</p>
        )}

        {tab === "resumen" && (
          <Resumen
            course={course}
            topic={topic ? { name: topic.module.name, reason: topic.reason } : null}
            overdue={overdue.map(withCourse)}
            upcoming={upcoming.slice(0, 4).map(withCourse)}
            totals={{ pending: pending.length, done: done.length, total: assignments.length }}
            avg={gradedWithScore.length ? gradedWithScore.reduce((n, a) => n + (Number(a.score) / Number(a.points_possible)) * 10, 0) / gradedWithScore.length : null}
            schedule={schedule}
            teachers={teachers}
            changes={changes.slice(0, 5)}
          />
        )}

        {tab === "resumen" && (
          <Suspense fallback={<div className="h-24 animate-pulse rounded-lg border border-border bg-card" />}>
            <CourseReview courseId={course.id} />
          </Suspense>
        )}

        {tab === "tareas" && (
          <div className="flex flex-col gap-4">
            {!course.content_synced_at ? (
              <Muted>Pendiente de sincronizar.</Muted>
            ) : assignments.length === 0 ? (
              <Muted>Canvas no tiene tareas publicadas en esta asignatura.</Muted>
            ) : (
              <>
                {overdue.length > 0 && (
                  <Card title={`Vencidas (${overdue.length})`}>
                    <ul className="divide-y divide-border">{overdue.map((a) => <AssignmentItem key={a.id} a={withCourse(a)} showCourse={false} />)}</ul>
                  </Card>
                )}
                <Card title={`Pendientes (${upcoming.length})`}>
                  {upcoming.length === 0 ? <Muted>Nada pendiente.</Muted> : <ul className="divide-y divide-border">{upcoming.map((a) => <AssignmentItem key={a.id} a={withCourse(a)} showCourse={false} />)}</ul>}
                </Card>
                <Card title={`Entregadas y calificadas (${done.length})`}>
                  {done.length === 0 ? <Muted>Aún ninguna.</Muted> : <ul className="divide-y divide-border">{[...done].reverse().map((a) => <AssignmentItem key={a.id} a={withCourse(a)} showCourse={false} />)}</ul>}
                </Card>
              </>
            )}
          </div>
        )}

        {tab === "material" && <CourseResources courseId={course.id} />}
        {tab === "material" &&
          (!course.materials_synced_at ? (
            <Muted>Pendiente de sincronizar.</Muted>
          ) : modules.length === 0 ? (
            <Muted>Canvas no muestra módulos en esta asignatura.</Muted>
          ) : (
            <MaterialBrowser
              modules={modules.map((m) => ({ id: m.id, name: m.name, state: m.state, isTopic: topic?.module.id === m.id }))}
              items={items.map((i) => ({ id: i.id, module_id: i.module_id, title: i.title, item_type: i.item_type, indent: i.indent, href: i.item_type === "File" && i.content_id ? `/material/${i.id}` : i.external_url ?? i.html_url }))}
            />
          ))}

        {tab === "clases" && <ClasesTab courseId={course.id} />}
        {tab === "avisos" && <AvisosTab courseId={course.id} announcements={announcements} />}

        {tab === "info" && (
          <div className="flex flex-col gap-4">
            <Card title="Profesorado">
              {people.length === 0 ? (
                <Muted>Canvas no muestra el profesorado de esta asignatura (o aún no se ha sincronizado).</Muted>
              ) : (
                <ul className="divide-y divide-border">
                  {people.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-primary">
                        {displayPersonName(p.name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{displayPersonName(p.name)}</p>
                        <p className="text-xs text-muted-foreground">{p.role_label}</p>
                      </div>
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          <Mail className="size-3.5" /> <span className="hidden sm:inline">{p.email}</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Horario semanal">
              <div className="pb-2 pt-1">
                <ScheduleEditor courseId={course.id} slots={schedule} />
                <ClassesEnd courseId={course.id} endsOn={course.classes_end_on} today={madridDayKey(now)} />
              </div>
            </Card>

            <Card title="Portada y semestre">
              <div className="pb-2 pt-1">
                <AppearanceForm courseId={course.id} coverUrl={course.cover_url} semester={course.semester} />
              </div>
            </Card>

            <Card title="Programa del curso">
              {course.syllabus_text ? (
                <details className="pb-2">
                  <summary className="cursor-pointer py-1 text-sm text-primary">Mostrar el programa ({course.syllabus_text.length.toLocaleString("es-ES")} caracteres)</summary>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{course.syllabus_text}</p>
                </details>
              ) : (
                <Muted>Canvas no tiene texto en «Programa del curso» para esta asignatura.</Muted>
              )}
            </Card>

            <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold">Exportar para NotebookLM</p>
                <p className="text-xs text-muted-foreground">ZIP con estructura del curso, tareas, anuncios, transcripciones y apuntes en Markdown.</p>
              </div>
              <a href={`/api/export/asignatura/${course.id}`} className={buttonClass({ size: "sm", variant: "outline" })}>
                <Download /> Descargar ZIP
              </a>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
              <div className="max-w-xl">
                <p className="text-sm font-semibold">Guardar todo el material de Canvas</p>
                <p className="text-xs text-muted-foreground">
                  ZIP con todos los archivos que el profesorado ha subido a los módulos (PDF, presentaciones, HTML…), en carpetas por tema. Se genera al momento: no ocupa espacio en UniHub. Puede tardar varios minutos. Hazlo antes de que cierre el curso en Canvas.
                </p>
              </div>
              <a href={`/api/export/asignatura/${course.id}/material`} className={buttonClass({ size: "sm" })}>
                <Download /> Descargar material
              </a>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Resumen({
  course,
  topic,
  overdue,
  upcoming,
  totals,
  avg,
  schedule,
  teachers,
  changes,
}: {
  course: CourseRow;
  topic: { name: string; reason: string } | null;
  overdue: Parameters<typeof AssignmentItem>[0]["a"][];
  upcoming: Parameters<typeof AssignmentItem>[0]["a"][];
  totals: { pending: number; done: number; total: number };
  avg: number | null;
  schedule: { id: string; weekday: number; start_time: string; end_time: string; meeting_url: string | null; location: string | null }[];
  teachers: { id: string; name: string; email: string | null }[];
  changes: Parameters<typeof ChangeItem>[0]["c"][] | import("@/lib/supabase/database.types").ChangeRow[];
}) {
  const progress = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Tema actual</p>
            {topic ? (
              <>
                <p className="text-sm font-semibold">{topic.name}</p>
                <p className="text-xs text-muted-foreground">{topic.reason}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{course.materials_synced_at ? "Canvas no da pistas suficientes para saberlo." : "Pendiente de sincronizar."}</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Progreso de entregas</p>
            <p className="tabular text-sm font-semibold">
              {totals.done} de {totals.total}
              {avg !== null && <span className="font-normal text-muted-foreground"> · media {avg.toFixed(1)}/10</span>}
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <Card title="Próximas entregas" right={<Link href={`/asignaturas/${course.id}?tab=tareas`} className="text-xs text-muted-foreground hover:text-foreground">Todas</Link>}>
          {!course.content_synced_at ? (
            <Muted>Pendiente de sincronizar.</Muted>
          ) : overdue.length + upcoming.length === 0 ? (
            <Muted>Nada pendiente en esta asignatura.</Muted>
          ) : (
            <ul className="divide-y divide-border">
              {[...overdue, ...upcoming].map((a) => <AssignmentItem key={a.id} a={a} showCourse={false} />)}
            </ul>
          )}
        </Card>

        <Card title="Últimas novedades" right={<Link href={`/asignaturas/${course.id}?tab=avisos`} className="text-xs text-muted-foreground hover:text-foreground">Avisos</Link>}>
          {changes.length === 0 ? (
            <Muted>Sin cambios detectados todavía.</Muted>
          ) : (
            <ul className="divide-y divide-border">
              {changes.map((c) => {
                const d = c.detail && typeof c.detail === "object" && !Array.isArray(c.detail) ? c.detail : {};
                return <ChangeItem key={c.id} c={{ ...c, course: null, html_url: typeof d.url === "string" ? d.url : null }} />;
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Horario" right={<Link href={`/asignaturas/${course.id}?tab=info`} className="text-xs text-muted-foreground hover:text-foreground">Editar</Link>}>
          {schedule.length === 0 ? (
            <Muted>Sin horario. Añádelo en «Info».</Muted>
          ) : (
            <ul className="divide-y divide-border">
              {schedule.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="w-20 font-medium">{WEEKDAYS[s.weekday]}</span>
                  <span className="tabular flex-1">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                  {s.meeting_url && (
                    <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" aria-label="Unirse a la clase" className="text-primary">
                      <Video className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Profesorado" right={<Link href={`/asignaturas/${course.id}?tab=info`} className="text-xs text-muted-foreground hover:text-foreground">Info</Link>}>
          {teachers.length === 0 ? (
            <Muted>Sin datos del profesorado.</Muted>
          ) : (
            <ul className="divide-y divide-border">
              {teachers.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="truncate">{displayPersonName(t.name)}</span>
                  {t.email && (
                    <a href={`mailto:${t.email}`} aria-label={`Escribir a ${t.name}`} className="text-muted-foreground hover:text-foreground">
                      <Mail className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="px-1 text-xs text-muted-foreground">
          Sincronizada {timeAgo(course.content_synced_at)}
          {upcoming[0]?.due_at ? ` · próxima entrega ${formatDue(upcoming[0].due_at)}` : ""}
        </p>
      </div>
    </div>
  );
}

async function CourseResources({ courseId }: { courseId: string }) {
  const supabase = await createSupabaseServerClient();
  const [items, { data: sessions }] = await Promise.all([
    listResources(supabase, { courseId }),
    supabase.from("class_sessions").select("id, session_at").eq("course_id", courseId).order("session_at"),
  ]);
  const labels = Object.fromEntries((sessions ?? []).map((s, i) => [s.id, `Clase ${i + 1}`]));
  return <ResourcesPanel courseId={courseId} items={items} labels={labels} title="Recursos externos" empty="Guarda aquí enlaces que te ayuden con la asignatura: vídeos, apuntes de otras webs, ejercicios… También puedes añadirlos dentro de cada clase." />;
}

async function ClasesTab({ courseId }: { courseId: string }) {
  const supabase = await createSupabaseServerClient();
  const sessions = await listSessions(supabase, { courseId, limit: 50 });
  return (
    <Card title="Grabaciones y transcripciones" right={<Link href={`/clases/nueva?asignatura=${courseId}`} className={buttonClass({ size: "sm" })}>Importar clase</Link>}>
      {sessions === null ? (
        <Muted>No se pudieron cargar las clases.</Muted>
      ) : sessions.length === 0 ? (
        <Muted>Sin clases importadas. En Stream: Transcripción → Descargar como .vtt, e impórtala aquí.</Muted>
      ) : (
        <>
          {(() => {
            const p = courseProgress(sessions);
            return (
              <p className="mb-1 text-xs text-muted-foreground">
                {p.watched}/{p.total} vistas{p.toReview ? ` · ${p.toReview} por repasar` : ""}{p.upToDate ? " · al día" : ""}
              </p>
            );
          })()}
          <ul className="divide-y divide-border">
            {sessions.map((s, i) => <SessionItem key={s.id} s={s} showCourse={false} controls number={sessions.length - i} />)}
          </ul>
        </>
      )}
    </Card>
  );
}

async function AvisosTab({ courseId, announcements }: { courseId: string; announcements: import("@/lib/supabase/database.types").AnnouncementRow[] }) {
  const supabase = await createSupabaseServerClient();
  const [activity, conversations] = await Promise.all([listActivity(supabase, { courseId, limit: 30 }), listConversations(supabase, { courseId, limit: 10 })]);
  const cfg = readCanvasConfig();
  const inboxUrl = cfg.baseUrl ? `${new URL(cfg.baseUrl).origin}/conversations` : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Anuncios (${announcements.length})`}>
        {announcements.length === 0 ? (
          <Muted>Sin anuncios en los últimos 120 días.</Muted>
        ) : (
          <ul className="divide-y divide-border">
            {announcements.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{a.title}</span>
                  {a.html_url && (
                    <a href={a.html_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir en Canvas">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{a.author_name ? displayPersonName(a.author_name) : "?"} · {timeAgo(a.posted_at)}</p>
                {a.message_excerpt && <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{a.message_excerpt}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Actividad y mensajes en Canvas">
        {activity === null || conversations === null ? (
          <Muted>No se pudo cargar la actividad.</Muted>
        ) : activity.length + conversations.length === 0 ? (
          <Muted>Sin actividad sincronizada de esta asignatura.</Muted>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => <ConversationItem key={c.id} c={c} inboxUrl={inboxUrl} />)}
            {activity.map((a) => <ActivityItem key={a.id} a={a} showCourse={false} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}
