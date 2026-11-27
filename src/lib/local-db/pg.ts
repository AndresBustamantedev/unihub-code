import "server-only";
import path from "node:path";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { safeSegment } from "@/lib/local-files-names";
import type { PGlite } from "@electric-sql/pglite";
import { LOCAL_MIGRATIONS } from "./migrations.generated";
import { DEMO_USER, isDemo } from "@/lib/local-only";
import { seedDemoIfEmpty } from "./demo";

/**
 * Base de datos local del programa de escritorio: Postgres embebido (PGlite), guardado en la
 * carpeta de datos del usuario, con exactamente las mismas tablas que Supabase (se aplican las mismas
 * migraciones). Una base de datos por cuenta: si dos personas comparten ordenador, no se mezclan.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo mínimo de Supabase que las migraciones esperan (esquema auth, roles y auth.uid()). */
const BOOTSTRAP = `
set timezone to 'UTC';
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('unihub.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create table if not exists public.local_migrations (name text primary key, applied_at timestamptz not null default now());
`;

/** Fechas como las devuelve Supabase (texto ISO), no como objetos Date. */
function isoTimestamp(v: string): string {
  // "2026-11-12 18:44:00.123+00" → "2026-11-12T18:44:00.123+00:00"
  return v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
}

/** Carpeta de las bases de datos (en %APPDATA%: no debe estar dentro de una carpeta sincronizada). */
export function localDbRoot(): string {
  const base = process.env.UNIHUB_DB_DIR;
  if (!base) throw new Error("UNIHUB_DB_DIR no está definido (solo en el programa de escritorio).");
  return base;
}

/** Conversión de tipos para que los datos tengan la misma forma que los de Supabase. */
export async function localParsers() {
  const { types } = await import("@electric-sql/pglite");
  return {
    [types.TIMESTAMPTZ]: (v: string) => isoTimestamp(v),
    [types.TIMESTAMP]: (v: string) => isoTimestamp(v),
    [types.DATE]: (v: string) => v,
    [types.NUMERIC]: (v: string) => Number(v),
  };
}

/**
 * Registro ÚNICO por proceso. Next compila este módulo en varios trozos (páginas, rutas…) y cada
 * trozo tendría sus propias variables: se guardan en `globalThis` para que todo el servidor use la
 * misma base de datos. (Dos instancias sobre los mismos datos los corrompen.)
 */
interface Slot {
  db: PGlite;
  uid: string;
  file: string;
  dirty: boolean;
  saving: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  firstDirtyAt: number;
  /** Suelta el candado de la base de datos. */
  release: () => void;
}
interface Registry {
  instances: Map<string, Promise<PGlite>>;
  slots: Map<string, Slot>;
}
const REGISTRY_KEY = Symbol.for("unihub.localDb.registry");
function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[REGISTRY_KEY] ??= { instances: new Map(), slots: new Map() });
}

/** Tras un cambio se guarda a los 2 s; con cambios seguidos, como mucho cada 20 s. */
const SAVE_DELAY_MS = 2_000;
const SAVE_MAX_WAIT_MS = 20_000;

export interface RecoveryNote {
  at: string;
  mode: "backup" | "nueva";
  backup: string | null;
  aside: string;
}

function recoveryFile(uid: string): string {
  return path.join(localDbRoot(), uid, "recuperacion.json");
}

/** Aviso de que la base de datos tuvo que recuperarse (se muestra en Inicio hasta que se cierra). */
export function readRecoveryNote(uid: string): RecoveryNote | null {
  try {
    return JSON.parse(readFileSync(recoveryFile(uid), "utf8")) as RecoveryNote;
  } catch {
    return null;
  }
}

export function dismissRecoveryNote(uid: string): void {
  rmSync(recoveryFile(uid), { force: true });
}

/** Copia de seguridad más reciente de esta cuenta en la carpeta de UniHub (si la hay). */
function latestBackup(email: string | null, uid: string): string | null {
  const root = process.env.UNIHUB_FILES_DIR;
  if (!root) return null;
  const dir = path.join(root, "_copia de seguridad");
  const who = safeSegment((email ?? uid).split("@")[0] ?? uid);
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(`unihub-${who}-`) && f.endsWith(".tar.gz"))
      .sort();
    return files.length ? path.join(dir, files[files.length - 1]!) : null;
  } catch {
    return null;
  }
}

/*
 * Almacenamiento: la base de datos funciona en memoria y se guarda ENTERA en un archivo
 * (datos.tar.gz). Cada guardado escribe un archivo nuevo y lo cambia por el anterior de golpe
 * (renombrar), así que un corte nunca deja un archivo a medias: como mucho se pierden los
 * últimos segundos. Se conserva también el guardado anterior (datos.anterior.tar.gz).
 */
