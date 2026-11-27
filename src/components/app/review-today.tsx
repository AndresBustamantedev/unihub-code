import Link from "next/link";
import { Layers } from "lucide-react";
import { buildQueue, upcomingExams } from "@/features/flashcards/queries";
import { displayCourseName } from "@/lib/course-color";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Inicio: lo que toca repasar hoy y los exámenes que se acercan. Se carga aparte (Suspense). */
export async function ReviewToday() {
  const db = await createSupabaseServerClient();
  const [queue, exams] = await Promise.all([buildQueue(db), upcomingExams(db)]);
  const today = queue.due.length + queue.fresh.length;
  const soon = exams.filter((e) => e.daysLeft <= 30).slice(0, 3);
  if (!today && !soon.length) return null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3" aria-label="Repaso de hoy">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Layers className="size-4 text-primary" />
          {today ? `Hoy te tocan ${today} ${today === 1 ? "tarjeta" : "tarjetas"}` : "Repaso al día"}
          {today > 0 && <span className="font-normal text-muted-foreground">({queue.due.length} de repaso · {queue.fresh.length} nuevas)</span>}
        </p>
        {soon.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {soon.map((e, i) => (
              <span key={e.id}>
                {i > 0 && " · "}
                <Link href={`/repasar?examen=${e.id}`} className="hover:text-foreground hover:underline">
                  {e.title} de {displayCourseName(e.courseName)} {e.daysLeft === 0 ? "hoy" : e.daysLeft === 1 ? "mañana" : `en ${e.daysLeft} días`}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
      {today > 0 && (
        <Link href="/repasar" className="inline-flex h-8 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
          Repasar ahora
        </Link>
      )}
    </section>
  );
}
