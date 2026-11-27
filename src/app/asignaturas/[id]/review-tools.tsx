"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteExamAction, generateCardsAction, saveExamAction, sessionsWithoutCardsAction } from "@/features/flashcards/actions";

/** Crea tarjetas con IA de todas las clases que aún no tienen (una a una, con progreso). */
export function BulkCreateCards({ courseId, aiReady }: { courseId: string; aiReady: boolean }) {
  const router = useRouter();
  const [running, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const stop = useRef(false);

  const run = () => {
    stop.current = false;
    start(async () => {
      const list = await sessionsWithoutCardsAction(courseId);
      if (!list.ok) return setStatus(list.error);
      if (!list.ids.length) return setStatus("Todas las clases con transcripción ya tienen tarjetas.");
      let created = 0;
      let failed = 0;
      for (const [i, id] of list.ids.entries()) {
        if (stop.current) break;
        setStatus(`Creando tarjetas… clase ${i + 1} de ${list.ids.length}`);
        const r = await generateCardsAction({ target: "session", id });
        if (r.ok) created += r.created;
        else failed++;
      }
      setStatus(`${created} tarjetas creadas${failed ? ` (${failed} clases fallaron; vuelve a intentarlo)` : ""}.`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {running ? (
        <Button size="sm" variant="outline" onClick={() => (stop.current = true)}>Parar</Button>
      ) : (
        <Button size="sm" variant="outline" disabled={!aiReady} onClick={run} title={aiReady ? undefined : "Configura la IA en Ajustes"}>
          <Sparkles className="size-3.5" /> Crear tarjetas de todas las clases
        </Button>
      )}
      {status && <span className="text-xs text-muted-foreground" role="status">{status}</span>}
    </div>
  );
}

interface Option {
  id: string;
  label: string;
}

/** Nuevo examen o editar uno: nombre, fecha y qué entra (por defecto, toda la asignatura). */
export function ExamEditor(props: {
  courseId: string;
  sessions: Option[];
  files: Option[];
  exam: { id: string; title: string; examAt: string; sessionIds: string[]; moduleItemIds: string[] } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(props.exam?.title ?? "Examen");
  const [examAt, setExamAt] = useState(props.exam?.examAt ?? "");
  const [whole, setWhole] = useState(!props.exam || (!props.exam.sessionIds.length && !props.exam.moduleItemIds.length));
  const [sessionIds, setSessionIds] = useState<string[]>(props.exam?.sessionIds ?? []);
  const [itemIds, setItemIds] = useState<string[]>(props.exam?.moduleItemIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className={props.exam ? "" : "self-start"}>
        {props.exam ? "Editar" : "+ Añadir examen"}
      </Button>
    );
  }

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-md border border-border bg-background p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveExamAction({
            id: props.exam?.id ?? null,
            courseId: props.courseId,
            title,
            examAt,
            sessionIds: whole ? [] : sessionIds,
            moduleItemIds: whole ? [] : itemIds,
          });
          if (!r.ok) return setError(r.error);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 text-xs font-medium text-muted-foreground">
          Nombre
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Fecha
          <input type="date" value={examAt} onChange={(e) => setExamAt(e.target.value)} required className="mt-1 h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground" />
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">¿Qué entra?</legend>
        <label className="mr-4 inline-flex items-center gap-1.5">
          <input type="radio" checked={whole} onChange={() => setWhole(true)} /> Toda la asignatura
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="radio" checked={!whole} onChange={() => setWhole(false)} /> Elegir clases y documentos
        </label>
      </fieldset>
      {!whole && (
        <div className="grid max-h-64 gap-3 overflow-y-auto sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold">Clases ({sessionIds.length})</p>
            {props.sessions.length === 0 && <p className="text-xs text-muted-foreground">Sin clases importadas.</p>}
            {props.sessions.map((o) => (
              <label key={o.id} className="flex items-start gap-1.5 py-0.5 text-xs">
                <input type="checkbox" checked={sessionIds.includes(o.id)} onChange={() => toggle(sessionIds, setSessionIds, o.id)} className="mt-0.5" />
                {o.label}
              </label>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Documentos ({itemIds.length})</p>
            {props.files.length === 0 && <p className="text-xs text-muted-foreground">Sin documentos.</p>}
            {props.files.map((o) => (
              <label key={o.id} className="flex items-start gap-1.5 py-0.5 text-xs">
                <input type="checkbox" checked={itemIds.includes(o.id)} onChange={() => toggle(itemIds, setItemIds, o.id)} className="mt-0.5" />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-urgent">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending || (!whole && !sessionIds.length && !itemIds.length)}>
          {pending ? "Guardando…" : "Guardar examen"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        {props.exam && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto text-urgent"
            onClick={() => {
              if (!window.confirm("¿Borrar este examen? Las tarjetas no se borran.")) return;
              start(async () => {
                const r = await deleteExamAction(props.exam!.id, props.courseId);
                if (!r.ok) return setError(r.error);
                router.refresh();
              });
            }}
          >
            Borrar examen
          </Button>
        )}
      </div>
    </form>
  );
}
