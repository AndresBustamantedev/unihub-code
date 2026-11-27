import { describe, expect, it } from "vitest";
import { classifyCourse } from "@/features/courses/classify";
import type { CanvasCourse } from "@/integrations/canvas/types";

const NOW = new Date("2026-11-14T12:00:00Z");
const student = [{ type: "student", enrollment_state: "active" }];
const term = { id: 1, name: "2026-27 1er semestre", start_at: "2026-09-01T00:00:00Z", end_at: "2027-01-31T00:00:00Z" };
const c = (o: Partial<CanvasCourse>): CanvasCourse => ({ id: 1, name: "Algoritmos", enrollments: student, term, workflow_state: "available", ...o });

describe("classifyCourse", () => {
  it("actual dentro del periodo", () => expect(classifyCourse(c({}), NOW).category).toBe("current"));
  it("anterior si el periodo terminó", () =>
    expect(classifyCourse(c({ term: { ...term, start_at: "2025-09-01T00:00:00Z", end_at: "2026-01-31T00:00:00Z" } }), NOW).category).toBe("past"));
  it("anterior si está concluido", () => expect(classifyCourse(c({ concluded: true }), NOW).category).toBe("past"));
  it("fecha del curso manda sobre la del periodo", () => expect(classifyCourse(c({ end_at: "2026-10-01T00:00:00Z" }), NOW).category).toBe("past"));
  it("futura si aún no empieza", () =>
    expect(classifyCourse(c({ term: { ...term, start_at: "2027-02-01T00:00:00Z", end_at: "2027-06-30T00:00:00Z" } }), NOW).category).toBe("future"));
  it("auxiliar por nombre", () => expect(classifyCourse(c({ name: "Comunidad de Ingeniería" }), NOW).category).toBe("auxiliary"));
  it("auxiliar si no eres estudiante", () =>
    expect(classifyCourse(c({ enrollments: [{ type: "observer", enrollment_state: "active" }] }), NOW).category).toBe("auxiliary"));
  it("auxiliar sin periodo ni fechas", () =>
    expect(classifyCourse(c({ term: { id: 2, name: "Default Term" } }), NOW).category).toBe("auxiliary"));
  it("restringido por fecha => anterior", () =>
    expect(classifyCourse({ id: 9, access_restricted_by_date: true }, NOW).category).toBe("past"));
  it("grupo UE sin fechas => actual", () =>
    expect(classifyCourse(c({ name: "FUNDAMENTOS DE REDES (M11-PAGO M12-PAGO)", term: { id: 2, name: "Período predeterminado" } }), NOW).category).toBe("current"));
  it("grupo UE gana a palabras auxiliares", () =>
    expect(classifyCourse(c({ name: "INFORMACIÓN Y SISTEMAS (M21-PAGO M21-PAWT)" }), NOW).category).toBe("current"));
  it("aula tutor y comunidad del grado => auxiliar", () => {
    expect(classifyCourse(c({ name: "AULA TUTOR: GRADO EN INGENIERÍA (TUT_2026PAGO)" }), NOW).category).toBe("auxiliary");
    expect(classifyCourse(c({ name: "GRADO EN INGENIERÍA INFORMÁTICA. ONLINE (COM_2026PAGO)" }), NOW).category).toBe("auxiliary");
  });
  it("periodo asíncrono => auxiliar", () =>
    expect(classifyCourse(c({ name: "School of Life", term: { id: 3, name: "Periodo asíncrono" } }), NOW).category).toBe("auxiliary"));
  it("no confunde palabras parecidas", () => expect(classifyCourse(c({ name: "Canales de comunicación" }), NOW).category).toBe("current"));
});

import { fetchAllCanvasCourses } from "@/features/courses/fetch";
import { CanvasClient } from "@/integrations/canvas/client";

describe("fetchAllCanvasCourses", () => {
  it("pide activos, pendientes y concluidos y fusiona sin duplicados", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const u = new URL(String(input));
      const state = u.searchParams.get("enrollment_state") ?? "";
      seen.push(state);
      expect(u.searchParams.getAll("include[]")).toEqual(["term", "concluded", "course_image"]);
      const body = state === "active" ? [{ id: 1, name: "A" }, { id: 2, name: "B" }] : state === "completed" ? [{ id: 2, name: "B" }, { id: 3, name: "C" }] : [];
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const client = new CanvasClient({ baseUrl: "https://x.edu/api/v1", token: "1~abc", fetchImpl });
    const r = await fetchAllCanvasCourses(client);
    expect(seen).toEqual(["active", "invited_or_pending", "completed"]);
    expect(r.map((x) => x.course.id).sort()).toEqual([1, 2, 3]);
    expect(r.find((x) => x.course.id === 2)?.seenAs).toEqual(["active", "completed"]);
  });
});
