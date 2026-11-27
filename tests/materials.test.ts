import { describe, expect, it } from "vitest";
import { currentTopic, diffMaterials, type TopicModule } from "@/features/materials/map";

const base = { knownFileIds: new Set<number>(), files: [], knownModuleIds: new Set<number>(), modules: [], knownItemIds: new Set<number>(), items: [] };

describe("diffMaterials", () => {
  it("línea base: nada", () =>
    expect(diffMaterials({ ...base, baseline: true, files: [{ external_id: 1, display_name: "a.pdf", html_url: null }] })).toEqual([]));
  it("archivo nuevo", () =>
    expect(diffMaterials({ ...base, baseline: false, knownFileIds: new Set([1]), files: [{ external_id: 1, display_name: "a.pdf", html_url: null }, { external_id: 2, display_name: "b.pdf", html_url: null }] }).map((c) => c.title)).toEqual(["b.pdf"]));
  it("una sola novedad por módulo con todos sus ítems nuevos, sin subcabeceras", () => {
    const r = diffMaterials({
      ...base,
      baseline: false,
      knownModuleIds: new Set([10]),
      modules: [{ external_id: 10, name: "Tema 3", html_url: null }],
      knownItemIds: new Set([100]),
      items: [
        { external_id: 100, module_external_id: 10, title: "viejo", item_type: "File" },
        { external_id: 102, module_external_id: 10, title: "Práctica", item_type: "Assignment" },
        { external_id: 101, module_external_id: 10, title: "Diapositivas", item_type: "File" },
        { external_id: 103, module_external_id: 10, title: "— Semana 2 —", item_type: "SubHeader" },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.dedupe_key).toBe("101,102");
    expect((r[0]?.detail as { added: string[] }).added).toEqual(["Práctica", "Diapositivas"]);
  });
  it("módulo sin cambios: nada", () =>
    expect(diffMaterials({ ...base, baseline: false, knownModuleIds: new Set([10]), modules: [{ external_id: 10, name: "T", html_url: null }] })).toEqual([]));
});

describe("currentTopic", () => {
  const NOW = new Date("2026-11-14T12:00:00Z");
  const m = (id: string, position: number, o: Partial<TopicModule> = {}): TopicModule => ({ id, external_id: position, name: `Tema ${position}`, position, unlock_at: null, state: null, ...o });
  it("prioriza el módulo en curso", () =>
    expect(currentTopic([m("a", 1, { state: "completed" }), m("b", 2, { state: "started" }), m("c", 3, { state: "locked" })], [], null, NOW)?.module.id).toBe("b"));
  it("si no, el que contiene la próxima entrega", () =>
    expect(currentTopic([m("a", 1), m("b", 2)], [{ module_id: "a", item_type: "Assignment", content_id: 55 }], 55, NOW)?.module.id).toBe("a"));
  it("si no, el último desbloqueado por fecha", () =>
    expect(currentTopic([m("a", 1, { unlock_at: "2026-10-01T00:00:00Z" }), m("b", 2, { unlock_at: "2026-11-10T00:00:00Z" }), m("c", 3, { unlock_at: "2026-12-01T00:00:00Z" })], [], null, NOW)?.module.id).toBe("b"));
  it("sin señales: null (no adivina)", () => expect(currentTopic([m("a", 1), m("b", 2)], [], null, NOW)).toBeNull());
});