const DATA_FILE = "datos.tar.gz";
const PREV_FILE = "datos.anterior.tar.gz";
const TMP_FILE = "datos.nuevo.tar.gz";

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function loadSnapshot(file: string, parsers: Awaited<ReturnType<typeof localParsers>>): Promise<PGlite | null> {
  if (!existsSync(file)) return null;
  const { PGlite } = await import("@electric-sql/pglite");
  try {
    const db = await PGlite.create({ parsers, loadDataDir: new Blob([readFileSync(file)]) });
    await db.query("select 1");
    return db;
  } catch {
    return null;
  }
}

/*
 * Candado: un archivo «en-uso.lock» con el proceso que tiene abierta la base de datos y la hora
 * de su último latido (cada 30 s). Si otro proceso vivo la tiene abierta, se niega a abrir una
 * segunda copia. Si el proceso murió o lleva más de 2 min sin latir, el candado está abandonado
 * y se toma.
 */
const LOCK_FILE = "en-uso.lock";
const HEARTBEAT_MS = 30_000;
const STALE_MS = 2 * 60_000;

export class LocalDbLockedError extends Error {
  constructor() {
    super("La base de datos de UniHub ya está abierta en otro proceso (¿hay otro UniHub abierto?). Ciérralo y vuelve a intentarlo.");
    this.name = "LocalDbLockedError";
  }
}

interface LockInfo {
  pid: number;
  at: number;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function writeLock(file: string, flag: "wx" | "w"): void {
  const fd = openSync(file, flag);
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() } satisfies LockInfo));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Toma el candado o lanza LocalDbLockedError. Devuelve la función que lo suelta. */
export function acquireLock(base: string): () => void {
  const file = path.join(base, LOCK_FILE);
  try {
    writeLock(file, "wx");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    let info: LockInfo | null = null;
    try {
      info = JSON.parse(readFileSync(file, "utf8")) as LockInfo;
    } catch {
      /* candado ilegible: abandonado */
    }
    const held = info && info.pid !== process.pid && processAlive(info.pid) && Date.now() - info.at < STALE_MS;
    if (held) throw new LocalDbLockedError();
    writeLock(file, "w");
  }
  const beat = setInterval(() => {
    try {
      writeLock(file, "w");
    } catch {
      /* se reintenta en el siguiente latido */
    }
  }, HEARTBEAT_MS);
  beat.unref?.();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearInterval(beat);
    process.removeListener("exit", release);
    try {
      const info = JSON.parse(readFileSync(file, "utf8")) as LockInfo;
      if (info.pid === process.pid) rmSync(file, { force: true });
    } catch {
      /* ya no está */
    }
  };
  process.on("exit", release);
  return release;
}

async function open(uid: string, email: string | null): Promise<PGlite> {
  const { PGlite } = await import("@electric-sql/pglite");
  const parsers = await localParsers();
  const base = path.join(localDbRoot(), uid);
  mkdirSync(base, { recursive: true });
  const release = acquireLock(base);
  try {
    return await openLocked(uid, email, base, release);
  } catch (err) {
    release();
    throw err;
  }
}

async function openLocked(uid: string, email: string | null, base: string, release: () => void): Promise<PGlite> {
  const { PGlite } = await import("@electric-sql/pglite");
  const parsers = await localParsers();
  const file = path.join(base, DATA_FILE);
  const legacyDir = path.join(base, "db");

  // 1. El último guardado; si falta o no se puede leer, el que se estaba escribiendo o el anterior.
  let db: PGlite | null = null;
  for (const f of [file, path.join(base, TMP_FILE), path.join(base, PREV_FILE)]) {
    db = await loadSnapshot(f, parsers);
    if (db) break;
  }

  // 2. Versión antigua del programa: carpeta de Postgres. Se convierte una vez y se aparta.
  let note: RecoveryNote | null = null;
  if (!db && existsSync(path.join(legacyDir, "PG_VERSION"))) {
    try {
      const old = await PGlite.create(legacyDir, { parsers });
      const dump = await old.dumpDataDir("gzip");
      await old.close();
      db = await PGlite.create({ parsers, loadDataDir: dump });
      renameSync(legacyDir, `${legacyDir}-anterior-${stamp()}`);
    } catch {
      const aside = `${legacyDir}-dañada-${stamp()}`;
      try {
        renameSync(legacyDir, aside);
      } catch {
        /* ya apartada */
      }
      note = { at: new Date().toISOString(), mode: "nueva", backup: null, aside };
    }
  } else if (!db && (existsSync(file) || existsSync(path.join(base, PREV_FILE)))) {
    // Había guardados pero ninguno se puede leer: se apartan (nunca se borran).
    const aside = path.join(base, `dañados-${stamp()}`);
    mkdirSync(aside, { recursive: true });
    for (const f of [DATA_FILE, PREV_FILE, TMP_FILE]) if (existsSync(path.join(base, f))) renameSync(path.join(base, f), path.join(aside, f));
    note = { at: new Date().toISOString(), mode: "nueva", backup: null, aside };
  }

  // 3. Si hubo que apartar algo: la última copia de seguridad o, si no hay, una base nueva.
  if (note) {
    const backup = latestBackup(email, uid);
    if (backup) {
      db = await loadSnapshot(backup, parsers);
      if (db) {
        note.mode = "backup";
        note.backup = path.basename(backup);
      }
    }
    writeFileSync(recoveryFile(uid), JSON.stringify(note, null, 2));
    console.error(`[unihub] base de datos recuperada (${note.mode}); lo dañado está en ${note.aside}`);
  }
  db ??= await PGlite.create({ parsers });

  await prepareDatabase(db, uid, email);
  // Modo demo: datos de ejemplo la primera vez (solo en la base del usuario de la demo).
  if (isDemo() && uid === DEMO_USER.id) await seedDemoIfEmpty(db, uid);
  const slot: Slot = { db, uid, file, dirty: true, saving: null, timer: null, firstDirtyAt: Date.now(), release };
  registry().slots.set(uid, slot);
  watchWrites(slot);
  await saveNow(slot);
  return db;
}

