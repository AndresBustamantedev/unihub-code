"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiError, describeAiError } from "@/integrations/ai/provider";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateCardsForMaterial, generateCardsForSession, type GenerateCardsResult } from "./generate";
import { examFor, upcomingExams } from "./queries";
import { schedule, type Rating } from "./srs";

type Fail = { ok: false; error: string };
const SESSION_EXPIRED: Fail = { ok: false, error: "Sesión caducada." };

/* ─── Crear con IA ─── */

const genSchema = z.object({ target: z.enum(["session", "material"]), id: z.uuid(), count: z.number().int().min(5).max(30).optional() });

export async function generateCardsAction(input: z.input<typeof genSchema>): Promise<GenerateCardsResult> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  const parsed = genSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Petición no válida." };
  const ai = await readAiConfigFromCookies();
  if (!ai.ok) return { ok: false, error: `IA no configurada: ${ai.reason}` };
  const db = await createSupabaseServerClient();
  try {
    const r =
      parsed.data.target === "session"
        ? await generateCardsForSession(db, auth.user.id, parsed.data.id, ai.config, parsed.data.count)
        : await generateCardsForMaterial(db, auth.user.id, parsed.data.id, ai.config, parsed.data.count);
    revalidatePath("/repasar");
    revalidatePath(parsed.data.target === "session" ? `/clases/${parsed.data.id}` : `/material/${parsed.data.id}`);
    return r;
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: describeAiError(err) };
    logger.error("cards_generate_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    return { ok: false, error: "No se pudieron crear las tarjetas. Vuelve a intentarlo." };
  }
}

/** Clases de una asignatura con transcripción o apuntes y sin tarjetas (para crearlas todas de una vez). */
export async function sessionsWithoutCardsAction(courseId: string): Promise<{ ok: true; ids: string[] } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  if (!z.uuid().safeParse(courseId).success) return { ok: false, error: "Asignatura no válida." };
  const db = await createSupabaseServerClient();
  const [{ data: sessions }, { data: transcripts }, { data: cards }] = await Promise.all([
    db.from("class_sessions").select("id, session_at").eq("course_id", courseId).order("session_at"),
    db.from("transcripts").select("session_id"),
    db.from("flashcards").select("session_id").eq("course_id", courseId).not("session_id", "is", null),
  ]);
  const withText = new Set((transcripts ?? []).map((t) => t.session_id));
  const withCards = new Set((cards ?? []).map((c) => c.session_id));
  return { ok: true, ids: (sessions ?? []).filter((s) => withText.has(s.id) && !withCards.has(s.id)).map((s) => s.id) };
}

/* ─── Repasar ─── */

const reviewSchema = z.object({ cardId: z.uuid(), rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) });

