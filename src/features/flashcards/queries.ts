import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExamRow, FlashcardRow } from "@/lib/supabase/database.types";
import { isMastered, newPerDayForExam } from "./srs";

type DB = SupabaseClient<Database>;

/** Nuevas por día si no hay examen (como Anki). */
export const DEFAULT_NEW_PER_DAY = 20;
const DAY = 86_400_000;

export interface StudyCard {
  id: string;
  courseId: string;
  courseName: string;
  sessionId: string | null;
  moduleItemId: string | null;
  front: string;
  back: string;
  sourceLabel: string | null;
  href: string;
  state: FlashcardRow["state"];
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  step: number;
  due_at: string;
  /** Fecha del examen que la afecta (ms), si la hay. */
  examAt: number | null;
}

export interface ExamInfo extends ExamRow {
  courseName: string;
  daysLeft: number;
}

/** Medianoche de hoy en España (los «hoy» del repaso). */
export function startOfToday(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const madridNowAsUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  const offset = madridNowAsUtc - Math.floor(now.getTime() / 60_000) * 60_000;
  return new Date(Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!) - offset);
}

/** Fecha del examen (día) como instante: a las 9:00 de ese día en España, aprox. */
export const examInstant = (examAt: string) => Date.parse(`${examAt}T08:00:00Z`);

export function cardInExam(exam: Pick<ExamRow, "course_id" | "session_ids" | "module_item_ids">, card: Pick<FlashcardRow, "course_id" | "session_id" | "module_item_id">): boolean {
  if (card.course_id !== exam.course_id) return false;
  const sessions = exam.session_ids ?? [];
  const items = exam.module_item_ids ?? [];
  if (!sessions.length && !items.length) return true;
  return (!!card.session_id && sessions.includes(card.session_id)) || (!!card.module_item_id && items.includes(card.module_item_id));
}

/** Exámenes de hoy en adelante, el más cercano primero. */
export async function upcomingExams(db: DB, courseId?: string | null): Promise<ExamInfo[]> {
  const today = new Date(startOfToday().getTime() + 12 * 3_600_000).toISOString().slice(0, 10);
  let q = db.from("exams").select("*").gte("exam_at", today).order("exam_at");
  if (courseId) q = q.eq("course_id", courseId);
  const { data } = await q;
  const exams = data ?? [];
  if (!exams.length) return [];
  const { data: courses } = await db.from("courses").select("id, name").in("id", [...new Set(exams.map((e) => e.course_id))]);
  const names = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const now = Date.now();
  return exams.map((e) => ({ ...e, courseName: names.get(e.course_id) ?? "", daysLeft: Math.max(0, Math.ceil((examInstant(e.exam_at) - now) / DAY)) }));
}

/** El examen más próximo que afecta a una tarjeta (para no aplazarla más allá). */
export function examFor(card: Pick<FlashcardRow, "course_id" | "session_id" | "module_item_id">, exams: ExamRow[]): number | null {
  const hits = exams.filter((e) => cardInExam(e, card)).map((e) => examInstant(e.exam_at));
  return hits.length ? Math.min(...hits) : null;
}

function hrefOf(c: Pick<FlashcardRow, "session_id" | "module_item_id" | "course_id">): string {
  if (c.session_id) return `/clases/${c.session_id}`;
  if (c.module_item_id) return `/material/${c.module_item_id}`;
  return `/asignaturas/${c.course_id}`;
}

