"use server";

import { z } from "zod";
import { AiError, complete, describeAiError } from "@/integrations/ai/provider";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { snippet } from "./chunk";
import { syncSearchIndex } from "./indexer";
import { groupBySource, pickContext, runSearch } from "./query";
import { buildSearchAskPrompt } from "./ask-prompt";
import { questionKeywords } from "./keywords";

export interface SearchItem {
  key: string;
  title: string;
  href: string;
  location: string | null;
  courseId: string | null;
  sourceType: string;
  matches: number;
  snippet: Array<[string, boolean]>;
}

export type SearchActionResult =
  | { ok: true; items: SearchItem[]; pending: number }
  | { ok: false; error: string };

const searchSchema = z.object({ q: z.string().trim().min(2).max(200), courseId: z.uuid().nullable() });

/** Buscador: resultados por clase o documento, con el fragmento donde aparece. */
export async function searchAction(input: z.input<typeof searchSchema>): Promise<SearchActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe al menos 2 letras." };
  const db = await createSupabaseServerClient();
  try {
    const idx = await syncSearchIndex(db, auth.user.id, { budgetMs: 8_000 });
    const hits = await runSearch(db, parsed.data.q, parsed.data.courseId);
    const items = groupBySource(hits).slice(0, 40).map((r) => ({
      key: `${r.sourceType}:${r.sourceId}`,
      title: r.title,
      href: r.href,
      location: r.best.location,
      courseId: r.courseId,
      sourceType: r.sourceType,
      matches: r.matches,
      snippet: snippet(r.best.content, parsed.data.q),
    }));
    return { ok: true, items, pending: idx.pending };
  } catch (err) {
    logger.error("search_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    return { ok: false, error: "No se pudo buscar. Vuelve a intentarlo." };
  }
}

const askSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  courseId: z.uuid().nullable(),
  history: z.array(z.object({ q: z.string().max(2000), a: z.string().max(20000) })).max(10),
});

export interface AskSource {
  n: number;
  title: string;
  location: string | null;
  href: string;
}

export type AskSearchResult =
  | { ok: true; answer: string; sources: AskSource[]; pending: number }
  | { ok: false; error: string };

/** Pregunta a la IA sobre todas tus clases y material (o los de una asignatura), con fuentes. */
export async function askSearchAction(input: z.input<typeof askSchema>): Promise<AskSearchResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe una pregunta." };
  const ai = await readAiConfigFromCookies();
  if (!ai.ok) return { ok: false, error: `IA no configurada: ${ai.reason}` };

  const db = await createSupabaseServerClient();
  try {
    const idx = await syncSearchIndex(db, auth.user.id, { budgetMs: 12_000 });
    const keywords = questionKeywords(parsed.data.question);
    const hits = await runSearch(db, keywords, parsed.data.courseId, { matchAny: true, limit: 80 });
    const context = pickContext(hits);
    if (!context.length) {
      return {
        ok: true,
        answer:
          "No encuentro nada sobre eso en tus clases, apuntes ni material" +
          (parsed.data.courseId ? " de esta asignatura" : "") +
          ". Prueba con otras palabras, o abre el material y pregúntale directamente (el texto de un PDF se añade a la búsqueda cuando se lee).",
        sources: [],
        pending: idx.pending,
      };
    }
    let scope = "sus asignaturas";
    if (parsed.data.courseId) {
      const { data: course } = await db.from("courses").select("name").eq("id", parsed.data.courseId).maybeSingle();
      if (course?.name) scope = `la asignatura «${course.name}»`;
    }
    const r = await complete(ai.config, buildSearchAskPrompt({ question: parsed.data.question, scope, sources: context, history: parsed.data.history }));
    const answer = r.truncated ? `${r.text}\n\n> La respuesta se cortó por longitud.` : r.text;
    const sources = context.map((s, i) => ({ n: i + 1, title: s.title, location: s.location, href: s.href }));
    return { ok: true, answer, sources, pending: idx.pending };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: describeAiError(err) };
    logger.error("search_ask_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    return { ok: false, error: "No se pudo responder. Vuelve a intentarlo." };
  }
}
