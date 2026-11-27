"use server";

import { z } from "zod";
import { readPendingMaterialTexts } from "@/features/materials/text";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncSearchIndex } from "./indexer";

const schema = z.object({ courseId: z.uuid().nullable() });

/** Lee el texto de unos pocos PDF más (de Canvas) y los añade a la búsqueda. Se llama en bucle. */
export async function prepareMaterialsAction(
  input: z.input<typeof schema>,
): Promise<{ ok: true; done: number; failed: number; left: number } | { ok: false }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const db = await createSupabaseServerClient();
  try {
    const r = await readPendingMaterialTexts(db, auth.user.id, { courseId: parsed.data.courseId, limit: 4, budgetMs: 25_000 });
    await syncSearchIndex(db, auth.user.id, { budgetMs: 15_000 });
    return { ok: true, ...r };
  } catch (err) {
    logger.error("prepare_materials_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    return { ok: false };
  }
}
