import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, PlayCircle } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/app/app-shell";
import { buttonClass } from "@/components/ui/button";
import { requirePageUser } from "@/lib/auth/page-guard";
import { formatEventRange, timeAgo } from "@/lib/format";
import { StudyBadge } from "@/components/app/session-item";
import { StudyControls } from "@/components/app/study-controls";
import { CopyButton } from "@/components/app/copy-button";
import { CopySecretButton } from "@/components/app/copy-secret-button";
import { ResourcesPanel } from "@/components/app/resources-panel";
import { listResources } from "@/features/resources/queries";
import { studyStatus } from "@/features/classes/progress";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DeleteClassButton } from "./delete-button";
import { MoveCourse } from "./move-course";
import { VideoPanel } from "./video-panel";
import { isDesktop } from "@/lib/desktop";
import { displayCourseName } from "@/lib/course-color";
import { TranscriptViewer } from "./transcript-viewer";
import { NotesPanel } from "./notes-panel";
import { FlashcardsPanel } from "@/components/app/flashcards-panel";
import { listAiProviders } from "@/integrations/ai/provider";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { inputHash } from "@/features/notes/generate";
import { anonymizeSpeakers } from "@/features/notes/prompts";

export const dynamic = "force-dynamic";
/** La generación con IA se ejecuta en esta ruta (server action): margen para respuestas lentas. */
export const maxDuration = 60;

const FORMAT: Record<string, string> = { vtt: "WebVTT", docx: "Word (.docx)", txt: "texto", paste: "texto pegado" };

export default async function ClaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageUser(`/clases/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase.from("class_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [{ data: course }, { data: t }, { data: notes }, resources, { data: profile }, { data: followed }, { data: cards }] = await Promise.all([
    supabase.from("courses").select("id, name, course_code").eq("id", s.course_id).maybeSingle(),
    supabase.from("transcripts").select("*").eq("session_id", id).maybeSingle(),
    supabase.from("study_notes").select("*").eq("session_id", id),
    listResources(supabase, { courseId: s.course_id, sessionId: id }),
    supabase.from("profiles").select("university_login, university_secret").maybeSingle(),
    supabase.from("courses").select("id, name").or(`followed.eq.true,id.eq.${s.course_id}`).order("name"),
    supabase.from("flashcards").select("id, front, back").eq("session_id", id).order("created_at"),
  ]);
  const ai = await readAiConfigFromCookies();
  const preferred = ai.ok ? ai.config.provider : null;
  const providers = listAiProviders().map(({ provider, ok, model }) => ({ provider, ok, model }));
  const currentHash = t ? inputHash(anonymizeSpeakers(t.content_text, t.speakers) + (s.notes ? `\n\nNotas del alumno:\n${s.notes}` : "")) : null;

  return (
    <AppShell active="/clases">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/clases${course ? `?asignatura=${course.id}` : ""}`} className="text-xs text-muted-foreground hover:text-foreground">← Clases</Link>
            <h1 className="text-xl font-bold leading-snug tracking-tight">{s.title}</h1>
            <p className="text-xs text-muted-foreground">
              {course && <Link href={`/asignaturas/${course.id}`} className="font-medium hover:underline">{course.course_code ?? course.name}</Link>}
              {" · "}
              {formatEventRange(s.session_at, null)}
              {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {s.recording_url && profile?.university_login && <CopyButton value={profile.university_login} label="Copiar usuario" />}
            {s.recording_url && profile?.university_secret && <CopySecretButton />}
            {s.recording_url && (
              <a href={s.recording_url} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm" })}>
                <PlayCircle /> Ver grabación
              </a>
            )}
            <a href={`/api/clases/${s.id}/export`} className={buttonClass({ size: "sm", variant: "outline" })}>
              <Download /> Markdown
            </a>
            <DeleteClassButton id={s.id} />
          </div>
        </div>

        {isDesktop() && <VideoPanel sessionId={s.id} localVideo={s.local_video ?? null} />}

        <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Tu estudio</h2>
            <StudyBadge status={studyStatus(s)} />
          </div>
          <StudyControls id={s.id} watched={!!s.watched_at} understanding={s.understanding} review={s.review_state} reviewCount={s.review_count} />
          {(s.watched_at || s.last_reviewed_at) && (
            <p className="w-full text-xs text-muted-foreground">
              {s.watched_at ? `Vista ${timeAgo(s.watched_at)}` : ""}
              {s.last_reviewed_at ? ` · último repaso ${timeAgo(s.last_reviewed_at)}${s.review_count > 1 ? ` (${s.review_count} repasos)` : ""}` : ""}
            </p>
          )}
        </section>

        <ResourcesPanel courseId={s.course_id} sessionId={s.id} items={resources} />

        {s.topics.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Posibles temas tratados (por frecuencia de términos)</p>
            <div className="flex flex-wrap gap-1.5">
              {s.topics.map((tp) => <span key={tp} className="rounded-md bg-muted px-2 py-0.5 text-xs">{tp}</span>)}
            </div>
          </section>
        )}

        {s.notes && (
          <section className="rounded-lg border border-border bg-card p-3">
            <p className="mb-1 text-xs text-muted-foreground">Notas</p>
            <p className="whitespace-pre-line text-sm">{s.notes}</p>
          </section>
        )}


        <NotesPanel
          sessionId={s.id}
          notes={notes ?? []}
          currentHash={currentHash}
          aiReady={ai.ok}
          aiReason={ai.ok ? null : ai.reason}
          hasTranscript={!!t}
          providers={providers}
          preferred={ai.ok ? ai.config.provider : preferred}
          preferredModel={ai.ok ? ai.config.model : null}
        />

        <FlashcardsPanel
          target="session"
          id={s.id}
          courseId={s.course_id}
          cards={cards ?? []}
          aiReady={ai.ok}
          hasSource={!!t || (notes ?? []).length > 0 || !!s.notes}
        />

        <section className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Transcripción</h2>
            {t && (
              <span className="text-xs text-muted-foreground">
                {t.word_count.toLocaleString("es-ES")} palabras · {FORMAT[t.source_format] ?? t.source_format}
                {t.speakers.length ? ` · ${t.speakers.length} participante${t.speakers.length === 1 ? "" : "s"}` : ""}
              </span>
            )}
          </div>
          {t ? <TranscriptViewer text={t.content_text} /> : <p className="text-sm text-muted-foreground">Esta clase no tiene transcripción importada.</p>}
        </section>

        <MoveCourse sessionId={s.id} courseId={s.course_id} courses={(followed ?? []).map((c) => ({ id: c.id, name: displayCourseName(c.name) }))} />
      </div>
    </AppShell>
  );
}