async function readCards(db: DB, build: (q: ReturnType<DB["from"]>) => unknown, max = 3000): Promise<FlashcardRow[]> {
  const out: FlashcardRow[] = [];
  for (let from = 0; from < max; from += 1000) {
    const q = db.from("flashcards").select("*").eq("suspended", false);
    const { data, error } = await (build(q as never) as ReturnType<typeof q.range>).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as FlashcardRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface Queue {
  due: StudyCard[];
  fresh: StudyCard[];
  newLimit: number;
  newSeenToday: number;
  exam: ExamInfo | null;
}

/**
 * Lo que toca hoy: las tarjetas vencidas (todas) y nuevas hasta el límite del día. Con examen,
 * solo las que entran, y tantas nuevas como hagan falta para verlas todas a tiempo.
 */
export async function buildQueue(
  db: DB,
  opts: { courseId?: string | null; examId?: string | null; sessionId?: string | null; moduleItemId?: string | null } = {},
): Promise<Queue> {
  const now = new Date();
  const exams = await upcomingExams(db);
  const exam = opts.examId ? (exams.find((e) => e.id === opts.examId) ?? null) : null;
  const courseId = exam?.course_id ?? opts.courseId ?? null;
  // «Repasar estas» (de una clase o un documento): todas sus tarjetas nuevas, sin límite diario.
  const source = opts.sessionId ? (["session_id", opts.sessionId] as const) : opts.moduleItemId ? (["module_item_id", opts.moduleItemId] as const) : null;

  const scoped = (q: ReturnType<DB["from"]>) => {
    let out = q as unknown as { eq: (c: string, v: string) => unknown };
    if (courseId) out = out.eq("course_id", courseId) as typeof out;
    if (source) out = out.eq(source[0], source[1]) as typeof out;
    return out as unknown as ReturnType<DB["from"]>;
  };
  const [dueRows, newRows, { data: courses }, { count: seen }] = await Promise.all([
    readCards(db, (q) => (scoped(q) as ReturnType<typeof q.neq>).neq("state", "new").lte("due_at", now.toISOString()).order("due_at"), 2000),
    readCards(db, (q) => (scoped(q) as ReturnType<typeof q.eq>).eq("state", "new").order("created_at"), 3000),
    db.from("courses").select("id, name"),
    db.from("flashcard_reviews").select("id", { count: "exact", head: true }).eq("was_new", true).gte("reviewed_at", startOfToday(now).toISOString()),
  ]);
  const names = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const inExam = (c: FlashcardRow) => !exam || cardInExam(exam, c);
  const toStudy = (c: FlashcardRow): StudyCard => ({
    id: c.id,
    courseId: c.course_id,
    courseName: names.get(c.course_id) ?? "",
    sessionId: c.session_id,
    moduleItemId: c.module_item_id,
    front: c.front,
    back: c.back,
    sourceLabel: c.source_label,
    href: hrefOf(c),
    state: c.state,
    interval_days: c.interval_days,
    ease: c.ease,
    reps: c.reps,
    lapses: c.lapses,
    step: c.step,
    due_at: c.due_at,
    examAt: examFor(c, exams),
  });

  const due = dueRows.filter(inExam).map(toStudy);
  const newPool = newRows.filter(inExam);

  // Límite de nuevas: lo normal, o lo que exijan los exámenes cercanos.
  let newLimit = DEFAULT_NEW_PER_DAY;
  if (exam) {
    newLimit = Math.max(10, newPerDayForExam(newPool.length, examInstant(exam.exam_at), now.getTime()));
  } else {
    for (const e of exams.filter((x) => x.daysLeft <= 60 && (!courseId || x.course_id === courseId))) {
      const n = newRows.filter((c) => cardInExam(e, c)).length;
      if (n) newLimit = Math.max(newLimit, newPerDayForExam(n, examInstant(e.exam_at), now.getTime()));
    }
  }
  const seenToday = seen ?? 0;
  // Primero las nuevas que entran en el examen más cercano.
  newPool.sort((a, b) => (examFor(a, exams) ?? Infinity) - (examFor(b, exams) ?? Infinity) || a.created_at.localeCompare(b.created_at));
  if (source) newLimit = newPool.length;
  const fresh = newPool.slice(0, source ? newPool.length : Math.max(0, newLimit - (exam ? 0 : seenToday))).map(toStudy);
  return { due, fresh, newLimit, newSeenToday: seenToday, exam };
}

export interface CardStats {
  total: number;
  fresh: number;
  dueNow: number;
  learning: number;
  mastered: number;
}

const emptyStats = (): CardStats => ({ total: 0, fresh: 0, dueNow: 0, learning: 0, mastered: 0 });

/** Recuento por asignatura (y total). */
export async function cardStats(db: DB, courseId?: string | null): Promise<{ total: CardStats; byCourse: Map<string, CardStats>; bySession: Map<string, number>; byItem: Map<string, number> }> {
  const rows = await readCards(db, (q) => (courseId ? (q as ReturnType<typeof q.eq>).eq("course_id", courseId) : q), 10000);
  const now = Date.now();
  const total = emptyStats();
  const byCourse = new Map<string, CardStats>();
  const bySession = new Map<string, number>();
  const byItem = new Map<string, number>();
  for (const c of rows) {
    const s = byCourse.get(c.course_id) ?? emptyStats();
    for (const t of [total, s]) {
      t.total++;
      if (c.state === "new") t.fresh++;
      else if (Date.parse(c.due_at) <= now) t.dueNow++;
      if (c.state === "learning") t.learning++;
      if (isMastered(c)) t.mastered++;
    }
    byCourse.set(c.course_id, s);
    if (c.session_id) bySession.set(c.session_id, (bySession.get(c.session_id) ?? 0) + 1);
    if (c.module_item_id) byItem.set(c.module_item_id, (byItem.get(c.module_item_id) ?? 0) + 1);
  }
  return { total, byCourse, bySession, byItem };
}
