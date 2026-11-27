import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDataClient } from "@/lib/local-db/builder";
import { localParsers, prepareDatabase } from "@/lib/local-db/pg";
import { parseCards } from "@/features/flashcards/prompt";

vi.mock("server-only", () => ({}));

// IA simulada: devuelve tarjetas en JSON (con texto alrededor, como a veces hacen los modelos).
const aiReply = { text: "" };
vi.mock("@/integrations/ai/provider", async (orig) => ({
  ...(await orig<typeof import("@/integrations/ai/provider")>()),
  complete: vi.fn(async () => ({ text: aiReply.text, truncated: false, inputTokens: 1000, outputTokens: 300 })),
}));

const UID = "77777777-7777-4777-8777-777777777777";
const AI = { provider: "openai", model: "gpt-6-luna", apiKey: "x" } as never;
let pg: PGlite;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let course = "";
let otherCourse = "";
let sessionA = "";
let sessionB = "";

const reply = (cards: Array<[string, string]>) => `Aquí tienes:\n\`\`\`json\n${JSON.stringify({ tarjetas: cards.map(([pregunta, respuesta]) => ({ pregunta, respuesta })) })}\n\`\`\``;

beforeAll(async () => {
  pg = new PGlite({ parsers: await localParsers() });
  await prepareDatabase(pg, UID, "yo@uem.es");
  db = createLocalDataClient(pg);
  const c = async (name: string, ext: number) => (await pg.query<{ id: string }>("insert into courses (user_id, external_id, name, category, followed) values ($1,$2,$3,'current',true) returning id", [UID, ext, name])).rows[0]!.id;
  course = await c("Análisis matemático", 1);
  otherCourse = await c("Redes", 2);
  const s = async (title: string, at: string) => {
    const id = (await pg.query<{ id: string }>("insert into class_sessions (user_id, course_id, title, session_at) values ($1,$2,$3,$4) returning id", [UID, course, title, at])).rows[0]!.id;
    await pg.query("insert into transcripts (user_id, session_id, source_format, content_text) values ($1,$2,'txt',$3)", [UID, id, `Transcripción de ${title}. Explicamos límites y derivadas.`]);
    return id;
  };
  sessionA = await s("Límites", "2026-11-10T09:00:00Z");
  sessionB = await s("Derivadas", "2026-11-17T09:00:00Z");
}, 120_000);

