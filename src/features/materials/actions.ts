"use server";

import { z } from "zod";
import { AiError, complete, describeAiError } from "@/integrations/ai/provider";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { CanvasApiError, describeCanvasError } from "@/integrations/canvas/errors";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAskPrompt } from "./ask-prompts";
import { getModuleFile } from "./files";
import { getMaterialText } from "./text";
import { mirrorMaterialNote } from "@/features/desktop/mirror";

const askSchema = z.object({
  itemId: z.uuid(),
  mode: z.enum(["pregunta", "resumen", "conceptos", "repaso"]),
  question: z.string().trim().max(2000),
  history: z.array(z.object({ q: z.string().max(2000), a: z.string().max(20000) })).max(10),
});

export type AskResult = { ok: true; answer: string; pages: number; provider: string } | { ok: false; error: string };

/** Pregunta a la IA sobre un material (PDF, texto o HTML) del curso. */
export async function askMaterialAction(input: z.input<typeof askSchema>): Promise<AskResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pregunta no válida." };
  if (parsed.data.mode === "pregunta" && !parsed.data.question) return { ok: false, error: "Escribe una pregunta." };

  const ai = await readAiConfigFromCookies();
  if (!ai.ok) return { ok: false, error: `IA no configurada: ${ai.reason}` };

  const db = await createSupabaseServerClient();
  const item = await getModuleFile(db, parsed.data.itemId);
  if (!item) return { ok: false, error: "Material no encontrado." };
  const { data: course } = await db.from("courses").select("name").eq("id", item.course_id).maybeSingle();

  try {
    const text = await getMaterialText(db, auth.user.id, item);
    if (!text.ok) return { ok: false, error: text.reason };
    const r = await complete(
      ai.config,
      buildAskPrompt({ ...parsed.data, title: item.title, courseName: course?.name ?? "la asignatura", text: text.text }),
    );
    const answer = r.truncated ? `${r.text}\n\n> La respuesta se cortó por longitud.` : r.text;
    return { ok: true, answer, pages: text.pages, provider: ai.config.provider };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: describeAiError(err) };
    if (err instanceof CanvasApiError) return { ok: false, error: describeCanvasError(err) };
    logger.error("material_ask_failed", { error: err instanceof Error ? err.name : "unknown" });
    return { ok: false, error: "No se pudo leer el documento." };
  }
}

/** Guarda (o vacía) la nota de un material. */
export async function saveMaterialNoteAction(itemId: string, content: string): Promise<{ ok: boolean; savedAt?: string }> {
  const auth = await requireUser();
  if (!auth.ok || !z.uuid().safeParse(itemId).success || content.length > 50_000) return { ok: false };
  const db = await createSupabaseServerClient();
  const item = await getModuleFile(db, itemId);
  if (!item) return { ok: false };
  const savedAt = new Date().toISOString();
  const { error } = await db
    .from("material_notes")
    .upsert({ user_id: auth.user.id, course_id: item.course_id, module_item_id: itemId, content_md: content, updated_at: savedAt }, { onConflict: "user_id,module_item_id" });
  if (error) return { ok: false };
  await mirrorMaterialNote(db, itemId);
  return { ok: true, savedAt };
}
