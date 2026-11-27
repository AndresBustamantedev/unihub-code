import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app/app-shell";
import { buildQueue, cardStats, upcomingExams } from "@/features/flashcards/queries";
import { requirePageUser } from "@/lib/auth/page-guard";
import { displayCourseName } from "@/lib/course-color";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ReviewSession } from "./review-session";

export const metadata: Metadata = { title: "Repasar" };
export const dynamic = "force-dynamic";

const id = z.uuid().optional().catch(undefined);

export default async function RepasarPage({ searchParams }: { searchParams: Promise<{ curso?: string; examen?: string; clase?: string; material?: string }> }) {
  await requirePageUser("/repasar");
  const sp = await searchParams;
  const courseId = id.parse(sp.curso) ?? null;
  const examId = id.parse(sp.examen) ?? null;
  const sessionId = id.parse(sp.clase) ?? null;
  const moduleItemId = id.parse(sp.material) ?? null;
  const db = await createSupabaseServerClient();
  const [queue, stats, exams, { data: courses }] = await Promise.all([
    buildQueue(db, { courseId, examId, sessionId, moduleItemId }),
    cardStats(db),
    upcomingExams(db),
    db.from("courses").select("id, name"),
  ]);
  const names = new Map((courses ?? []).map((c) => [c.id, displayCourseName(c.name)]));
  const withCards = [...stats.byCourse.entries()].sort((a, b) => b[1].dueNow + b[1].fresh - (a[1].dueNow + a[1].fresh));
  const cards = [...queue.due, ...queue.fresh];
  const scopeLabel = queue.exam
    ? `Examen: ${queue.exam.title} · ${names.get(queue.exam.course_id) ?? ""}`
    : sessionId || moduleItemId
      ? `Tarjetas de ${cards[0]?.sourceLabel ?? "esta fuente"}`
      : courseId
        ? names.get(courseId)
        : "Todas las asignaturas";
  const backHref = sessionId ? `/clases/${sessionId}` : moduleItemId ? `/material/${moduleItemId}` : courseId ? `/asignaturas/${courseId}` : "/";

  const chip = (href: string, label: string, on: boolean, extra?: string) => (
    <Link key={href} href={href} className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-primary bg-accent-soft font-medium text-primary" : "border-border hover:bg-muted")}>
      {label}
      {extra && <span className="ml-1 opacity-70">{extra}</span>}
    </Link>
  );

  return (
    <AppShell active="/repasar">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Repasar</h1>
          <p className="text-sm text-muted-foreground">
            {scopeLabel}
            {" · "}
            {queue.due.length} para repasar · {queue.fresh.length} nuevas
            {!queue.exam && !sessionId && !moduleItemId && queue.newSeenToday > 0 && ` (ya has visto ${queue.newSeenToday} nuevas hoy)`}
          </p>
        </div>

        {(withCards.length > 1 || exams.length > 0) && !sessionId && !moduleItemId && (
          <nav aria-label="Qué repasar" className="flex flex-wrap gap-1.5">
            {chip("/repasar", "Todo", !courseId && !examId, `${stats.total.dueNow + Math.min(stats.total.fresh, queue.newLimit)}`)}
            {exams.map((e) => chip(`/repasar?examen=${e.id}`, `Examen ${names.get(e.course_id) ?? ""}`, examId === e.id, e.daysLeft === 0 ? "hoy" : `en ${e.daysLeft} d`))}
            {withCards.map(([cid, s]) => chip(`/repasar?curso=${cid}`, names.get(cid) ?? "", courseId === cid && !examId, `${s.dueNow + s.fresh}`))}
          </nav>
        )}

        {stats.total.total === 0 ? (
          <div className="rounded-lg border border-border bg-card p-5 text-sm">
            <p className="font-semibold">Aún no tienes tarjetas.</p>
            <p className="mt-1 text-muted-foreground">
              Créalas con la IA desde una clase («Tarjetas de repaso» → Crear con IA), desde un documento del material, o todas a la vez desde una asignatura.
            </p>
          </div>
        ) : (
          <ReviewSession key={`${courseId}-${examId}-${sessionId}-${moduleItemId}`} initial={cards} backHref={backHref} />
        )}

        <p className="text-xs text-muted-foreground">
          Repetición espaciada: lo que fallas vuelve en unos minutos y lo que sabes se espacia días o semanas. Como mucho {queue.newLimit} nuevas al día
          {queue.newLimit > 20 ? " (más de lo normal por un examen cercano)" : ""}.
        </p>
      </div>
    </AppShell>
  );
}
