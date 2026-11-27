import { hhmm, madridDayKey, madridLocalToIso } from "@/lib/format";

export interface SlotLike {
  course_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  /** Último día de clases de la asignatura ("2027-01-20"); después no se esperan más. */
  ends_on?: string | null;
}

export interface Occurrence {
  course_id: string;
  /** Día de la clase en Madrid, "2026-11-12". */
  date: string;
  startIso: string;
  endIso: string;
}

/** Margen tras el final de la clase antes de avisar (Teams tarda en publicar la grabación). */
export const MISSING_GRACE_MS = 24 * 3_600_000;
/** Solo se revisan las últimas semanas para no llenar la pantalla de avisos antiguos. */
export const MISSING_LOOKBACK_DAYS = 14;

function isoWeekdayOf(dayKey: string): number {
  return ((new Date(`${dayKey}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** Clases del horario que ya terminaron hace más del margen, dentro de la ventana de revisión. */
export function pastOccurrences(slots: SlotLike[], now: Date, lookbackDays = MISSING_LOOKBACK_DAYS, graceMs = MISSING_GRACE_MS): Occurrence[] {
  const out: Occurrence[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= lookbackDays; i++) {
    const date = madridDayKey(new Date(now.getTime() - i * 86_400_000));
    if (seen.has(date)) continue;
    seen.add(date);
    const wd = isoWeekdayOf(date);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      if (s.ends_on && date > s.ends_on) continue;
      const startIso = madridLocalToIso(`${date}T${hhmm(s.start_time)}`);
      const endIso = madridLocalToIso(`${date}T${hhmm(s.end_time)}`);
      if (!startIso || !endIso) continue;
      if (new Date(endIso).getTime() + graceMs > now.getTime()) continue;
      out.push({ course_id: s.course_id, date, startIso, endIso });
    }
  }
  return out.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

/**
 * Clases del horario sin grabación importada. Una clase cuenta como importada si hay una
 * sesión de esa asignatura el mismo día (hora de Madrid); también se descartan los días
 * marcados como "no hubo clase". Si en una asignatura hay dos franjas el mismo día,
 * una sola sesión importada las cubre.
 */
export function findMissingClasses(
  occurrences: Occurrence[],
  sessions: ReadonlyArray<{ course_id: string; session_at: string }>,
  skips: ReadonlyArray<{ course_id: string; class_date: string }>,
): Occurrence[] {
  const covered = new Set(sessions.map((s) => `${s.course_id}|${madridDayKey(new Date(s.session_at))}`));
  for (const k of skips) covered.add(`${k.course_id}|${k.class_date}`);
  const out: Occurrence[] = [];
  const emitted = new Set<string>();
  for (const o of occurrences) {
    const key = `${o.course_id}|${o.date}`;
    if (covered.has(key) || emitted.has(key)) continue;
    emitted.add(key);
    out.push(o);
  }
  return out;
}

export function missingDedupeKey(o: Pick<Occurrence, "course_id" | "date">): string {
  return `class_missing:${o.course_id}:${o.date}`;
}
