"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Layers, Plus, Sparkles } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { createCardAction, generateCardsAction } from "@/features/flashcards/actions";

export interface PanelCard {
  id: string;
  front: string;
  back: string;
}

/** «Tarjetas de repaso» de una clase o un documento: crear con IA, añadir a mano y repasar. */
export function FlashcardsPanel(props: {
  target: "session" | "material";
  id: string;
  courseId: string;
  cards: PanelCard[];
  aiReady: boolean;
  hasSource: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [open, setOpen] = useState(false);
  const n = props.cards.length;
  const reviewHref = props.target === "session" ? `/repasar?clase=${props.id}` : `/repasar?material=${props.id}`;

  const generate = () =>
    start(async () => {
      setMsg(null);
      const r = await generateCardsAction({ target: props.target, id: props.id });
      setMsg(r.ok ? { ok: true, text: `${r.created} tarjetas nuevas creadas.` } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <section className="rounded-lg border border-border bg-card p-3" aria-label="Tarjetas de repaso">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="size-4" /> Tarjetas de repaso
          </h2>
          <p className="text-xs text-muted-foreground">
            {n ? `${n} ${n === 1 ? "tarjeta" : "tarjetas"}` : `Crea preguntas y respuestas de ${props.target === "session" ? "esta clase" : "este documento"} para repasarlas con repetición espaciada.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {n > 0 && (
            <Link href={reviewHref} className={buttonClass({ size: "sm" })}>
              Repasar estas
            </Link>
          )}
          <Button size="sm" variant="outline" disabled={pending || !props.aiReady || !props.hasSource} onClick={generate} title={!props.aiReady ? "Configura la IA en Ajustes" : !props.hasSource ? "No hay texto del que sacar tarjetas" : undefined}>
            <Sparkles className="size-3.5" /> {pending ? "Creando…" : n ? "Crear más con IA" : "Crear con IA"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-3.5" /> A mano
          </Button>
        </div>
      </div>

      {msg && <p role="status" className={`mt-2 text-xs ${msg.ok ? "text-muted-foreground" : "text-urgent"}`}>{msg.text}</p>}

      {adding && (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createCardAction({
                courseId: props.courseId,
                sessionId: props.target === "session" ? props.id : null,
                moduleItemId: props.target === "material" ? props.id : null,
                front,
                back,
              });
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setFront("");
              setBack("");
              setMsg({ ok: true, text: "Tarjeta añadida." });
              router.refresh();
            });
          }}
        >
          <input value={front} onChange={(e) => setFront(e.target.value)} required maxLength={1000} placeholder="Pregunta" className="h-9 rounded-md border border-border bg-background px-2.5 text-sm" />
          <textarea value={back} onChange={(e) => setBack(e.target.value)} required maxLength={4000} rows={3} placeholder="Respuesta" className="rounded-md border border-border bg-background p-2.5 text-sm" />
          <div>
            <Button type="submit" size="sm" disabled={pending}>Añadir tarjeta</Button>
          </div>
        </form>
      )}

      {n > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
            {open ? "Ocultar tarjetas" : "Ver tarjetas"}
          </button>
          {open && (
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm">
              {props.cards.map((c) => (
                <li key={c.id}>
                  <p className="font-medium">{c.front}</p>
                  <p className="text-muted-foreground">{c.back}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
