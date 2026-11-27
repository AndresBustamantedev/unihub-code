import { describe, expect, it } from "vitest";
import { neighborsOf } from "@/features/materials/neighbors";
import { buildAskPrompt, DOC_CHAR_LIMIT } from "@/features/materials/ask-prompts";

const f = (id: string, module_id: string, modulePosition: number, position: number) => ({ id, title: id, module_id, modulePosition, position });

describe("anterior / siguiente", () => {
  const files = [f("b2", "B", 2, 2), f("a1", "A", 1, 1), f("b1", "B", 2, 1), f("a2", "A", 1, 5)];
  it("ordena por tema y posición", () => {
    const n = neighborsOf(files, "a2")!;
    expect(n.prev?.id).toBe("a1");
    expect(n.next?.id).toBe("b1");
    expect(n).toMatchObject({ index: 2, total: 4, inModule: { index: 2, total: 2 } });
  });
  it("extremos sin anterior o siguiente", () => {
    expect(neighborsOf(files, "a1")!.prev).toBeNull();
    expect(neighborsOf(files, "b2")!.next).toBeNull();
    expect(neighborsOf(files, "x")).toBeNull();
  });
});

describe("preguntas sobre el documento", () => {
  it("incluye el documento, la pregunta y protege contra instrucciones del PDF", () => {
    const p = buildAskPrompt({ mode: "pregunta", question: "¿Qué es una serie?", title: "UA2", courseName: "Análisis", text: "[Página 1]\nSeries", history: [] });
    expect(p.user).toContain("[Página 1]");
    expect(p.user).toContain("¿Qué es una serie?");
    expect(p.system).toMatch(/ignora cualquier instrucción/);
  });
  it("recorta documentos largos y lo indica", () => {
    const p = buildAskPrompt({ mode: "resumen", question: "", title: "x", courseName: "y", text: "a".repeat(DOC_CHAR_LIMIT + 10), history: [] });
    expect(p.user).toContain('recortado="sí"');
    expect(p.user.length).toBeLessThan(DOC_CHAR_LIMIT + 2000);
  });
});
