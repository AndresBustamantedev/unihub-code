import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeCanvasUrl, searchSchools, KNOWN } = require("../desktop/lib/universities.js") as {
  normalizeCanvasUrl: (v: string) => string | null;
  searchSchools: (t: string, f?: typeof fetch) => Promise<{ name: string; domain: string; known: boolean }[]>;
  KNOWN: { name: string; domain: string }[];
};

const fakeFetch = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("elegir universidad en el programa", () => {
  it("acepta cualquier forma de la dirección del campus", () => {
    const want = "https://campus.uni.es/api/v1";
    for (const v of ["campus.uni.es", "https://campus.uni.es", "https://campus.uni.es/", "https://Campus.Uni.es/courses/123?x=1", "https://campus.uni.es/api/v1", "http://campus.uni.es/login/canvas"]) {
      expect(normalizeCanvasUrl(v)).toBe(want);
    }
    for (const v of ["", "hola", "ftp://campus.uni.es", "https://localhost", "javascript:alert(1)"]) expect(normalizeCanvasUrl(v)).toBeNull();
  });

  it("los campus conocidos salen primero y sin depender de internet", async () => {
    const offline = (async () => {
      throw new Error("sin red");
    }) as unknown as typeof fetch;
    const r = await searchSchools("europea", offline);
    expect(r[0]).toMatchObject({ name: "Universidad Europea", domain: "campus.europaeducationgroup.es", known: true });
    expect(await searchSchools("catolica de chile", offline)).toEqual([expect.objectContaining({ domain: "cursos.canvas.uc.cl" })]);
  });

  it("añade los resultados del buscador de Canvas sin repetir ni aceptar basura", async () => {
    const r = await searchSchools(
      "europea",
      fakeFetch([
        { name: "Universidad Europea", domain: "campus.europaeducationgroup.es" },
        { name: "Otra Universidad", domain: "otra.instructure.com" },
        { name: "Mal", domain: "no es un dominio" },
        { name: "", domain: "vacia.instructure.com" },
      ]),
    );
    expect(r.map((x) => x.domain)).toEqual(["campus.europaeducationgroup.es", "otra.instructure.com"]);
    expect(r[1]?.known).toBe(false);
  });

  it("no busca con menos de 3 letras", async () => {
    expect(await searchSchools("eu", fakeFetch([{ name: "X", domain: "x.instructure.com" }]))).toEqual([]);
  });

  it("todas las direcciones conocidas son válidas", () => {
    for (const k of KNOWN) expect(normalizeCanvasUrl(k.domain)).toBe(`https://${k.domain}/api/v1`);
  });
});
