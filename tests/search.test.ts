import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDataClient } from "@/lib/local-db/builder";
import { localParsers, prepareDatabase } from "@/lib/local-db/pg";
import { chunkPages, chunkText, snippet } from "@/features/search/chunk";
import { questionKeywords } from "@/features/search/keywords";

vi.mock("server-only", () => ({}));

const UID = "66666666-6666-4666-8666-666666666666";
let pg: PGlite;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

async function course(name: string, ext: number) {
  return (await pg.query<{ id: string }>("insert into courses (user_id, external_id, name, category) values ($1,$2,$3,'current') returning id", [UID, ext, name])).rows[0]!.id;
}
async function session(courseId: string, title: string, at: string, transcript: string, notes: string | null = null) {
  const id = (await pg.query<{ id: string }>("insert into class_sessions (user_id, course_id, title, session_at, notes) values ($1,$2,$3,$4,$5) returning id", [UID, courseId, title, at, notes])).rows[0]!.id;
  await pg.query("insert into transcripts (user_id, session_id, source_format, content_text) values ($1,$2,'txt',$3)", [UID, id, transcript]);
  return id;
}

let analisis = "";
let redes = "";
let limites = "";

beforeAll(async () => {
  pg = new PGlite({ parsers: await localParsers() });
  await prepareDatabase(pg, UID, "yo@uem.es");
  db = createLocalDataClient(pg);
  analisis = await course("Análisis matemático", 1);
  redes = await course("Fundamentos de redes", 2);
  limites = await session(
    analisis,
    "Límites e indeterminaciones",
    "2026-11-10T09:00:00Z",
    "Hoy vemos límites. Cuando tenemos una indeterminación del tipo cero entre cero podemos aplicar la regla de L'Hôpital: derivamos numerador y denominador por separado. " +
      "Ojo, solo vale para indeterminaciones 0/0 o infinito entre infinito.",
  );
  await session(analisis, "Derivadas", "2026-11-03T09:00:00Z", "Las derivadas miden la variación instantánea. La derivada de x al cuadrado es 2x.", "Repasar derivadas de funciones compuestas");
  await session(redes, "Modelo OSI", "2026-11-05T09:00:00Z", "El modelo OSI tiene siete capas: física, enlace, red, transporte, sesión, presentación y aplicación.");
  // Material con texto extraído (PDF con páginas).
  const mod = (await pg.query<{ id: string }>("insert into course_modules (user_id, course_id, external_id, name) values ($1,$2,10,'Tema 2') returning id", [UID, analisis])).rows[0]!.id;
  const item = (await pg.query<{ id: string }>("insert into course_module_items (user_id, course_id, module_id, external_id, title, item_type) values ($1,$2,$3,20,'Apuntes tema 2.pdf','File') returning id", [UID, analisis, mod])).rows[0]!.id;
  await pg.query("insert into material_texts (user_id, module_item_id, pages, content_text) values ($1,$2,2,$3)", [
    UID,
    item,
    "[Página 1]\nIntroducción a las series numéricas.\n\n[Página 2]\nCriterio del cociente para la convergencia de series.",
  ]);
}, 120_000);