describe("tarjetas de repaso", () => {
  it("lee las tarjetas de la IA aunque vengan con texto alrededor, sin duplicados ni basura", () => {
    const cards = parseCards(`Claro:\n${JSON.stringify({ tarjetas: [{ pregunta: "¿Qué es un límite?", respuesta: "El valor al que tiende…" }, { pregunta: "¿Qué es un límite?", respuesta: "repetida" }, { pregunta: "x", respuesta: "" }, { pregunta: "Regla de L'Hôpital", respuesta: "Derivar arriba y abajo", pagina: "4" }] })}\nEspero que ayude`);
    expect(cards).toEqual([
      { front: "¿Qué es un límite?", back: "El valor al que tiende…", page: null },
      { front: "Regla de L'Hôpital", back: "Derivar arriba y abajo", page: 4 },
    ]);
    expect(parseCards("lo siento, no puedo")).toEqual([]);
  });

  it("crea tarjetas de una clase y, al pedir más, no repite las que ya hay", async () => {
    const { generateCardsForSession } = await import("@/features/flashcards/generate");
    aiReply.text = reply([
      ["¿Qué es un límite?", "El valor al que se acerca f(x) cuando x se acerca a a."],
      ["¿Cuándo se usa L'Hôpital?", "En indeterminaciones 0/0 o ∞/∞."],
    ]);
    expect(await generateCardsForSession(db, UID, sessionA, AI)).toEqual({ ok: true, created: 2 });
    aiReply.text = reply([
      ["¿Qué es un límite?", "repetida"],
      ["¿Qué es una asíntota?", "Una recta a la que se acerca la gráfica."],
    ]);
    expect(await generateCardsForSession(db, UID, sessionA, AI)).toEqual({ ok: true, created: 1 });
    const { rows } = await pg.query<{ source_label: string; state: string }>("select source_label, state from flashcards where session_id = $1", [sessionA]);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.source_label).toMatch(/^Clase 10 nov\.? · Límites$/);
    expect(rows.every((r) => r.state === "new")).toBe(true);
  });

  it("la cola del día: vencidas primero y como mucho 20 nuevas", async () => {
    // 30 tarjetas nuevas más en otra asignatura y una vencida de repaso.
    for (let i = 0; i < 30; i++) await pg.query("insert into flashcards (user_id, course_id, front, back, created_at) values ($1,$2,$3,'r', now() + ($4 || ' seconds')::interval)", [UID, otherCourse, `Pregunta ${i}`, String(i)]);
    await pg.query("insert into flashcards (user_id, course_id, front, back, state, interval_days, due_at) values ($1,$2,'Vencida','r','review',3, now() - interval '1 hour')", [UID, otherCourse]);
    const { buildQueue } = await import("@/features/flashcards/queries");
    const q = await buildQueue(db);
    expect(q.due.map((c) => c.front)).toEqual(["Vencida"]);
    expect(q.fresh).toHaveLength(20);
    expect(q.newLimit).toBe(20);
    // Al ver nuevas hoy, quedan menos.
    const card = q.fresh[0]!;
    await pg.query("insert into flashcard_reviews (user_id, card_id, course_id, rating, was_new) values ($1,$2,$3,3,true)", [UID, card.id, card.courseId]);
    expect((await buildQueue(db)).fresh).toHaveLength(19);
  });

  it("con examen: solo lo que entra, más nuevas al día y nada se aplaza más allá del examen", async () => {
    const { buildQueue, upcomingExams, examFor } = await import("@/features/flashcards/queries");
    const inSix = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    await pg.query("insert into exams (user_id, course_id, title, exam_at, session_ids) values ($1,$2,'Parcial',$3,$4::jsonb)", [UID, course, inSix, JSON.stringify([sessionA])]);
    const exams = await upcomingExams(db);
    expect(exams[0]).toMatchObject({ title: "Parcial", courseName: "Análisis matemático", daysLeft: 6 });
    const q = await buildQueue(db, { examId: exams[0]!.id });
    expect(q.fresh.map((c) => c.sessionId)).toEqual([sessionA, sessionA, sessionA]);
    expect(q.exam?.title).toBe("Parcial");
    // Las tarjetas de otra clase no están en el examen.
    await pg.query("insert into flashcards (user_id, course_id, session_id, front, back) values ($1,$2,$3,'Derivada de x²','2x')", [UID, course, sessionB]);
    expect((await buildQueue(db, { examId: exams[0]!.id })).fresh).toHaveLength(3);
    const examAt = examFor({ course_id: course, session_id: sessionA, module_item_id: null }, exams);
    expect(examAt).not.toBeNull();
    expect(examFor({ course_id: course, session_id: sessionB, module_item_id: null }, exams)).toBeNull();
    const { schedule } = await import("@/features/flashcards/srs");
    const r = schedule({ state: "review", interval_days: 30, ease: 2.5, reps: 4, lapses: 0, step: 0 }, 3, Date.now(), examAt);
    expect(Date.parse(r.due_at)).toBeLessThan(examAt!);
  });

  it("«Repasar estas» de una clase trae todas sus nuevas, sin límite", async () => {
    const { buildQueue } = await import("@/features/flashcards/queries");
    const q = await buildQueue(db, { sessionId: sessionA });
    expect(q.fresh).toHaveLength(3);
    expect(q.due).toHaveLength(0);
  });

  it("recuentos por asignatura y por clase", async () => {
    const { cardStats } = await import("@/features/flashcards/queries");
    await pg.query("insert into flashcards (user_id, course_id, front, back, state, interval_days, due_at) values ($1,$2,'Dominada','r','review',40, now() + interval '10 days')", [UID, course]);
    const s = await cardStats(db, course);
    expect(s.total).toMatchObject({ total: 5, fresh: 4, mastered: 1, dueNow: 0 });
    expect(s.bySession.get(sessionA)).toBe(3);
  });

  it("borrar una clase borra sus tarjetas", async () => {
    await pg.query("delete from class_sessions where id = $1", [sessionB]);
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from flashcards where front = 'Derivada de x²'");
    expect(rows[0]!.n).toBe(0);
  });
});
