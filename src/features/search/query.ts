import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SearchHit, SearchSourceType } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

export interface SearchResult {
  sourceType: SearchSourceType;
  sourceId: string;
  courseId: string | null;
  title: string;
  href: string;
  /** Mejor fragmento de esta fuente. */
  best: SearchHit;
  /** Cuántos fragmentos de esta fuente coinciden. */
  matches: number;
}

/** Busca en el índice. Primero todas las palabras; si apenas hay resultados, cualquiera. */
export async function runSearch(db: DB, q: string, courseId: string | null, opts: { matchAny?: boolean; limit?: number } = {}): Promise<SearchHit[]> {
  const args = { q, course: courseId, match_any: !!opts.matchAny, lim: opts.limit ?? 60 };
  const { data, error } = await db.rpc("search_chunks_find", args);
  if (error) throw new Error(`search: ${error.message}`);
  let hits = (data ?? []) as SearchHit[];
  if (!opts.matchAny && hits.length < 3) {
    const any = await db.rpc("search_chunks_find", { ...args, match_any: true });
    if (!any.error) {
      const seen = new Set(hits.map((h) => h.id));
      hits = [...hits, ...((any.data ?? []) as SearchHit[]).filter((h) => !seen.has(h.id))];
    }
  }
  return hits;
}

/** Un resultado por fuente (clase, documento…), con su mejor fragmento. */
export function groupBySource(hits: SearchHit[]): SearchResult[] {
  const map = new Map<string, SearchResult>();
  for (const h of hits) {
    const k = `${h.source_type}:${h.source_id}`;
    const cur = map.get(k);
    if (cur) {
      cur.matches++;
      continue;
    }
    map.set(k, { sourceType: h.source_type, sourceId: h.source_id, courseId: h.course_id, title: h.title, href: h.href, best: h, matches: 1 });
  }
  return [...map.values()];
}

/**
 * Fragmentos para que la IA responda: los más relevantes, como mucho 3 por fuente (para variar)
 * y sin pasarse de `maxChars` en total.
 */
export function pickContext(hits: SearchHit[], maxChars = 36_000, perSource = 3, max = 16): SearchHit[] {
  const count = new Map<string, number>();
  const out: SearchHit[] = [];
  let total = 0;
  for (const h of hits) {
    const k = `${h.source_type}:${h.source_id}`;
    if ((count.get(k) ?? 0) >= perSource) continue;
    if (total + h.content.length > maxChars) continue;
    count.set(k, (count.get(k) ?? 0) + 1);
    out.push(h);
    total += h.content.length;
    if (out.length >= max) break;
  }
  return out;
}
