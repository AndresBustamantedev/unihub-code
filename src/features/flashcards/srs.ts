/**
 * Repetición espaciada (como Anki, algoritmo SM-2 con pasos de aprendizaje).
 *
 * - Tarjeta nueva o en aprendizaje: pasos cortos (1 min → 10 min) antes de «graduarse» a 1 día.
 * - Tarjeta en repaso: el intervalo crece multiplicándose por su facilidad (2,5 al principio).
 *   «Otra vez» la devuelve a aprendizaje y baja la facilidad; «Fácil» la sube.
 * - Con examen: ninguna tarjeta que entre se aplaza más allá del examen; se acortan los
 *   intervalos para verla al menos otra vez antes.
 */

export type Rating = 1 | 2 | 3 | 4; // Otra vez · Difícil · Bien · Fácil
export type CardStateName = "new" | "learning" | "review";

export interface SrsCard {
  state: CardStateName;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  step: number;
}

export interface SrsResult extends SrsCard {
  due_at: string;
  /** Minutos hasta que vuelve a tocar (para reinsertarla en la sesión si es pronto). */
  dueInMinutes: number;
}

const MIN = 60_000;
const DAY = 86_400_000;
const LEARN_STEPS = [1, 10]; // minutos
const RELEARN_STEP = 10; // minutos tras fallar una tarjeta en repaso
const MIN_EASE = 1.3;
const MAX_EASE = 5;
const MAX_INTERVAL = 365;

const clampEase = (e: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(e * 100) / 100));

/** Intervalo en días, recortado si hay examen: se vuelve a ver antes del examen. */
function capForExam(intervalDays: number, now: number, examAt: number | null): number {
  if (!examAt || examAt <= now) return intervalDays;
  const daysLeft = (examAt - now) / DAY;
  if (daysLeft < 1) return Math.min(intervalDays, 0.5);
  if (intervalDays >= daysLeft - 0.5) return Math.max(1, Math.floor(daysLeft / 2));
  return intervalDays;
}

export function schedule(card: SrsCard, rating: Rating, nowMs = Date.now(), examAtMs: number | null = null): SrsResult {
  let { state, interval_days: interval, ease, lapses, step } = card;
  const reps = card.reps + 1;
  let dueMin: number;

  if (state === "new" || state === "learning") {
    const relearning = state === "learning" && lapses > 0 && interval >= 1;
    if (rating === 1) {
      step = 0;
      state = "learning";
      dueMin = LEARN_STEPS[0]!;
    } else if (rating === 2) {
      state = "learning";
      dueMin = step === 0 ? 6 : LEARN_STEPS[Math.min(step, LEARN_STEPS.length - 1)]!;
    } else if (rating === 3 && !relearning && step < LEARN_STEPS.length - 1) {
      step += 1;
      state = "learning";
      dueMin = LEARN_STEPS[step]!;
    } else {
      // Se gradúa: Bien → 1 día (o lo que tenía si la estaba reaprendiendo), Fácil → 4 días.
      const base = relearning ? Math.max(1, interval) : 1;
      interval = rating === 4 ? Math.max(4, base) : base;
      if (rating === 4) ease = clampEase(ease + 0.15);
      interval = capForExam(interval, nowMs, examAtMs);
      state = "review";
      step = 0;
      dueMin = interval * 24 * 60;
    }
  } else {
    if (rating === 1) {
      lapses += 1;
      ease = clampEase(ease - 0.2);
      interval = Math.max(1, Math.round(interval * 0.5));
      state = "learning";
      step = 0;
      dueMin = RELEARN_STEP;
    } else {
      if (rating === 2) {
        interval = Math.max(interval + 1, interval * 1.2);
        ease = clampEase(ease - 0.15);
      } else if (rating === 3) {
        interval = Math.max(interval + 1, interval * ease);
      } else {
        interval = Math.max(interval + 1, interval * ease * 1.3);
        ease = clampEase(ease + 0.15);
      }
      interval = Math.min(MAX_INTERVAL, Math.round(interval));
      interval = capForExam(interval, nowMs, examAtMs);
      dueMin = interval * 24 * 60;
    }
  }

  return {
    state,
    interval_days: interval,
    ease,
    reps,
    lapses,
    step,
    due_at: new Date(nowMs + dueMin * MIN).toISOString(),
    dueInMinutes: Math.round(dueMin),
  };
}

/** «1 min», «10 min», «1 día», «2 sem.», «3 meses». */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  const days = minutes / (60 * 24);
  if (days < 14) return `${Math.round(days)} ${Math.round(days) === 1 ? "día" : "días"}`;
  if (days < 60) return `${Math.round(days / 7)} sem.`;
  if (days < 365) return `${Math.round(days / 30)} meses`;
  return `${(days / 365).toFixed(1).replace(".", ",")} años`;
}

/** Lo que pondrá cada botón («Bien · 10 min»). */
export function previewIntervals(card: SrsCard, nowMs = Date.now(), examAtMs: number | null = null): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) out[r] = formatInterval(schedule(card, r, nowMs, examAtMs).dueInMinutes);
  return out;
}

/** Dominada: en repaso con un intervalo de 3 semanas o más. */
export const isMastered = (c: { state: string; interval_days: number }) => c.state === "review" && c.interval_days >= 21;

/** Cuántas nuevas hay que ver al día para tenerlas todas vistas 2 días antes del examen. */
export function newPerDayForExam(newInScope: number, examAtMs: number, nowMs = Date.now()): number {
  const days = Math.max(1, Math.floor((examAtMs - nowMs) / DAY) - 2);
  return Math.ceil(newInScope / days);
}
