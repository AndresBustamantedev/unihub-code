import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalDataClient } from "@/lib/local-db/builder";
import { localParsers, prepareDatabase } from "@/lib/local-db/pg";
import type { LooseDb } from "@/features/desktop/cloud-export";

vi.mock("server-only", () => ({}));

const UID = "55555555-5555-4555-8555-555555555555";
let localPg: PGlite;
let remotePg: PGlite;
let local: LooseDb;
let remote: LooseDb;

async function makeDb(enabled: boolean) {
  const pg = new PGlite({ parsers: await localParsers() });
  await prepareDatabase(pg, UID, "yo@uem.es");
  await pg.exec(`create function public.my_cloud_access() returns table (is_admin boolean, cloud_enabled boolean)
    language sql as $$ select false, ${enabled} $$;`);
  return pg;
}

async function addCourse(pg: PGlite, ext: number, name: string) {
  const r = await pg.query<{ id: string }>(
    "insert into courses (user_id, external_id, name, category) values ($1, $2, $3, 'current') returning id",
    [UID, ext, name],
  );
  return r.rows[0]?.id ?? "";
}
async function addSession(pg: PGlite, courseId: string, title: string) {
  await pg.query("insert into class_sessions (user_id, course_id, title, session_at) values ($1, $2, $3, '2026-11-20T10:00:00Z')", [UID, courseId, title]);
}
const names = async (pg: PGlite, sql: string) => (await pg.query<{ v: string }>(sql)).rows.map((r) => r.v).sort();

beforeAll(async () => {
  localPg = await makeDb(true);
  remotePg = await makeDb(true);
  local = createLocalDataClient(localPg) as unknown as LooseDb;
  remote = createLocalDataClient(remotePg) as unknown as LooseDb;
}, 120_000);

describe("subir los datos del ordenador a la web", () => {
  it("sube, actualiza y borra lo que ya no está en el ordenador", async () => {
    const { exportLocalToWeb } = await import("@/features/desktop/cloud-export");
    const analisis = await addCourse(localPg, 1, "Análisis");
    await addSession(localPg, analisis, "Límites");
    await localPg.query("update class_sessions set local_video = 'Análisis/Clases/v.mp4'");
    // En la web hay un curso creado por la sincronización de la web con el mismo curso de Canvas
    // (otro identificador) y otro que ya no existe en el ordenador.
    await addCourse(remotePg, 1, "Análisis (web)");
    await addCourse(remotePg, 2, "Asignatura vieja");

    const r = await exportLocalToWeb({ uid: UID, local, remote });
    expect(r.ok).toBe(true);
    expect(await names(remotePg, "select name as v from courses")).toEqual(["Análisis"]);
    expect(await names(remotePg, "select title as v from class_sessions")).toEqual(["Límites"]);
    // Las rutas de este ordenador no se suben.
    expect(await names(remotePg, "select coalesce(local_video, '-') as v from class_sessions")).toEqual(["-"]);

    await localPg.query("update class_sessions set title = 'Límites y continuidad'");
    const again = await exportLocalToWeb({ uid: UID, local, remote });
    expect(again.ok && again.removed).toBe(0);
    expect(await names(remotePg, "select title as v from class_sessions")).toEqual(["Límites y continuidad"]);
  }, 60_000);

  it("no vacía la web desde un ordenador sin datos sin confirmarlo", async () => {
    const { exportLocalToWeb } = await import("@/features/desktop/cloud-export");
    const empty = await makeDb(true);
    const r = await exportLocalToWeb({ uid: UID, local: createLocalDataClient(empty) as unknown as LooseDb, remote });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.needsConfirm).toBe(true);
    expect(await names(remotePg, "select title as v from class_sessions")).toEqual(["Límites y continuidad"]);
  }, 60_000);

  it("sin la copia activada no sube nada", async () => {
    const { exportLocalToWeb } = await import("@/features/desktop/cloud-export");
    const off = await makeDb(false);
    const r = await exportLocalToWeb({ uid: UID, local, remote: createLocalDataClient(off) as unknown as LooseDb });
    expect(r.ok).toBe(false);
    expect(await names(off, "select name as v from courses")).toEqual([]);
  }, 60_000);
});
