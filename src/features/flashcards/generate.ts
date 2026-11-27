import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { complete, type AiConfig } from "@/integrations/ai/provider";
import { getModuleFile } from "@/features/materials/files";
import { getMaterialText } from "@/features/materials/text";
import { anonymizeSpeakers } from "@/features/notes/prompts";
import type { Database } from "@/lib/supabase/database.types";
import { buildCardsPrompt, parseCards } from "./prompt";

type DB = SupabaseClient<Database>;

/** Texto que se manda a la IA: ~25k tokens como mucho (con Luna, menos de un céntimo). */
const MAX_MATERIAL = 90_000;

export type GenerateCardsResult = { ok: true; created: number } | { ok: false; error: string };

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });
}

async function existingFronts(db: DB, filter: { session_id?: string; module_item_id?: string }): Promise<string[]> {
  let q = db.from("flashcards").select("front");
  if (filter.session_id) q = q.eq("session_id", filter.session_id);
  if (filter.module_item_id) q = q.eq("module_item_id", filter.module_item_id);
  const { data } = await q.limit(300);
  return (data ?? []).map((c) => c.front);
}

/** Recorte del material: el principio y el final (si es muy largo), sin cortar a mitad de línea. */
function clip(text: string): string {
  if (text.length <= MAX_MATERIAL) return text;
  const head = text.slice(0, Math.floor(MAX_MATERIAL * 0.7));
  const tail = text.slice(text.length - Math.floor(MAX_MATERIAL * 0.3));
  return `${head.slice(0, head.lastIndexOf("\n") > 0 ? head.lastIndexOf("\n") : head.length)}\n\n[…]\n\n${tail.slice(tail.indexOf("\n") + 1)}`;
}

async function insertCards(db: DB, rows: Database["public"]["Tables"]["flashcards"]["Insert"][]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await db.from("flashcards").insert(rows);
  if (error) throw new Error(`flashcards: ${error.message}`);
  return rows.length;
}

/** Tarjetas de una clase: de su resumen (si lo hay) y su transcripción. */
export async function generateCardsForSession(db: DB, userId: string, sessionId: string, ai: AiConfig, count = 15): Promise<GenerateCardsResult> {
  const { data: s } = await db.from("class_sessions").select("id, course_id, title, session_at, notes").eq("id", sessionId).maybeSingle();
  if (!s) return { ok: false, error: "Clase no encontrada." };
  const [{ data: course }, { data: t }, { data: summary }] = await Promise.all([
    db.from("courses").select("name").eq("id", s.course_id).maybeSingle(),
    db.from("transcripts").select("content_text, speakers").eq("session_id", sessionId).maybeSingle(),
    db.from("study_notes").select("content_md").eq("session_id", sessionId).eq("kind", "summary").maybeSingle(),
  ]);
  if (!t && !summary && !s.notes) return { ok: false, error: "Esta clase no tiene transcripción ni apuntes de los que sacar tarjetas." };
  const parts = [
    summary?.content_md ? `## Resumen de la clase\n${summary.content_md}` : "",
    s.notes ? `## Notas del alumno\n${s.notes}` : "",
    t ? `## Transcripción\n${anonymizeSpeakers(t.content_text, t.speakers)}` : "",
  ].filter(Boolean);
  const label = `Clase ${dayLabel(s.session_at)} · ${s.title}`.slice(0, 200);
  const existing = await existingFronts(db, { session_id: sessionId });
  const r = await complete(ai, buildCardsPrompt({ courseName: course?.name ?? "", sourceLabel: label, material: clip(parts.join("\n\n")), count, existing, pages: false }));
  const known = new Set(existing.map((f) => f.toLowerCase()));
  const cards = parseCards(r.text).filter((c) => !known.has(c.front.toLowerCase()));
  if (!cards.length) return { ok: false, error: "La IA no devolvió tarjetas válidas. Vuelve a intentarlo." };
  const created = await insertCards(
    db,
    cards.map((c) => ({ user_id: userId, course_id: s.course_id, session_id: sessionId, front: c.front, back: c.back, source_label: label, origin: "ai" as const })),
  );
  return { ok: true, created };
}

/** Tarjetas de un documento (PDF, texto…), con la página de cada una. */
export async function generateCardsForMaterial(db: DB, userId: string, itemId: string, ai: AiConfig, count = 15): Promise<GenerateCardsResult> {
  const item = await getModuleFile(db, itemId);
  if (!item) return { ok: false, error: "Documento no encontrado." };
  const text = await getMaterialText(db, userId, item);
  if (!text.ok) return { ok: false, error: text.reason };
  const { data: course } = await db.from("courses").select("name").eq("id", item.course_id).maybeSingle();
  const existing = await existingFronts(db, { module_item_id: itemId });
  const r = await complete(ai, buildCardsPrompt({ courseName: course?.name ?? "", sourceLabel: item.title, material: clip(text.text), count, existing, pages: text.pages > 0 }));
  const known = new Set(existing.map((f) => f.toLowerCase()));
  const cards = parseCards(r.text).filter((c) => !known.has(c.front.toLowerCase()));
  if (!cards.length) return { ok: false, error: "La IA no devolvió tarjetas válidas. Vuelve a intentarlo." };
  const created = await insertCards(
    db,
    cards.map((c) => ({
      user_id: userId,
      course_id: item.course_id,
      module_item_id: itemId,
      front: c.front,
      back: c.back,
      source_label: `${item.title}${c.page && c.page <= text.pages ? ` · pág. ${c.page}` : ""}`.slice(0, 200),
      origin: "ai" as const,
    })),
  );
  return { ok: true, created };
}
