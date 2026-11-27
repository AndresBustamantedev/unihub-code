"use client";

import { useMemo, useState } from "react";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Visor con búsqueda: resalta coincidencias (sin acentos ni mayúsculas) y muestra cuántas hay. */
export function TranscriptViewer({ text }: { text: string }) {
  const [q, setQ] = useState("");
  const paragraphs = useMemo(() => text.split(/\n{2,}/), [text]);
  const needle = q.trim();
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const matches = useMemo(() => {
    if (needle.length < 2) return null;
    const n = norm(needle);
    return paragraphs.map((p) => norm(p).includes(n));
  }, [needle, paragraphs]);
  const count = matches?.filter(Boolean).length ?? 0;

  const highlight = (p: string) => {
    if (needle.length < 2) return p;
    // Resaltado sobre el texto normalizado para respetar acentos.
    const n = norm(p);
    const re = new RegExp(escapeRe(norm(needle)), "g");
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of n.matchAll(re)) {
      const i = m.index ?? 0;
      out.push(p.slice(last, i), <mark key={i} className="rounded bg-amber-300/60 text-inherit">{p.slice(i, i + needle.length)}</mark>);
      last = i + needle.length;
    }
    out.push(p.slice(last));
    return out;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en la transcripción…"
          className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {matches && <span className="shrink-0 text-xs text-muted-foreground">{count} párrafo{count === 1 ? "" : "s"}</span>}
      </div>
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {paragraphs.map((p, i) => {
          if (matches && !matches[i]) return null;
          const sp = /^([^:\n]{2,80}):\s([\s\S]*)$/.exec(p);
          return (
            <p key={i} className="mb-2 text-sm leading-relaxed">
              {sp ? (
                <>
                  <span className="font-semibold">{sp[1]}: </span>
                  {highlight(sp[2] ?? "")}
                </>
              ) : (
                highlight(p)
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