/** Marca la base como modificada tras cualquier escritura y programa el guardado. */
function watchWrites(slot: Slot): void {
  const db = slot.db as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const isRead = (sql: unknown) => typeof sql === "string" && /^\s*(select|show|with\s+[\s\S]*?\)\s*select)\b/i.test(sql) && !/\b(insert|update|delete|create|alter|drop|truncate)\b/i.test(sql);
  for (const m of ["query", "exec", "transaction"] as const) {
    const original = db[m]!.bind(slot.db);
    db[m] = async (...args: unknown[]) => {
      try {
        return await original(...args);
      } finally {
        if (m === "transaction" || !isRead(args[0])) markDirty(slot);
      }
    };
  }
}

function markDirty(slot: Slot): void {
  if (!slot.dirty) slot.firstDirtyAt = Date.now();
  slot.dirty = true;
  if (slot.timer) clearTimeout(slot.timer);
  const wait = Math.max(0, Math.min(SAVE_DELAY_MS, slot.firstDirtyAt + SAVE_MAX_WAIT_MS - Date.now()));
  slot.timer = setTimeout(() => void saveNow(slot).catch((e) => console.error("[unihub] no se pudo guardar la base de datos", e)), wait);
  slot.timer.unref?.();
}

/** Guarda la base de datos entera en su archivo (de forma atómica). Los guardados van en fila. */
async function saveNow(slot: Slot): Promise<void> {
  if (slot.timer) {
    clearTimeout(slot.timer);
    slot.timer = null;
  }
  while (slot.saving) await slot.saving;
  if (!slot.dirty) return;
  slot.dirty = false;
  slot.saving = (async () => {
    const dump = await slot.db.dumpDataDir("gzip");
    const bytes = Buffer.from(await dump.arrayBuffer());
    const dir = path.dirname(slot.file);
    const tmp = path.join(dir, TMP_FILE);
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, bytes);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (existsSync(slot.file)) renameSync(slot.file, path.join(dir, PREV_FILE));
    renameSync(tmp, slot.file);
  })();
  try {
    await slot.saving;
  } catch (err) {
    slot.dirty = true;
    throw err;
  } finally {
    slot.saving = null;
  }
}

/** Guarda ya lo pendiente (tras importaciones grandes o antes de una copia de seguridad). */
export async function checkpointLocalDb(uid: string): Promise<void> {
  const slot = registry().slots.get(uid);
  if (slot) await saveNow(slot);
}

/** Cierre ordenado: guarda lo pendiente de todas las bases de datos y las cierra. */
export async function closeAllLocalDbs(): Promise<number> {
  const { slots, instances } = registry();
  const all = [...slots.values()];
  slots.clear();
  instances.clear();
  for (const slot of all) {
    try {
      await saveNow(slot);
      await slot.db.close();
    } catch (err) {
      console.error("[unihub] error al cerrar la base de datos", err);
    } finally {
      slot.release();
    }
  }
  return all.length;
}

/** Crea o actualiza la estructura (mismas migraciones que Supabase) y registra al usuario. */
export async function prepareDatabase(db: PGlite, uid: string, email: string | null): Promise<void> {
  await db.exec(BOOTSTRAP);
  const applied = new Set((await db.query<{ name: string }>("select name from public.local_migrations")).rows.map((r) => r.name));
  for (const m of LOCAL_MIGRATIONS) {
    if (applied.has(m.name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query("insert into public.local_migrations (name) values ($1)", [m.name]);
    });
  }
  // El usuario de esta base de datos (el trigger de la migración 0001 crea su perfil).
  await db.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do update set email = excluded.email", [uid, email]);
  await db.query("select set_config('unihub.uid', $1, false)", [uid]);
}


/** Base de datos local de una cuenta (se abre una vez y se reutiliza). */
export function getLocalDb(uid: string, email: string | null = null): Promise<PGlite> {
  if (!UUID.test(uid)) return Promise.reject(new Error("Identificador de usuario no válido."));
  const { instances } = registry();
  let p = instances.get(uid);
  if (!p) {
    p = open(uid, email);
    instances.set(uid, p);
    p.catch(() => instances.delete(uid));
  }
  return p;
}
