import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SearchSourceType } from "@/lib/supabase/database.types";
import { chunkPages, chunkText, type Chunk } from "./chunk";

type DB = SupabaseClient<Database>;

/**
 * Mantiene el índice de búsqueda al día: compara la huella de cada fuente (transcripciones,
 * apuntes, notas, material, enlaces) con la que se indexó y solo trocea de nuevo lo que cambió.
 * Funciona igual contra Supabase (web) y contra la base de datos del programa.
 */

const STUDY_KIND: Record<string, string> = { summary: "Resumen", questions: "Preguntas de repaso", exercises: "Ejercicios" };
const BATCH = 20;
const INSERT_BATCH = 100;

interface State {
  source_type: SearchSourceType;
  source_id: string;
  course_id: string | null;
  hash: string;
}

interface Doc {
  source_type: SearchSourceType;
  source_id: string;
  course_id: string | null;
  title: string;
  href: string;
  chunks: Chunk[];
}

export interface IndexResult {
  indexed: number;
  removed: number;
  /** Fuentes que quedan por indexar (se sigue en la próxima llamada). */
  pending: number;
}

function day(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" });
}

const ids = (list: State[]) => list.map((s) => s.source_id);

async function loadDocs(db: DB, type: SearchSourceType, batch: State[]): Promise<Doc[]> {
  switch (type) {
    case "transcript": {
      const [{ data: sessions }, { data: texts }] = await Promise.all([
        db.from("class_sessions").select("id, course_id, title, session_at").in("id", ids(batch)),
        db.from("transcripts").select("session_id, content_text").in("session_id", ids(batch)),
      ]);
      const text = new Map((texts ?? []).map((t) => [t.session_id, t.content_text]));
      return (sessions ?? []).map((s) => ({
        source_type: type,
        source_id: s.id,
        course_id: s.course_id,
        title: `Clase · ${s.title} (${day(s.session_at)})`,
        href: `/clases/${s.id}`,
        chunks: chunkText(text.get(s.id) ?? ""),
      }));
    }
    case "class_note": {
      const { data } = await db.from("class_sessions").select("id, course_id, title, session_at, notes").in("id", ids(batch));
      return (data ?? []).map((s) => ({
        source_type: type,
        source_id: s.id,
        course_id: s.course_id,
        title: `Mis notas · ${s.title} (${day(s.session_at)})`,
        href: `/clases/${s.id}`,
        chunks: chunkText(s.notes ?? ""),
      }));
    }
    case "study_note": {
      const { data } = await db.from("study_notes").select("id, course_id, session_id, kind, content_md").in("id", ids(batch));
      const sessionIds = [...new Set((data ?? []).map((n) => n.session_id).filter((x): x is string => !!x))];
      const { data: sessions } = sessionIds.length
        ? await db.from("class_sessions").select("id, title, session_at").in("id", sessionIds)
        : { data: [] as { id: string; title: string; session_at: string }[] };
      const sess = new Map((sessions ?? []).map((s) => [s.id, s]));
      return (data ?? []).map((n) => {
        const s = n.session_id ? sess.get(n.session_id) : undefined;
        return {
          source_type: type,
          source_id: n.id,
          course_id: n.course_id,
          title: `Apuntes IA (${STUDY_KIND[n.kind] ?? n.kind}) · ${s ? `${s.title} (${day(s.session_at)})` : "asignatura"}`,
          href: n.session_id ? `/clases/${n.session_id}` : `/asignaturas/${n.course_id}`,
          chunks: chunkText(n.content_md),
        };
      });
    }
    case "material":
    case "material_note": {
      const itemIds = ids(batch);
      const [{ data: items }, contents] = await Promise.all([
        db.from("course_module_items").select("id, course_id, title").in("id", itemIds),
        type === "material"
          ? db.from("material_texts").select("module_item_id, content_text").in("module_item_id", itemIds)
          : db.from("material_notes").select("module_item_id, content_md").in("module_item_id", itemIds),
      ]);
      const text = new Map(
        ((contents.data ?? []) as Array<{ module_item_id: string; content_text?: string; content_md?: string }>).map((c) => [
          c.module_item_id,
          c.content_text ?? c.content_md ?? "",
        ]),
      );
      return (items ?? []).map((i) => ({
        source_type: type,
        source_id: i.id,
        course_id: i.course_id,
        title: type === "material" ? i.title : `Mis notas · ${i.title}`,
        href: `/material/${i.id}`,
        chunks: type === "material" ? chunkPages(text.get(i.id) ?? "") : chunkText(text.get(i.id) ?? ""),
      }));
    }
    case "resource": {
      const { data } = await db.from("class_resources").select("id, course_id, session_id, module_item_id, title, url, note").in("id", ids(batch));
      return (data ?? []).map((r) => ({
        source_type: type,
        source_id: r.id,
        course_id: r.course_id,
        title: `Enlace · ${r.title}`,
        href: r.session_id ? `/clases/${r.session_id}` : r.module_item_id ? `/material/${r.module_item_id}` : `/asignaturas/${r.course_id}`,
        chunks: [{ content: [r.title, r.note, r.url].filter(Boolean).join("\n"), location: null }],
      }));
    }
  }
}

