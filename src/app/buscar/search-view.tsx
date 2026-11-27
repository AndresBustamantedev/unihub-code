"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Link2, NotebookPen, Search, Sparkles, Video } from "lucide-react";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import { askSearchAction, searchAction, type AskSource, type SearchItem } from "@/features/search/actions";
import { prepareMaterialsAction } from "@/features/search/prepare-actions";

interface CourseOption {
  id: string;
  name: string;
  followed: boolean;
}

interface Turn {
  q: string;
  answer: string | null;
  sources: AskSource[];
  error: string | null;
}

const KIND: Record<string, { label: string; Icon: typeof Video }> = {
  transcript: { label: "Clase", Icon: Video },
  class_note: { label: "Tus notas", Icon: NotebookPen },
  study_note: { label: "Apuntes IA", Icon: Sparkles },
  material: { label: "Material", Icon: FileText },
  material_note: { label: "Tus notas", Icon: NotebookPen },
  resource: { label: "Enlace", Icon: Link2 },
};

/** Las citas [n] de la respuesta, como enlaces a la fuente de la lista. */
function linkCitations(md: string, count: number): string {
  return md.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => (Number(n) >= 1 && Number(n) <= count ? `[[${n}]](#fuente-${n})` : m));
}

export function SearchView(props: {
  courses: CourseOption[];
  initialQuery: string;
  initialCourse: string | null;
  initialAsk: boolean;
  aiReady: boolean;
  aiLabel: string | null;
  desktop: boolean;
}) {
  const [q, setQ] = useState(props.initialQuery);
  const [courseId, setCourseId] = useState<string | null>(props.initialCourse);
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [searching, startSearch] = useTransition();
  const [asking, startAsk] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const retries = useRef(0);
  const courseName = courseId ? props.courses.find((c) => c.id === courseId)?.name : null;

  const updateUrl = (query: string, ask: boolean) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (courseId) sp.set("curso", courseId);
    if (ask) sp.set("preguntar", "1");
    window.history.replaceState(null, "", `/buscar${sp.size ? `?${sp}` : ""}`);
  };

  const search = (query = q) => {
    const text = query.trim();
    if (text.length < 2) return;
    updateUrl(text, false);
    startSearch(async () => {
      setError(null);
      const r = await searchAction({ q: text, courseId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setItems(r.items);
      setSearchedFor(text);
      setPending(r.pending);
    });
  };

  const ask = (question = q) => {
    const text = question.trim();
    if (text.length < 3) return;
    updateUrl(text, true);
    const history = turns.filter((t) => t.answer).map((t) => ({ q: t.q, a: t.answer! }));
    setTurns((ts) => [...ts, { q: text, answer: null, sources: [], error: null }]);
    setQ("");
    startAsk(async () => {
      const r = await askSearchAction({ question: text, courseId, history });
      setTurns((ts) =>
        ts.map((t, i) => (i === ts.length - 1 ? (r.ok ? { ...t, answer: r.answer, sources: r.sources } : { ...t, error: r.error }) : t)),
      );
      if (r.ok) setPending(r.pending);
    });
  };

  // Al llegar con ?q=… (desde una asignatura), se lanza solo.
  useEffect(() => {
    if (!props.initialQuery) {
      input.current?.focus();
      return;
    }
    if (props.initialAsk && props.aiReady) ask(props.initialQuery);
    else search(props.initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La primera vez se prepara el índice por partes: se repite la búsqueda hasta terminar.
  useEffect(() => {
    if (pending > 0 && searchedFor && retries.current < 20 && !searching) {
      const t = setTimeout(() => {
        retries.current++;
        search(searchedFor);
      }, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, searchedFor, searching]);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Qué buscas</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={2000}
              placeholder="Busca una palabra o haz una pregunta: ¿en qué clase explicó la regla de L'Hôpital?"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
          <select
            value={courseId ?? ""}
            onChange={(e) => setCourseId(e.target.value || null)}
            aria-label="Asignatura"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm sm:max-w-64"
          >
            <option value="">Todas las asignaturas</option>
            {props.courses.some((c) => c.followed) && (
              <optgroup label="Este semestre">
                {props.courses.filter((c) => c.followed).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            )}
            {props.courses.some((c) => !c.followed) && (
              <optgroup label="Semestres anteriores">
                {props.courses.filter((c) => !c.followed).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="outline" disabled={searching || q.trim().length < 2}>
            <Search className="size-3.5" /> {searching ? "Buscando…" : "Buscar"}
          </Button>
          <Button type="button" size="sm" disabled={!props.aiReady || asking || q.trim().length < 3} onClick={() => ask()}>
            <Sparkles className="size-3.5" /> {asking ? "Pensando…" : courseName ? `Preguntar a ${courseName}` : "Preguntar a la IA"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {props.aiReady
              ? `La IA responde con lo que hay en tus clases y material, y dice de dónde sale cada cosa${props.aiLabel ? ` · ${props.aiLabel}` : ""}.`
              : "Para preguntar a la IA, añade una clave de OpenAI en Ajustes."}
          </span>
        </div>
      </form>

      {pending > 0 && (
        <p className="text-xs text-muted-foreground motion-safe:animate-pulse">
          Preparando la búsqueda por primera vez (faltan {pending} clases o documentos)…
        </p>
      )}

      {turns.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Respuestas de la IA">
          {turns.map((t, i) => (
            <article key={i} className="rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-sm font-semibold">{t.q}</p>
              {t.answer ? (
                <>
                  <Markdown>{linkCitations(t.answer, t.sources.length)}</Markdown>
                  {t.sources.length > 0 && (
                    <div className="mt-3 border-t border-border pt-2">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Fuentes</p>
                      <ol className="space-y-0.5 text-xs">
                        {t.sources.map((s) => (
                          <li key={s.n} id={`fuente-${s.n}`} className="scroll-mt-20 target:rounded target:bg-accent-soft">
                            <span className="tabular mr-1 text-muted-foreground">[{s.n}]</span>
                            <Link href={s.href} className="hover:underline">{s.title}</Link>
                            {s.location && <span className="text-muted-foreground"> · {s.location}</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </>
              ) : t.error ? (
                <p role="alert" className="text-sm text-urgent">{t.error}</p>
              ) : (
                <p className="text-sm text-muted-foreground motion-safe:animate-pulse">Buscando en tus clases y material…</p>
              )}
            </article>
          ))}
          {!asking && turns.some((t) => t.answer) && <p className="text-xs text-muted-foreground">Puedes seguir preguntando: la IA recuerda la conversación.</p>}
        </section>
      )}

      {error && <p role="alert" className="text-sm text-urgent">{error}</p>}

      {items && (
        <section aria-label="Resultados" className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {items.length === 0
              ? `Nada encontrado para «${searchedFor}»${courseName ? ` en ${courseName}` : ""}.`
              : `${items.length}${items.length === 40 ? "+" : ""} resultado${items.length === 1 ? "" : "s"} para «${searchedFor}»${courseName ? ` en ${courseName}` : ""}`}
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((it) => {
              const kind = KIND[it.sourceType] ?? KIND.material!;
              return (
                <li key={it.key}>
                  <Link href={it.href} className="block px-3 py-2.5 hover:bg-muted/60">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <kind.Icon className="size-3.5" />
                      {kind.label}
                      {it.location && <span>· {it.location}</span>}
                      {it.matches > 1 && <span>· {it.matches} coincidencias</span>}
                      {!courseId && it.courseId && <span className="truncate">· {props.courses.find((c) => c.id === it.courseId)?.name}</span>}
                    </div>
                    <p className="mt-0.5 text-sm font-medium">{it.title}</p>
                    <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">
                      {it.snippet.map(([text, hit], j) =>
                        hit ? (
                          <mark key={j} className="rounded-sm bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">{text}</mark>
                        ) : (
                          <span key={j}>{text}</span>
                        ),
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <MaterialsHint desktop={props.desktop} courseId={courseId} />
    </div>
  );
}

/** El texto de los PDF entra en la búsqueda cuando se lee: en la web se puede preparar aquí. */
function MaterialsHint({ desktop, courseId }: { desktop: boolean; courseId: string | null }) {
  const [state, setState] = useState<{ done: number; left: number; failed: number } | null>(null);
  const [running, start] = useTransition();
  const stop = useRef(false);

  const run = () => {
    stop.current = false;
    start(async () => {
      let done = 0;
      let failed = 0;
      for (let i = 0; i < 60 && !stop.current; i++) {
        const r = await prepareMaterialsAction({ courseId });
        if (!r.ok) break;
        done += r.done;
        failed += r.failed;
        setState({ done, left: r.left, failed });
        if (r.left === 0 || r.done + r.failed === 0) break;
      }
    });
  };

  if (desktop) {
    return (
      <p className="text-xs text-muted-foreground">
        El material descargado de Canvas se añade a la búsqueda solo al sincronizar (los PDF escaneados, sin texto, no se pueden buscar).
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Los PDF entran en la búsqueda cuando se ha leído su texto (al abrirlos y preguntar a la IA, o desde aquí).</span>
      {running ? (
        <button type="button" className="underline" onClick={() => (stop.current = true)}>
          Leyendo material… {state ? `${state.done} listos, faltan ${state.left}` : ""} · parar
        </button>
      ) : (
        <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={run}>
          {state ? (state.left ? `Seguir leyendo el material (faltan ${state.left})` : "Material listo para buscar") : `Leer el material${courseId ? " de esta asignatura" : ""} para poder buscar en él`}
        </button>
      )}
      {state && state.failed > 0 && <span>({state.failed} no se pudieron leer: escaneados o bloqueados)</span>}
    </div>
  );
}
