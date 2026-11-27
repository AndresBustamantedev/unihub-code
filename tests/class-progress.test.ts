import { describe, expect, it } from "vitest";
import { findMissingClasses, pastOccurrences } from "@/features/classes/missing";
import { courseProgress, matchesFilter, studyStatus } from "@/features/classes/progress";

const C = "11111111-1111-4111-8111-111111111111";
// Jueves 19:30–21:30 (hora de Madrid)
const slot = { course_id: C, weekday: 4, start_time: "19:30:00", end_time: "21:30:00" };

describe("pastOccurrences", () => {
  it("solo cuenta las clases que terminaron hace más de un día", () => {
    // Viernes 13 nov 2026, 12:00 Madrid: la clase de ayer (jueves 12) aún está en el margen.
    const fri = new Date("2026-11-13T11:00:00Z");
    expect(pastOccurrences([slot], fri).map((o) => o.date)).toEqual(["2026-11-05"]);
    // Sábado 14 nov a las 23:00: ya han pasado 24 h desde las 21:30 del jueves.
    const sat = new Date("2026-11-14T22:00:00Z");
    expect(pastOccurrences([slot], sat).map((o) => o.date)).toContain("2026-11-12");
  });

  it("convierte la hora local de Madrid a UTC", () => {
    const [o] = pastOccurrences([slot], new Date("2026-11-14T22:00:00Z"), 2);
    expect(o?.startIso).toBe("2026-11-12T18:30:00.000Z");
  });
});

describe("findMissingClasses", () => {
  const now = new Date("2026-11-14T22:00:00Z");
  const occ = pastOccurrences([slot], now);

  it("detecta las clases sin sesión importada ese día", () => {
    const sessions = [{ course_id: C, session_at: "2026-11-05T18:44:00Z" }];
    expect(findMissingClasses(occ, sessions, []).map((o) => o.date)).toEqual(["2026-11-12"]);
  });

  it("ignora los días marcados como sin clase", () => {
    const sessions = [{ course_id: C, session_at: "2026-11-05T18:44:00Z" }];
    expect(findMissingClasses(occ, sessions, [{ course_id: C, class_date: "2026-11-12" }])).toEqual([]);
  });

  it("no confunde asignaturas", () => {
    const other = [{ course_id: "22222222-2222-4222-8222-222222222222", session_at: "2026-11-12T18:44:00Z" }];
    expect(findMissingClasses(occ, other, []).map((o) => o.date)).toEqual(["2026-11-05", "2026-11-12"]);
  });
});

describe("progreso de estudio", () => {
  const base = { watched_at: null, understanding: null, review_state: null } as const;
  it("clasifica el estado", () => {
    expect(studyStatus(base)).toBe("unwatched");
    expect(studyStatus({ ...base, watched_at: "x" })).toBe("watched");
    expect(studyStatus({ ...base, watched_at: "x", understanding: "low" })).toBe("unclear");
    expect(studyStatus({ ...base, watched_at: "x", understanding: "mid" })).toBe("reviewing");
    expect(studyStatus({ ...base, watched_at: "x", understanding: "low", review_state: "done" })).toBe("mastered");
    expect(matchesFilter({ ...base, watched_at: "x", review_state: "reviewing" }, "repasar")).toBe(true);
  });

  it("calcula si vas al día", () => {
    expect(courseProgress([]).upToDate).toBe(false);
    const p = courseProgress([{ ...base, watched_at: "x", understanding: "high" }, { ...base, watched_at: "x" }]);
    expect(p).toMatchObject({ total: 2, watched: 2, unwatched: 0, toReview: 0, upToDate: true });
    expect(courseProgress([{ ...base, watched_at: "x", understanding: "low" }]).upToDate).toBe(false);
  });
});