async function replaceDoc(db: DB, userId: string, doc: Doc, hash: string): Promise<void> {
  const del = await db.from("search_chunks").delete().eq("source_type", doc.source_type).eq("source_id", doc.source_id);
  if (del.error) throw new Error(`search_chunks: ${del.error.message}`);
  const rows = doc.chunks.map((c, i) => ({
    user_id: userId,
    course_id: doc.course_id,
    source_type: doc.source_type,
    source_id: doc.source_id,
    chunk_index: i,
    title: doc.title.slice(0, 400),
    location: c.location,
    href: doc.href,
    content: c.content,
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const ins = await db.from("search_chunks").insert(rows.slice(i, i + INSERT_BATCH));
    if (ins.error) throw new Error(`search_chunks: ${ins.error.message}`);
  }
  const up = await db
    .from("search_sources")
    .upsert({ user_id: userId, source_type: doc.source_type, source_id: doc.source_id, hash, chunks: rows.length, indexed_at: new Date().toISOString() }, { onConflict: "user_id,source_type,source_id" });
  if (up.error) throw new Error(`search_sources: ${up.error.message}`);
}

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Pone el índice al día. Con `budgetMs` se para a tiempo y deja el resto para la próxima vez. */
export async function syncSearchIndex(db: DB, userId: string, opts: { budgetMs?: number } = {}): Promise<IndexResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  const { data: stateData, error } = await db.rpc("search_index_state");
  if (error) throw new Error(`search_index_state: ${error.message}`);
  const state = (stateData ?? []) as State[];
  const indexed = await readAll((a, b) =>
    db.from("search_sources").select("source_type, source_id, hash").order("source_id").range(a, b),
  );
  const key = (t: string, id: string) => `${t}:${id}`;
  const have = new Map(indexed.map((s) => [key(s.source_type, s.source_id), s.hash]));
  const current = new Set(state.map((s) => key(s.source_type, s.source_id)));

  // Fuentes que ya no existen: fuera del índice.
  let removed = 0;
  for (const s of indexed) {
    if (current.has(key(s.source_type, s.source_id))) continue;
    await db.from("search_chunks").delete().eq("source_type", s.source_type).eq("source_id", s.source_id);
    await db.from("search_sources").delete().eq("source_type", s.source_type).eq("source_id", s.source_id);
    removed++;
  }

  const stale = state.filter((s) => have.get(key(s.source_type, s.source_id)) !== s.hash);
  let done = 0;
  const types = [...new Set(stale.map((s) => s.source_type))];
  outer: for (const type of types) {
    const list = stale.filter((s) => s.source_type === type);
    for (let i = 0; i < list.length; i += BATCH) {
      if (Date.now() - started > budget) break outer;
      const batch = list.slice(i, i + BATCH);
      const hashes = new Map(batch.map((s) => [s.source_id, s.hash]));
      for (const doc of await loadDocs(db, type, batch)) {
        await replaceDoc(db, userId, doc, hashes.get(doc.source_id)!);
        done++;
      }
    }
  }
  return { indexed: done, removed, pending: stale.length - done };
}
