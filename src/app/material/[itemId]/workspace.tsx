"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Link2, NotebookPen, Send } from "lucide-react";
import { Markdown } from "@/components/app/markdown";
import { ResourcesPanel } from "@/components/app/resources-panel";
import { askMaterialAction, saveMaterialNoteAction } from "@/features/materials/actions";
import { ASK_PRESETS, type AskMode } from "@/features/materials/ask-prompts";
import type { ClassResourceRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Tab = "notas" | "enlaces" | "ia";
interface Turn {
  q: string;
  a: string | null;
  error?: string;
}

function Notes({ itemId, initial, value, setValue }: { itemId: string; initial: string; value: string; setValue: (v: string) => void }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [preview, setPreview] = useState(false);
  const last = useRef(initial);

  // Guardado automático un segundo después de dejar de escribir.
  useEffect(() => {
    if (value === last.current) return;
    setStatus("saving");
    const t = setTimeout(async () => {
      const r = await saveMaterialNoteAction(itemId, value);
      if (r.ok) last.current = value;
      setStatus(r.ok ? "saved" : "error");
    }, 1000);
    return () => clearTimeout(t);
  }, [value, itemId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span aria-live="polite">
          {status === "saving" ? "Guardando…" : status === "saved" ? "Guardado" : status === "error" ? "No se pudo guardar" : "Se guarda solo · Markdown"}
        </span>
        <button type="button" onClick={() => setPreview((v) => !v)} className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
          {preview ? "Editar" : "Vista previa"}
        </button>
      </div>
      {preview ? (
        <div className="min-h-64 flex-1 overflow-y-auto rounded-md border border-border bg-background p-3">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Sin notas todavía.</p>}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={50_000}
          placeholder={"Apuntes de este documento…\n\n- Idea clave (p. 3)\n- Duda para la tutoría"}
          aria-label="Notas del material"
          className="min-h-64 flex-1 resize-none rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </div>
  );
}

function Ask({ itemId, aiReady, aiReason, aiLabel, onSaveToNotes }: { itemId: string; aiReady: boolean; aiReason: string | null; aiLabel: string | null; onSaveToNotes: (md: string) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  // Con llaves: en Chrome reciente scrollIntoView devuelve una promesa y React no admite que el efecto devuelva nada.
  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  if (!aiReady) {
    return (
      <p className="text-sm text-muted-foreground">
        Para preguntar a la IA añade tu clave de OpenAI (en el programa: Ajustes → Cambiar claves; en la web: <code>OPENAI_API_KEY</code>).
        {aiReason ? <span className="mt-1 block text-xs">{aiReason}</span> : null}
      </p>
    );
  }

  const ask = (mode: AskMode, question: string, label: string) => {
    const history = turns.filter((t) => t.a).map((t) => ({ q: t.q, a: t.a! }));
    setTurns((ts) => [...ts, { q: label, a: null }]);
    setQ("");
    start(async () => {
      const r = await askMaterialAction({ itemId, mode, question, history });
      setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? (r.ok ? { ...t, a: r.answer } : { ...t, error: r.error }) : t)));
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {aiLabel && (
        <p className="text-[11px] text-muted-foreground">
          Con {aiLabel} ·{" "}
          <Link href="/ajustes" className="underline-offset-2 hover:underline">cambiar</Link>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {ASK_PRESETS.map((p) => (
          <button
            key={p.mode}
            type="button"
            disabled={pending}
            onClick={() => ask(p.mode, "", p.label)}
            className="h-7 rounded-md border border-border bg-card px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="min-h-48 flex-1 space-y-3 overflow-y-auto">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Pregunta lo que no entiendas del documento. La IA lo lee entero (la primera vez tarda un poco) y cita las páginas.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5">
            <p className="ml-6 rounded-lg bg-accent-soft px-2.5 py-1.5 text-sm text-primary">{t.q}</p>
            {t.a ? (
              <div className="rounded-lg border border-border bg-background p-2.5">
                <Markdown>{t.a}</Markdown>
                <button
                  type="button"
                  onClick={() => onSaveToNotes(`### ${t.q}\n\n${t.a}`)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <NotebookPen className="size-3" /> Añadir a mis notas
                </button>
              </div>
            ) : t.error ? (
              <p role="alert" className="text-sm text-urgent">{t.error}</p>
            ) : (
              <p className="text-sm text-muted-foreground motion-safe:animate-pulse">Leyendo el documento…</p>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask("pregunta", q.trim(), q.trim());
        }}
        className="flex gap-1.5"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={2000}
          placeholder="¿Qué significa la integral por partes?"
          aria-label="Pregunta sobre el documento"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="submit" disabled={pending || !q.trim()} aria-label="Preguntar" className="inline-flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** Panel lateral del visor: notas propias, enlaces de refuerzo y preguntas a la IA sobre el documento. */
export function MaterialWorkspace({
  itemId,
  courseId,
  note,
  resources,
  aiReady,
  aiReason,
  aiLabel = null,
  canAsk,
}: {
  itemId: string;
  courseId: string;
  note: string;
  resources: ClassResourceRow[];
  aiReady: boolean;
  aiReason: string | null;
  aiLabel?: string | null;
  /** Solo PDF, texto y HTML se pueden leer. */
  canAsk: boolean;
}) {
  const [tab, setTab] = useState<Tab>(canAsk ? "ia" : "notas");
  const [notes, setNotes] = useState(note);
  const tabs: { id: Tab; label: string; Icon: typeof Bot; count?: number }[] = [
    { id: "notas", label: "Notas", Icon: NotebookPen },
    { id: "enlaces", label: "Enlaces", Icon: Link2, count: resources.length },
    ...(canAsk ? [{ id: "ia" as const, label: "Preguntar", Icon: Bot }] : []),
  ];

  return (
    <aside className="flex min-h-[28rem] flex-col rounded-lg border border-border bg-card lg:h-full">
      <div role="tablist" aria-label="Herramientas de estudio" className="flex border-b border-border px-1.5">
        {tabs.map(({ id, label, Icon, count }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-sm",
              tab === id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" /> {label}
            {count ? <span className="tabular text-xs opacity-70">{count}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {/* Las notas siguen montadas aunque cambies de pestaña: así no se pierde un guardado pendiente. */}
        <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "notas" && "hidden")}>
          <Notes itemId={itemId} initial={note} value={notes} setValue={setNotes} />
        </div>
        {tab === "enlaces" && (
          <ResourcesPanel bare courseId={courseId} itemId={itemId} items={resources} title="Enlaces de refuerzo" empty="Guarda vídeos o webs que te ayuden con este documento." />
        )}
        <div className={cn("flex min-h-0 flex-1 flex-col", tab !== "ia" && "hidden")}>
        {canAsk && (
          <Ask
            itemId={itemId}
            aiReady={aiReady}
            aiReason={aiReason}
            aiLabel={aiLabel}
            onSaveToNotes={(md) => {
              setNotes((n) => (n.trim() ? `${n.trim()}\n\n${md}` : md));
              setTab("notas");
            }}
          />
        )}
        </div>
      </div>
    </aside>
  );
}
