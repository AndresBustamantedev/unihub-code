"use client";

import { useMemo, useState } from "react";
import { ClipboardList, ExternalLink, FileText, Link2, ListChecks, MessagesSquare, Puzzle, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Mod {
  id: string;
  name: string;
  state: string | null;
  isTopic: boolean;
}
interface Item {
  id: string;
  module_id: string;
  title: string;
  item_type: string;
  indent: number;
  href: string | null;
}

const ICON: Record<string, LucideIcon> = { File: FileText, Page: FileText, Assignment: ClipboardList, Quiz: ListChecks, Discussion: MessagesSquare, ExternalUrl: Link2, ExternalTool: Puzzle };
const FILTERS = [
  { key: "all", label: "Todo", types: null },
  { key: "files", label: "Archivos", types: ["File"] },
  { key: "pages", label: "Páginas", types: ["Page"] },
  { key: "links", label: "Enlaces y herramientas", types: ["ExternalUrl", "ExternalTool"] },
  { key: "tasks", label: "Actividades", types: ["Assignment", "Quiz", "Discussion"] },
] as const;

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Material del curso organizado por módulos, con filtro por tipo y búsqueda. */
export function MaterialBrowser({ modules, items }: { modules: Mod[]; items: Item[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const types = FILTERS.find((f) => f.key === filter)?.types ?? null;
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, items.filter((i) => i.item_type !== "SubHeader" && (!f.types || (f.types as readonly string[]).includes(i.item_type))).length])),
    [items],
  );
  const needle = norm(q.trim());
  const visible = (i: Item) =>
    (i.item_type === "SubHeader" ? !types && !needle : (!types || (types as readonly string[]).includes(i.item_type)) && (!needle || norm(i.title).includes(needle)));
  const filtering = !!types || !!needle;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn("rounded-md px-2.5 py-1 text-sm", filter === f.key ? "bg-accent-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {f.label} <span className="tabular text-xs opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto min-w-48 flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar material…"
            className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      {modules.map((m) => {
        const mItems = items.filter((i) => i.module_id === m.id && visible(i));
        if (filtering && mItems.length === 0) return null;
        return (
          <details key={m.id} open={m.isTopic || filtering} className="rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5">
              <span className="truncate text-sm font-semibold">{m.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {m.isTopic && <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-primary">tema actual</span>}
                {m.state === "locked" && <span>bloqueado</span>}
                <span className="tabular">{mItems.filter((i) => i.item_type !== "SubHeader").length}</span>
              </span>
            </summary>
            <ul className="border-t border-border px-4 py-1.5">
              {mItems.length === 0 && <li className="py-1 text-sm text-muted-foreground">Vacío</li>}
              {mItems.map((i) => {
                if (i.item_type === "SubHeader") return <li key={i.id} className="pb-0.5 pt-2.5 text-xs font-semibold text-muted-foreground">{i.title}</li>;
                const Icon = ICON[i.item_type] ?? FileText;
                return (
                  <li key={i.id} style={{ paddingLeft: `${Math.min(i.indent, 4) * 14}px` }}>
                    {i.href ? (
                      i.href.startsWith("/") ? (
                        <a href={i.href} className="group flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{i.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground opacity-0 group-hover:opacity-100">Ver</span>
                        </a>
                      ) : (
                        <a href={i.href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{i.title}</span>
                          <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </a>
                      )
                    ) : (
                      <span className="flex items-center gap-2 px-1 py-1.5 text-sm">
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{i.title}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      {filtering && modules.every((m) => items.filter((i) => i.module_id === m.id && visible(i)).length === 0) && (
        <p className="text-sm text-muted-foreground">Nada coincide con el filtro.</p>
      )}
    </div>
  );
}
