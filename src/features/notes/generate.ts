import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError, complete, describeAiError } from "@/integrations/ai/provider";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import type { Database, NoteKind } from "@/lib/supabase/database.types";
import { formatEventRange } from "@/lib/format";
import { logger } from "@/lib/redact";
import { anonymizeSpeakers, buildChunkPrompt, buildPrompt, chunkText } from "./prompts";

type DB = SupabaseClient<Database>;

/** Por encima de esto se resume por trozos (map-reduce). ~25k tokens. */
const SINGLE_PASS_CHARS = 100_000;
const CHUNK_CHARS = 60_000;
const MAX_CHUNKS = 6;

export type GenerateResult = { ok: true; truncated: boolean } | { ok: false; error: string };

export function inputHash(material: string): string {
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export async function generateNote(db: DB, userId: string, sessionId: string, kind: NoteKind, provider?: string | null, model?: string | null): Promise<GenerateResult> {
  const cfg = await readAiConfigFromCookies(provider, model);
  if (!cfg.ok) return { ok: false, error: `IA no configurada: ${cfg.reason}` };

  const { data: session } = await db.from("class_sessions").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (!session) return { ok: false, error: "Clase no encontrada." };
  const [{ data: course }, { data: transcript }] = await Promise.all([
    db.from("courses").select("name").eq("id", session.course_id).maybeSingle(),
    db.from("transcripts").select("content_text, speakers").eq("session_id", sessionId).maybeSingle(),
  ]);
  if (!transcript) return { ok: false, error: "Esta clase no tiene transcripción." };

  const notes = session.notes ? `\n\nNotas del alumno:\n${session.notes}` : "";
  const material = anonymizeSpeakers(transcript.content_text, transcript.speakers) + notes;
  const ctx = { courseName: course?.name ?? "", title: session.title, dateLabel: formatEventRange(session.session_at, null) };

  try {
    let source = material;
    let inTok = 0;
    let outTok = 0;
    if (material.length > SINGLE_PASS_CHARS) {
      const chunks = chunkText(material, CHUNK_CHARS).slice(0, MAX_CHUNKS);
      const partials: string[] = [];
      for (const [i, chunk] of chunks.entries()) {
        const r = await complete(cfg.config, buildChunkPrompt({ courseName: ctx.courseName, part: i + 1, total: chunks.length, material: chunk }));
        partials.push(`### Fragmento ${i + 1}\n${r.text}`);
        inTok += r.inputTokens ?? 0;
        outTok += r.outputTokens ?? 0;
      }
      source = `(Notas intermedias extraídas de una transcripción larga)\n\n${partials.join("\n\n")}`;
    }
    const r = await complete(cfg.config, buildPrompt(kind, { ...ctx, material: source }));
    const content = r.truncated ? `${r.text}\n\n> ⚠️ La respuesta se cortó por longitud.` : r.text;

    const { error } = await db.from("study_notes").upsert(
      {
        user_id: userId,
        course_id: session.course_id,
        session_id: sessionId,
        kind,
        content_md: content.slice(0, 100_000),
        provider: cfg.config.provider,
        model: cfg.config.model,
        input_hash: inputHash(material),
        input_tokens: inTok + (r.inputTokens ?? 0) || null,
        output_tokens: outTok + (r.outputTokens ?? 0) || null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "session_id,kind" },
    );
    if (error) {
      logger.error("note_upsert_failed", { code: error.code ?? null });
      return { ok: false, error: "No se pudo guardar el resultado." };
    }
    return { ok: true, truncated: r.truncated };
  } catch (err) {
    if (err instanceof AiError) {
      logger.warn("ai_generation_failed", { kind: err.kind, status: err.status ?? null, provider: cfg.config.provider });
      return { ok: false, error: describeAiError(err) };
    }
    logger.error("ai_generation_crash", { error: err instanceof Error ? err.name : "unknown" });
    return { ok: false, error: "Error inesperado al generar." };
  }
}
