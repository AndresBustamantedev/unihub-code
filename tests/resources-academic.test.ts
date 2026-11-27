import { describe, expect, it } from "vitest";
import { academicYearLabel, academicYearOf, semesterTitle, yearOfSemester } from "@/lib/academic";
import { defaultTitle, normalizeUrl, resourceKind } from "@/features/resources/describe";
import { pastOccurrences } from "@/features/classes/missing";

describe("curso académico y semestres", () => {
  it("el curso empieza en septiembre", () => {
    expect(academicYearOf("2026-09-01T00:00:00Z")).toBe(2026);
    expect(academicYearOf("2027-03-10T00:00:00Z")).toBe(2026);
    expect(academicYearLabel(2026)).toBe("2026-27");
    expect(academicYearOf(null)).toBeNull();
  });
  it("semestre de la carrera → curso", () => {
    expect(yearOfSemester(1)).toBe(1);
    expect(yearOfSemester(4)).toBe(2);
    expect(yearOfSemester(10)).toBe(5);
    expect(semesterTitle(3)).toBe("Semestre 3 · 2.º curso");
  });
});

describe("recursos externos", () => {
  it("normaliza enlaces y rechaza los no web", () => {
    expect(normalizeUrl("youtube.com/watch?v=x")).toBe("https://youtube.com/watch?v=x");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://a.com/x")).toBeNull();
    expect(normalizeUrl("hola")).toBeNull();
  });
  it("detecta el tipo y pone título por defecto", () => {
    expect(resourceKind("https://www.youtube.com/watch?v=1")).toBe("video");
    expect(resourceKind("https://github.com/a/b")).toBe("code");
    expect(resourceKind("https://x.org/apuntes.pdf")).toBe("doc");
    expect(defaultTitle("https://www.khanacademy.org/math")).toBe("khanacademy.org");
  });
});

describe("fin de clases", () => {
  it("no espera clases después del último día", () => {
    const slot = { course_id: "c", weekday: 4, start_time: "19:30:00", end_time: "21:30:00" };
    const now = new Date("2026-11-14T22:00:00Z");
    expect(pastOccurrences([slot], now).length).toBe(2);
    expect(pastOccurrences([{ ...slot, ends_on: "2026-11-06" }], now).map((o) => o.date)).toEqual(["2026-11-05"]);
  });
});
