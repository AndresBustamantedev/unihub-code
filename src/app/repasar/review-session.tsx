"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import { deleteCardAction, reviewCardAction, updateCardAction } from "@/features/flashcards/actions";
import type { StudyCard } from "@/features/flashcards/queries";
import { previewIntervals, schedule, type Rating } from "@/features/flashcards/srs";

const RATINGS: { r: Rating; label: string; tone: string }[] = [
  { r: 1, label: "Otra vez", tone: "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-950/40" },
  { r: 2, label: "Difícil", tone: "border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-950/40" },
  { r: 3, label: "Bien", tone: "border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-950/40" },
  { r: 4, label: "Fácil", tone: "border-sky-300 text-sky-800 hover:bg-sky-50 dark:border-sky-500/40 dark:text-sky-200 dark:hover:bg-sky-950/40" },
];

/** Si vuelve a tocar dentro de este tiempo, se repite en la misma sesión. */
const REPEAT_WITHIN_MIN = 20;

/**
 * Sesión de repaso: pregunta → «Mostrar respuesta» (espacio) → Otra vez / Difícil / Bien / Fácil
 * (teclas 1–4). Las tarjetas falladas vuelven a salir unas cuantas tarjetas después.
 */
export function ReviewSession({ initial, backHref }: { initial: StudyCard[]; backHref: string }) {
  const [queue, setQueue] = useState<StudyCard[]>(initial);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ front: string; back: string } | null>(null);
  const [pending, start] = useTransition();
  const card = queue[0];
  const preview = useMemo(() => (card ? previewIntervals(card, Date.now(), card.examAt) : null), [card]);

  const rate = useCallback(
    (r: Rating) => {
      if (!card || !shown || pending) return;
      const local = schedule(card, r, Date.now(), card.examAt);
      setQueue((q) => {
        const rest = q.slice(1);
        if (local.dueInMinutes > REPEAT_WITHIN_MIN) return rest;
        // Vuelve en unas cartas (o al final si quedan pocas).
        const again: StudyCard = { ...card, ...local };
        const at = Math.min(rest.length, r === 1 ? 3 : 6);
        return [...rest.slice(0, at), again, ...rest.slice(at)];
      });
      setShown(false);
      setDone((n) => n + 1);
      setError(null);
      start(async () => {
        const res = await reviewCardAction({ cardId: card.id, rating: r });
        if (!res.ok) setError(res.error);
      });
    },
    [card, shown, pending],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key) as Rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, rate, editing]);

  if (!card) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-5">
        <p className="text-base font-semibold">{done ? `¡Listo! Has repasado ${done} ${done === 1 ? "tarjeta" : "tarjetas"}.` : "No te toca nada por ahora."}</p>
        <p className="text-sm text-muted-foreground">Las que has visto volverán cuando toque repasarlas. Crea más desde una clase, un documento o la asignatura.</p>
        <Link href={backHref} className="text-sm font-medium text-primary hover:underline">Volver</Link>
      </div>
    );
  }

  const isNew = card.state === "new";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Quedan <strong className="text-foreground">{queue.length}</strong>
          {done > 0 && ` · ${done} hechas`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 ${isNew ? "bg-accent-soft text-primary" : "bg-muted"}`}>{isNew ? "Nueva" : card.state === "learning" ? "Aprendiendo" : "Repaso"}</span>
          <span className="truncate">{card.courseName}</span>
        </span>
      </div>

      <article className="flex min-h-64 flex-col rounded-xl border border-border bg-card p-5" aria-live="polite">
        {editing ? (
          <form
            className="flex flex-1 flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const next = editing;
              start(async () => {
                const r = await updateCardAction({ id: card.id, ...next });
                if (!r.ok) return setError(r.error);
                setQueue((q) => q.map((c) => (c.id === card.id ? { ...c, ...next } : c)));
                setEditing(null);
              });
            }}
          >
            <label className="text-xs font-medium text-muted-foreground">
              Pregunta
              <textarea value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} rows={3} maxLength={1000} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Respuesta
              <textarea value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} rows={5} maxLength={4000} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground" />
            </label>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>Guardar</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </form>
        ) : (
          <>
            <div className="text-[15px] font-medium">
              <Markdown>{card.front}</Markdown>
            </div>
            {shown && (
              <div className="mt-3 border-t border-dashed border-border pt-3">
                <Markdown>{card.back}</Markdown>
              </div>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
              {card.sourceLabel ? (
                <Link href={card.href} className="truncate hover:text-foreground hover:underline">De: {card.sourceLabel}</Link>
              ) : (
                <span />
              )}
              <span className="flex shrink-0 gap-1">
                <button type="button" aria-label="Editar tarjeta" onClick={() => setEditing({ front: card.front, back: card.back })} className="rounded p-1 hover:bg-muted hover:text-foreground">
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Borrar tarjeta"
                  onClick={() => {
                    if (!window.confirm("¿Borrar esta tarjeta?")) return;
                    start(async () => {
                      const r = await deleteCardAction(card.id);
                      if (!r.ok) return setError(r.error);
                      setQueue((q) => q.filter((c) => c.id !== card.id));
                      setShown(false);
                    });
                  }}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
          </>
        )}
      </article>

      {!editing &&
        (shown ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map(({ r, label, tone }) => (
              <button key={r} type="button" onClick={() => rate(r)} className={`flex flex-col items-center rounded-lg border bg-card px-2 py-2 text-sm font-medium ${tone}`}>
                {label}
                <span className="text-xs font-normal opacity-75">
                  {preview?.[r]} · {r}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Button onClick={() => setShown(true)} className="h-11">
            Mostrar respuesta <span className="ml-1 text-xs opacity-70">(espacio)</span>
          </Button>
        ))}
      {error && <p role="alert" className="text-sm text-urgent">{error}</p>}
    </div>
  );
}