export async function reviewCardAction(input: z.input<typeof reviewSchema>): Promise<{ ok: true; dueInMinutes: number; due_at: string } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Respuesta no válida." };
  const db = await createSupabaseServerClient();
  const { data: card } = await db.from("flashcards").select("*").eq("id", parsed.data.cardId).maybeSingle();
  if (!card) return { ok: false, error: "Tarjeta no encontrada." };
  const exams = await upcomingExams(db, card.course_id);
  const now = new Date();
  const next = schedule(card, parsed.data.rating as Rating, now.getTime(), examFor(card, exams));
  const { dueInMinutes, ...state } = next;
  const [upd, log] = await Promise.all([
    db.from("flashcards").update({ ...state, last_reviewed_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", card.id),
    db.from("flashcard_reviews").insert({ user_id: auth.user.id, card_id: card.id, course_id: card.course_id, rating: parsed.data.rating, was_new: card.state === "new" }),
  ]);
  if (upd.error || log.error) {
    logger.error("card_review_failed", { code: upd.error?.code ?? log.error?.code ?? null });
    return { ok: false, error: "No se pudo guardar el repaso." };
  }
  return { ok: true, dueInMinutes, due_at: state.due_at };
}

/* ─── A mano: crear, editar, borrar ─── */

const cardText = { front: z.string().trim().min(1).max(1000), back: z.string().trim().min(1).max(4000) };
const createSchema = z.object({ courseId: z.uuid(), sessionId: z.uuid().nullable().optional(), moduleItemId: z.uuid().nullable().optional(), ...cardText });

export async function createCardAction(input: z.input<typeof createSchema>): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe la pregunta y la respuesta." };
  const db = await createSupabaseServerClient();
  let label: string | null = null;
  if (parsed.data.sessionId) {
    const { data: s } = await db.from("class_sessions").select("title, session_at, course_id").eq("id", parsed.data.sessionId).maybeSingle();
    if (!s || s.course_id !== parsed.data.courseId) return { ok: false, error: "Clase no encontrada." };
    label = `Clase ${new Date(s.session_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" })} · ${s.title}`.slice(0, 200);
  } else if (parsed.data.moduleItemId) {
    const { data: i } = await db.from("course_module_items").select("title, course_id").eq("id", parsed.data.moduleItemId).maybeSingle();
    if (!i || i.course_id !== parsed.data.courseId) return { ok: false, error: "Documento no encontrado." };
    label = i.title.slice(0, 200);
  }
  const { error } = await db.from("flashcards").insert({
    user_id: auth.user.id,
    course_id: parsed.data.courseId,
    session_id: parsed.data.sessionId ?? null,
    module_item_id: parsed.data.moduleItemId ?? null,
    front: parsed.data.front,
    back: parsed.data.back,
    source_label: label,
    origin: "manual",
  });
  if (error) return { ok: false, error: "No se pudo guardar la tarjeta." };
  revalidatePath("/repasar");
  if (parsed.data.sessionId) revalidatePath(`/clases/${parsed.data.sessionId}`);
  if (parsed.data.moduleItemId) revalidatePath(`/material/${parsed.data.moduleItemId}`);
  return { ok: true };
}

const updateSchema = z.object({ id: z.uuid(), ...cardText });

export async function updateCardAction(input: z.input<typeof updateSchema>): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribe la pregunta y la respuesta." };
  const db = await createSupabaseServerClient();
  const { error } = await db.from("flashcards").update({ front: parsed.data.front, back: parsed.data.back, updated_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: "No se pudo guardar." };
  return { ok: true };
}

export async function deleteCardAction(id: string): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Tarjeta no válida." };
  const db = await createSupabaseServerClient();
  const { error } = await db.from("flashcards").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar." };
  revalidatePath("/repasar");
  return { ok: true };
}

/* ─── Exámenes ─── */

const examSchema = z.object({
  id: z.uuid().nullable().optional(),
  courseId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  examAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionIds: z.array(z.uuid()).max(500),
  moduleItemIds: z.array(z.uuid()).max(1000),
});

export async function saveExamAction(input: z.input<typeof examSchema>): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pon un nombre y una fecha." };
  const db = await createSupabaseServerClient();
  const row = {
    user_id: auth.user.id,
    course_id: parsed.data.courseId,
    title: parsed.data.title,
    exam_at: parsed.data.examAt,
    session_ids: parsed.data.sessionIds,
    module_item_ids: parsed.data.moduleItemIds,
  };
  const { error } = parsed.data.id ? await db.from("exams").update(row).eq("id", parsed.data.id) : await db.from("exams").insert(row);
  if (error) return { ok: false, error: "No se pudo guardar el examen." };
  revalidatePath(`/asignaturas/${parsed.data.courseId}`);
  revalidatePath("/repasar");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteExamAction(id: string, courseId: string): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return SESSION_EXPIRED;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Examen no válido." };
  const db = await createSupabaseServerClient();
  const { error } = await db.from("exams").delete().eq("id", id);
  if (error) return { ok: false, error: "No se pudo borrar." };
  revalidatePath(`/asignaturas/${courseId}`);
  revalidatePath("/");
  return { ok: true };
}
