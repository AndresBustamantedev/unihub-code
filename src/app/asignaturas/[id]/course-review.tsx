import Link from "next/link";
import { Layers } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cardInExam, cardStats, upcomingExams } from "@/features/flashcards/queries";
import { isMastered } from "@/features/flashcards/srs";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BulkCreateCards, ExamEditor } from "./review-tools";

function when(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/** Asignatura → «Repaso y exámenes»: tarjetas, crear todas, exámenes con cuenta atrás. */
export async function CourseReview({ courseId }: { courseId: string }) {
  const db = await createSupabaseServerClient();
  const [stats, exams, { data: sessions }, { data: files }, { data: cards }, ai] = await Promise.all([
    cardStats(db, courseId),
    upcomingExams(db, courseId),
    db.from("class_sessions").select("id, title, session_at").eq("course_id", courseId).order("session_at"),
    db.from("course_module_items").select("id, title").eq("course_id", courseId).eq("item_type", "File").order("position"),
    db.from("flashcards").select("course_id, session_id, module_item_id, state, interval_days").eq("course_id", courseId).eq("suspended", false),
    readAiConfigFromCookies(),
  ]);
  const s = stats.total;
  const sessionOptions = (sessions ?? []).map((x) => ({
    id: x.id,
    label: `${new Date(x.session_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" })} · ${x.title}`,
  }));
  const fileOptions = (files ?? []).map((f) => ({ id: f.id, label: f.title }));

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3" aria-label="Repaso y exámenes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="size-4" /> Repaso y exámenes
          </h2>
          <p className="text-xs text-muted-foreground">
            {s.total
              ? `${s.total} tarjetas · ${s.dueNow} para repasar hoy · ${s.fresh} nuevas · ${s.mastered} dominadas`
              : "Sin tarjetas todavía: créalas con la IA a partir de tus clases."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.total > 0 && (
            <Link href={`/repasar?curso=${courseId}`} className={buttonClass({ size: "sm" })}>
              Repasar
            </Link>
          )}
          <BulkCreateCards courseId={courseId} aiReady={ai.ok} />
        </div>
      </div>

      {exams.length > 0 && (
        <ul className="flex flex-col gap-2">
          {exams.map((e) => {
            const inScope = (cards ?? []).filter((c) => cardInExam(e, c));
            const mastered = inScope.filter(isMastered).length;
            const seen = inScope.filter((c) => c.state !== "new").length;
            const scope = (e.session_ids?.length ?? 0) + (e.module_item_ids?.length ?? 0);
            return (
              <li key={e.id} className="rounded-md border border-border p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {e.title} <span className="font-normal text-muted-foreground">· {new Date(`${e.exam_at}T12:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</span>
                  </p>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${e.daysLeft <= 3 ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" : e.daysLeft <= 10 ? "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100" : "bg-muted"}`}>
                    {when(e.daysLeft)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {scope ? `Entran ${e.session_ids.length} clases y ${e.module_item_ids.length} documentos` : "Entra toda la asignatura"} · {inScope.length} tarjetas: {seen} vistas, {mastered} dominadas
                </p>
                {inScope.length > 0 && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full bg-primary" style={{ width: `${Math.round((seen / inScope.length) * 100)}%` }} />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {inScope.length > 0 && (
                    <Link href={`/repasar?examen=${e.id}`} className={buttonClass({ size: "sm" })}>
                      Repasar para el examen
                    </Link>
                  )}
                  <ExamEditor courseId={courseId} sessions={sessionOptions} files={fileOptions} exam={{ id: e.id, title: e.title, examAt: e.exam_at, sessionIds: e.session_ids ?? [], moduleItemIds: e.module_item_ids ?? [] }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ExamEditor courseId={courseId} sessions={sessionOptions} files={fileOptions} exam={null} />
    </section>
  );
}
