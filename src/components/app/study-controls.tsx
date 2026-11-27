"use client";

import { useOptimistic, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { updateStudyAction, type StudyChange } from "@/features/classes/progress-actions";
import type { ReviewState, Understanding } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

interface StudyState {
  watched: boolean;
  understanding: Understanding | null;
  review: ReviewState | null;
  reviewCount: number;
}

function apply(s: StudyState, c: StudyChange): StudyState {
  if (c.type === "watched") return c.value ? { ...s, watched: true } : { ...s, watched: false, understanding: null, review: null };
  if (c.type === "understanding") return { ...s, watched: true, understanding: c.value };
  return { ...s, watched: true, review: c.value, reviewCount: c.value === "done" ? s.reviewCount + 1 : s.reviewCount };
}

const LEVELS: ReadonlyArray<{ id: Understanding; label: string; on: string }> = [
  { id: "low", label: "No", on: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  { id: "mid", label: "Regular", on: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  { id: "high", label: "Sí", on: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
];

const pill = "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Seguimiento de estudio de una clase: vista, si la entendiste y si la estás repasando.
 * Los cambios se ven al instante y se guardan en segundo plano.
 */
export function StudyControls({
  id,
  watched,
  understanding,
  review,
  reviewCount,
  className,
}: {
  id: string;
  watched: boolean;
  understanding: Understanding | null;
  review: ReviewState | null;
  reviewCount: number;
  className?: string;
}) {
  const [state, setState] = useOptimistic<StudyState, StudyChange>({ watched, understanding, review, reviewCount }, apply);
  const [, start] = useTransition();
  const run = (c: StudyChange) =>
    start(async () => {
      setState(c);
      await updateStudyAction(id, c);
    });

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => run({ type: "watched", value: !state.watched })}
        aria-pressed={state.watched}
        className={cn(
          pill,
          state.watched
            ? "border-emerald-600/30 bg-emerald-600 text-white hover:bg-emerald-700"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <Check className="size-3.5" /> {state.watched ? "Vista" : "Marcar vista"}
      </button>

      <div role="group" aria-label="¿La entendiste?" className="inline-flex h-7 items-center rounded-md border border-border bg-card p-0.5">
        <span className="px-1.5 text-[11px] text-muted-foreground">¿Entendida?</span>
        {LEVELS.map((l) => {
          const on = state.understanding === l.id;
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              onClick={() => run({ type: "understanding", value: on ? null : l.id })}
              className={cn(
                "h-6 rounded px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? cn(l.on, "font-semibold") : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {state.review === "reviewing" ? (
        <span className="inline-flex items-center gap-1">
          <button type="button" onClick={() => run({ type: "review", value: null })} aria-pressed className={cn(pill, "border-primary/30 bg-accent-soft text-primary")} title="Dejar de repasar">
            <RotateCcw className="size-3.5" /> Repasando
          </button>
          <button type="button" onClick={() => run({ type: "review", value: "done" })} className={cn(pill, "border-border bg-card hover:bg-muted")}>
            Repaso hecho
          </button>
        </span>
      ) : state.review === "done" ? (
        <button
          type="button"
          onClick={() => run({ type: "review", value: "reviewing" })}
          className={cn(pill, "border-border bg-card text-muted-foreground hover:text-foreground")}
          title="Empezar otro repaso"
        >
          <RotateCcw className="size-3.5" /> Repasada{state.reviewCount > 1 ? ` ×${state.reviewCount}` : ""}
        </button>
      ) : (
        <button type="button" onClick={() => run({ type: "review", value: "reviewing" })} className={cn(pill, "border-border bg-card text-muted-foreground hover:text-foreground")}>
          <RotateCcw className="size-3.5" /> Repasar
        </button>
      )}
    </div>
  );
}
