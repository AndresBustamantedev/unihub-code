import { describe, expect, it } from "vitest";
import { formatInterval, isMastered, newPerDayForExam, previewIntervals, schedule, type SrsCard } from "@/features/flashcards/srs";

const NOW = Date.parse("2026-12-01T10:00:00Z");
const DAY = 86_400_000;
const fresh: SrsCard = { state: "new", interval_days: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 };

describe("repetición espaciada", () => {
  it("una nueva pasa por los pasos de aprendizaje y se gradúa a 1 día", () => {
    const a = schedule(fresh, 3, NOW);
    expect(a).toMatchObject({ state: "learning", step: 1, dueInMinutes: 10 });
    const b = schedule(a, 3, NOW);
    expect(b).toMatchObject({ state: "review", interval_days: 1, dueInMinutes: 1440 });
  });

  it("Fácil la gradúa a 4 días y Otra vez la reinicia", () => {
    expect(schedule(fresh, 4, NOW)).toMatchObject({ state: "review", interval_days: 4 });
    expect(schedule(fresh, 1, NOW)).toMatchObject({ state: "learning", step: 0, dueInMinutes: 1 });
  });

  it("en repaso el intervalo crece con la facilidad y fallar lo reduce", () => {
    const card: SrsCard = { state: "review", interval_days: 10, ease: 2.5, reps: 5, lapses: 0, step: 0 };
    expect(schedule(card, 3, NOW).interval_days).toBe(25);
    expect(schedule(card, 2, NOW).interval_days).toBe(12);
    expect(schedule(card, 4, NOW).interval_days).toBe(33);
    const failed = schedule(card, 1, NOW);
    expect(failed).toMatchObject({ state: "learning", lapses: 1, ease: 2.3, interval_days: 5, dueInMinutes: 10 });
    // Al reaprenderla vuelve con el intervalo reducido (no desde cero).
    expect(schedule(failed, 3, NOW)).toMatchObject({ state: "review", interval_days: 5 });
  });

  it("con examen nunca se aplaza más allá del examen", () => {
    const card: SrsCard = { state: "review", interval_days: 20, ease: 2.5, reps: 5, lapses: 0, step: 0 };
    const r = schedule(card, 3, NOW, NOW + 10 * DAY);
    expect(r.interval_days).toBe(5);
    expect(Date.parse(r.due_at)).toBeLessThan(NOW + 10 * DAY);
    // Si falta mucho para el examen, no cambia nada.
    expect(schedule(card, 3, NOW, NOW + 200 * DAY).interval_days).toBe(50);
  });

  it("textos y cálculos auxiliares", () => {
    expect(previewIntervals(fresh, NOW)).toEqual({ 1: "1 min", 2: "6 min", 3: "10 min", 4: "4 días" });
    expect(formatInterval(60 * 24 * 21)).toBe("3 sem.");
    expect(isMastered({ state: "review", interval_days: 25 })).toBe(true);
    expect(newPerDayForExam(60, NOW + 12 * DAY, NOW)).toBe(6);
  });
});
