import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-rec-db-"));
const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-rec-files-"));
vi.stubEnv("UNIHUB_DB_DIR", dbDir);
vi.stubEnv("UNIHUB_FILES_DIR", filesDir);

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.rmSync(filesDir, { recursive: true, force: true });
});

const pgMod = () => import("@/lib/local-db/pg");
const insertCourse = (db: PGlite, uid: string, ext: number, name: string) =>
  db.query("insert into courses (user_id, external_id, name, category) values ($1, $2, $3, 'current')", [uid, ext, name]);
const names = async (db: PGlite) => (await db.query<{ name: string }>("select name from courses order by name")).rows.map((r) => r.name);
/** Simula que el proceso del servidor muere sin cerrar nada: se olvida el registro en memoria. */
const killProcess = () => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for("unihub.localDb.registry")];
};

describe("base de datos local: guardado a prueba de cortes", () => {
  it("todo el servidor usa la misma base de datos (aunque Next cargue el módulo varias veces)", async () => {
    const { getLocalDb, closeAllLocalDbs } = await pgMod();
    const uid = "10000000-0000-4000-8000-000000000001";
    const a = await getLocalDb(uid, "a@uem.es");
    vi.resetModules(); // otra copia del módulo, como los trozos de Next
    const again = await pgMod();
    expect(await again.getLocalDb(uid, "a@uem.es")).toBe(a);
    await closeAllLocalDbs();
  }, 60_000);

  it("se conserva al cerrar y volver a abrir", async () => {
    const { getLocalDb, closeAllLocalDbs } = await pgMod();
    const uid = "10000000-0000-4000-8000-000000000002";
    await insertCourse(await getLocalDb(uid, "b@uem.es"), uid, 1, "Análisis");
    await closeAllLocalDbs();
    expect(fs.existsSync(path.join(dbDir, uid, "datos.tar.gz"))).toBe(true);
    expect(await names(await getLocalDb(uid, "b@uem.es"))).toEqual(["Análisis"]);
    await closeAllLocalDbs();
  }, 60_000);

  it("si el programa se corta de golpe, se recupera lo guardado (como mucho pierde los últimos segundos)", async () => {
    const { getLocalDb, checkpointLocalDb } = await pgMod();
    const uid = "10000000-0000-4000-8000-000000000003";
    const db = await getLocalDb(uid, "c@uem.es");
    await insertCourse(db, uid, 1, "Redes");
    await checkpointLocalDb(uid);
    await insertCourse(db, uid, 2, "Sin guardar");
    killProcess();
    const reopened = await (await pgMod()).getLocalDb(uid, "c@uem.es");
    expect(await names(reopened)).toEqual(["Redes"]);
    await (await pgMod()).closeAllLocalDbs();
  }, 60_000);

  it("guarda solo tras unos segundos sin pedirlo", async () => {
    const { getLocalDb } = await pgMod();
    const uid = "10000000-0000-4000-8000-000000000004";
    const db = await getLocalDb(uid, "d@uem.es");
    await insertCourse(db, uid, 1, "Bases");
    await new Promise((r) => setTimeout(r, 3_500));
    killProcess();
    expect(await names(await (await pgMod()).getLocalDb(uid, "d@uem.es"))).toEqual(["Bases"]);
    await (await pgMod()).closeAllLocalDbs();
  }, 60_000);

  it("si el último guardado está dañado, usa el anterior", async () => {
    const { getLocalDb, checkpointLocalDb, closeAllLocalDbs } = await pgMod();
    const uid = "10000000-0000-4000-8000-000000000005";
    const db = await getLocalDb(uid, "e@uem.es");
    await insertCourse(db, uid, 1, "Uno");
    await checkpointLocalDb(uid);
    await insertCourse(db, uid, 2, "Dos");
    await closeAllLocalDbs();
    fs.writeFileSync(path.join(dbDir, uid, "datos.tar.gz"), "basura");
    expect(await names(await getLocalDb(uid, "e@uem.es"))).toEqual(["Uno"]);
    await closeAllLocalDbs();
  }, 60_000);

  it("si todo está dañado, lo aparta (sin borrar) y restaura la copia de seguridad", async () => {
    const { getLocalDb, readRecoveryNote, closeAllLocalDbs } = await pgMod();
    const { backupLocalDb } = await import("@/features/desktop/backup");
    const uid = "10000000-0000-4000-8000-000000000006";
    const email = "yo@uem.es";
    await insertCourse(await getLocalDb(uid, email), uid, 77, "Análisis Matemático");
    await backupLocalDb(uid, email);
    await closeAllLocalDbs();
    for (const f of ["datos.tar.gz", "datos.anterior.tar.gz"]) {
      if (fs.existsSync(path.join(dbDir, uid, f))) fs.writeFileSync(path.join(dbDir, uid, f), "basura");
    }
    expect(await names(await getLocalDb(uid, email))).toEqual(["Análisis Matemático"]);
    expect(readRecoveryNote(uid)?.mode).toBe("backup");
    expect(fs.readdirSync(path.join(dbDir, uid)).some((n) => n.startsWith("dañados-"))).toBe(true);
    await closeAllLocalDbs();
  }, 60_000);

  it("convierte la carpeta de la versión anterior y la aparta", async () => {
    const uid = "10000000-0000-4000-8000-000000000007";
    const legacy = path.join(dbDir, uid, "db");
    fs.mkdirSync(legacy, { recursive: true });
    const old = await PGlite.create(legacy);
    await old.exec("create table viejo (n int); insert into viejo values (42);");
    await old.close();
    const { getLocalDb, closeAllLocalDbs } = await pgMod();
    const db = await getLocalDb(uid, "f@uem.es");
    expect((await db.query<{ n: number }>("select n from viejo")).rows).toEqual([{ n: 42 }]);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.readdirSync(path.join(dbDir, uid)).some((n) => n.startsWith("db-anterior-"))).toBe(true);
    await closeAllLocalDbs();
  }, 60_000);

  it("una carpeta antigua dañada se aparta y se empieza de nuevo", async () => {
    const uid = "10000000-0000-4000-8000-000000000008";
    const broken = path.join(dbDir, uid, "db");
    fs.mkdirSync(path.join(broken, "global"), { recursive: true });
    fs.writeFileSync(path.join(broken, "PG_VERSION"), "17\n");
    fs.writeFileSync(path.join(broken, "global", "pg_control"), "basura");
    const { getLocalDb, readRecoveryNote, closeAllLocalDbs } = await pgMod();
    expect(await names(await getLocalDb(uid, "g@uem.es"))).toEqual([]);
    expect(readRecoveryNote(uid)?.mode).toBe("nueva");
    expect(fs.readdirSync(path.join(dbDir, uid)).some((n) => n.startsWith("db-dañada-"))).toBe(true);
    await closeAllLocalDbs();
  }, 60_000);

  describe("candado: nunca dos procesos sobre la misma base de datos", () => {
    const lockOf = (uid: string) => path.join(dbDir, uid, "en-uso.lock");
    const writeLock = (uid: string, pid: number, at = Date.now()) => {
      fs.mkdirSync(path.join(dbDir, uid), { recursive: true });
      fs.writeFileSync(lockOf(uid), JSON.stringify({ pid, at }));
    };

    it("si otro proceso vivo la tiene abierta, se niega", async () => {
      const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
      try {
        const uid = "10000000-0000-4000-8000-000000000009";
        writeLock(uid, other.pid!);
        const { getLocalDb, LocalDbLockedError } = await pgMod();
        await expect(getLocalDb(uid, "h@uem.es")).rejects.toBeInstanceOf(LocalDbLockedError);
        // No se tocó nada: el candado sigue siendo del otro proceso.
        expect(JSON.parse(fs.readFileSync(lockOf(uid), "utf8")).pid).toBe(other.pid);
      } finally {
        other.kill();
      }
    }, 60_000);

    it("si el proceso que la tenía murió, toma el candado y lo suelta al cerrar", async () => {
      const dead = spawn(process.execPath, ["-e", ""]);
      await new Promise((r) => dead.on("exit", r));
      const uid = "10000000-0000-4000-8000-000000000010";
      writeLock(uid, dead.pid!);
      const { getLocalDb, closeAllLocalDbs } = await pgMod();
      await getLocalDb(uid, "i@uem.es");
      expect(JSON.parse(fs.readFileSync(lockOf(uid), "utf8")).pid).toBe(process.pid);
      await closeAllLocalDbs();
      expect(fs.existsSync(lockOf(uid))).toBe(false);
    }, 60_000);

    it("un candado sin latido desde hace más de 2 minutos está abandonado", async () => {
      const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
      try {
        const uid = "10000000-0000-4000-8000-000000000011";
        writeLock(uid, other.pid!, Date.now() - 5 * 60_000);
        const { getLocalDb, closeAllLocalDbs } = await pgMod();
        await getLocalDb(uid, "j@uem.es");
        await closeAllLocalDbs();
      } finally {
        other.kill();
      }
    }, 60_000);
  });
});
