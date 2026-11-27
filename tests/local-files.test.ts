import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDataClient } from "@/lib/local-db/builder";
import { localParsers, prepareDatabase } from "@/lib/local-db/pg";
import { safeSegment } from "@/lib/local-files-names";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-files-"));
vi.stubEnv("UNIHUB_DESKTOP", "1");
vi.stubEnv("UNIHUB_FILES_DIR", root);
afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("nombres de archivo seguros", () => {
  it("quita caracteres prohibidos en Windows y nombres reservados", () => {
    expect(safeSegment('Tema 1: ¿Qué es "x"? / y\\z')).toBe("Tema 1 ¿Qué es x y z");
    expect(safeSegment("CON")).toBe("_CON");
    expect(safeSegment("apuntes. ")).toBe("apuntes");
    expect(safeSegment("")).toBe("sin nombre");
    expect(safeSegment(`${"a".repeat(200)}.pdf`)).toMatch(/^a+\.pdf$/);
    expect(safeSegment(`${"a".repeat(200)}.pdf`).length).toBe(80);
  });
});

describe("carpeta de UniHub", () => {
  it("no deja salir de la carpeta", async () => {
    const { resolveInRoot } = await import("@/lib/local-files");
    expect(resolveInRoot("Análisis/Material/tema.pdf")).toBe(path.join(root, "Análisis", "Material", "tema.pdf"));
    expect(resolveInRoot("../fuera.txt")).toBeNull();
    expect(resolveInRoot("a/../../fuera.txt")).toBeNull();
    expect(resolveInRoot(path.join(os.tmpdir(), "otro.txt"))).toBeNull();
    expect(resolveInRoot("")).toBeNull();
  });
});

describe("archivos .md de cada clase", () => {
  const UID = "44444444-4444-4444-8444-444444444444";
  let db: ReturnType<typeof createLocalDataClient>;
  let sessionId = "";

  beforeAll(async () => {
    const pg = await PGlite.create({ parsers: await localParsers() });
    await prepareDatabase(pg, UID, "yo@uem.es");
    db = createLocalDataClient(pg);
    const c = await db.from("courses").insert({ user_id: UID, provider: "canvas", external_id: 1, name: "ANÁLISIS MATEMÁTICO (M11-PAGO)", category: "current", followed: true }).select("id").single();
    const courseId = (c.data as { id: string }).id;
    const s = await db
      .from("class_sessions")
      .insert({ user_id: UID, course_id: courseId, title: "Sesión Magistral 12 Nov", session_at: "2026-11-12T16:30:00Z", topics: ["derivada"], source: "manual" })
      .select("id")
      .single();
    sessionId = (s.data as { id: string }).id;
    await db.from("transcripts").insert({ user_id: UID, session_id: sessionId, source_format: "vtt", content_text: "Profesor: hoy vemos derivadas.", word_count: 4, speakers: ["Profesor"] });
    await db.from("study_notes").insert({ user_id: UID, course_id: courseId, session_id: sessionId, kind: "summary", content_md: "## Derivadas\n- Regla de la cadena", provider: "openai", model: "gpt-6-luna", input_hash: "x" });
    await db.from("class_resources").insert({ user_id: UID, course_id: courseId, session_id: sessionId, url: "https://youtu.be/x", title: "Vídeo derivadas" });
  }, 60_000);

  it("escribe transcripción, apuntes y enlaces en <Asignatura>/Clases/<fecha>", async () => {
    const { mirrorSession } = await import("@/features/desktop/mirror");
    const dir = await mirrorSession(db as never, sessionId);
    expect(dir).toBe("Análisis matemático/Clases/2026-11-12");
    const abs = path.join(root, "Análisis matemático", "Clases", "2026-11-12");
    expect(fs.readFileSync(path.join(abs, "transcripcion.md"), "utf8")).toContain("**Profesor:** hoy vemos derivadas.");
    expect(fs.readFileSync(path.join(abs, "apuntes - resumen.md"), "utf8")).toContain("Regla de la cadena");
    expect(fs.readFileSync(path.join(abs, "enlaces.md"), "utf8")).toContain("[Vídeo derivadas](https://youtu.be/x)");
    // Sin restos de escrituras a medias.
    expect(fs.readdirSync(abs).some((f) => f.includes(".tmp-"))).toBe(false);
  });
});

describe("carpetas del programa (Electron)", () => {
  const folders = createRequire(import.meta.url)(path.join(process.cwd(), "desktop", "lib", "folders.js"));

  it("usa una subcarpeta UniHub dentro de la elegida", () => {
    expect(folders.targetFor(path.join("G:", "Mi unidad"))).toBe(path.join("G:", "Mi unidad", "UniHub"));
    expect(folders.targetFor(path.join("D:", "UniHub"))).toBe(path.join("D:", "UniHub"));
  });

  it("mueve los archivos a la carpeta nueva y la base de datos antigua a su sitio", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-move-"));
    const from = path.join(base, "viejo", "UniHub");
    fs.mkdirSync(path.join(from, "Análisis", "Clases"), { recursive: true });
    fs.writeFileSync(path.join(from, "Análisis", "Clases", "nota.md"), "hola");
    fs.mkdirSync(path.join(from, "datos", "uid-1", "db"), { recursive: true });
    fs.writeFileSync(path.join(from, "datos", "uid-1", "db", "PG_VERSION"), "17");

    const dbDir = path.join(base, "appdata", "datos");
    expect(folders.migrateLegacyDb(from, dbDir)).toBe(true);
    expect(fs.existsSync(path.join(dbDir, "uid-1", "db", "PG_VERSION"))).toBe(true);
    expect(fs.existsSync(path.join(from, "datos"))).toBe(false);

    const to = path.join(base, "nube", "UniHub");
    folders.moveContents(from, to);
    expect(fs.readFileSync(path.join(to, "Análisis", "Clases", "nota.md"), "utf8")).toBe("hola");
    expect(fs.existsSync(from)).toBe(false);
    expect(() => folders.moveContents(to, path.join(to, "dentro"))).toThrow();
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("no deja salir de la carpeta", () => {
    expect(folders.inside("/x/UniHub", "a/b.mp4")).toBe(path.resolve("/x/UniHub/a/b.mp4"));
    expect(folders.inside("/x/UniHub", "../b.mp4")).toBeNull();
  });
});