describe("búsqueda en todo", () => {
  it("trocea textos largos y sabe la página de cada trozo", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Frase número ${i} sobre integrales y derivadas.`).join(" ");
    const parts = chunkText(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.content.length <= 1300)).toBe(true);
    expect(parts[0]!.location).toBe(`Parte 1 de ${parts.length}`);
    expect(chunkPages("[Página 1]\nUno\n\n[Página 2]\nDos").map((c) => c.location)).toEqual(["Página 1", "Página 2"]);
  });

  it("indexa todo y solo reindexa lo que cambia", async () => {
    const { syncSearchIndex } = await import("@/features/search/indexer");
    const first = await syncSearchIndex(db, UID);
    // 3 transcripciones + 1 nota de clase + 1 material
    expect(first).toMatchObject({ indexed: 5, removed: 0, pending: 0 });
    expect(await syncSearchIndex(db, UID)).toMatchObject({ indexed: 0, removed: 0 });
    await pg.query("update class_sessions set notes = 'Repasar la regla de la cadena' where title = 'Derivadas'");
    expect((await syncSearchIndex(db, UID)).indexed).toBe(1);
  }, 60_000);

  it("encuentra sin importar tildes ni mayúsculas, y dice dónde", async () => {
    const { runSearch, groupBySource } = await import("@/features/search/query");
    const hits = await runSearch(db, "lhopital", null);
    const hits2 = await runSearch(db, "L'HÔPITAL", null);
    expect(hits2.length).toBeGreaterThan(0);
    const results = groupBySource(hits.length ? hits : hits2);
    expect(results[0]!.href).toBe(`/clases/${limites}`);
    expect(results[0]!.title).toContain("Límites e indeterminaciones");
    const pdf = groupBySource(await runSearch(db, "criterio del cociente", null));
    expect(pdf[0]).toMatchObject({ title: "Apuntes tema 2.pdf" });
    expect(pdf[0]!.best.location).toBe("Página 2");
  }, 60_000);

  it("se puede limitar a una asignatura", async () => {
    const { runSearch } = await import("@/features/search/query");
    expect((await runSearch(db, "capas", redes)).length).toBeGreaterThan(0);
    expect((await runSearch(db, "capas", analisis)).length).toBe(0);
  });

  it("de una pregunta natural se queda con lo importante", async () => {
    const kw = questionKeywords("¿En qué clase explicó la regla de L'Hôpital?").split(" ");
    expect(kw).toEqual(expect.arrayContaining(["regla", "hopital"]));
    expect(kw).not.toContain("clase");
    expect(kw).not.toContain("explico");
    const { runSearch } = await import("@/features/search/query");
    const hits = await runSearch(db, questionKeywords("¿En qué clase explicó la regla de L'Hôpital?"), null, { matchAny: true });
    expect(hits[0]!.source_id).toBe(limites);
  });

  it("marca la palabra encontrada en el fragmento", () => {
    const parts = snippet("Hoy vemos las derivadas parciales en clase.", "derivada");
    expect(parts.filter(([, hit]) => hit).map(([t]) => t)).toEqual(["derivadas"]);
  });

  it("lo borrado sale del índice", async () => {
    const { syncSearchIndex } = await import("@/features/search/indexer");
    const { runSearch } = await import("@/features/search/query");
    await pg.query("delete from class_sessions where title = 'Modelo OSI'");
    expect((await syncSearchIndex(db, UID)).removed).toBe(1);
    expect(await runSearch(db, "capas", null)).toEqual([]);
  });

  it("en el programa lee el material descargado y lo añade a la búsqueda (y no reintenta lo ilegible)", async () => {
    const files = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-search-files-"));
    vi.stubEnv("UNIHUB_DESKTOP", "1");
    vi.stubEnv("UNIHUB_FILES_DIR", files);
    try {
      fs.mkdirSync(path.join(files, "Analisis", "Material"), { recursive: true });
      fs.writeFileSync(path.join(files, "Analisis", "Material", "integrales.txt"), "La integral por partes: u dv = uv - v du. Truco ALPES para elegir u.");
      fs.writeFileSync(path.join(files, "Analisis", "Material", "practica.zip"), "PK");
      await pg.query("update courses set followed = true");
      const mod = (await pg.query<{ id: string }>("select id from course_modules limit 1")).rows[0]!.id;
      const add = (ext: number, title: string, rel: string) =>
        pg.query("insert into course_module_items (user_id, course_id, module_id, external_id, title, item_type, content_id, local_path) values ($1,$2,$3,$4,$5,'File',$4,$6)", [UID, analisis, mod, ext, title, rel]);
      await add(31, "Integrales.txt", "Analisis/Material/integrales.txt");
      await add(32, "Práctica.zip", "Analisis/Material/practica.zip");
      const { readPendingMaterialTexts } = await import("@/features/materials/text");
      const first = await readPendingMaterialTexts(db, UID, { localOnly: true, limit: 10 });
      expect(first).toEqual({ done: 1, failed: 1, left: 0 });
      // Lo ilegible queda apuntado: no se vuelve a intentar.
      expect(await readPendingMaterialTexts(db, UID, { localOnly: true, limit: 10 })).toEqual({ done: 0, failed: 0, left: 0 });
      const { syncSearchIndex } = await import("@/features/search/indexer");
      await syncSearchIndex(db, UID);
      const { runSearch } = await import("@/features/search/query");
      const hits = await runSearch(db, "integral por partes", null);
      expect(hits[0]?.title).toBe("Integrales.txt");
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(files, { recursive: true, force: true });
    }
  }, 60_000);
});
