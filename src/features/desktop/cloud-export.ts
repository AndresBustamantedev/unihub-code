import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localDbRoot } from "@/lib/local-db/pg";
import { LOCAL_ONLY_COLUMNS, OWN_CONTENT, SYNCED_TABLES } from "./tables";

/**
 * «Copia en la web»: sube los datos del programa de escritorio a Supabase para no perder nada
 * y poder volver a la web cuando se quiera. El ordenador manda: lo que se borró aquí también
 * se borra en la web. Los archivos (PDF, vídeos) no se suben: se quedan en la carpeta local.
 * Solo funciona si un administrador ha activado la copia para la cuenta (Supabase lo comprueba).
 */

type Res<T = unknown> = PromiseLike<{ data: T | null; error: { message: string } | null; count?: number | null }>;
interface Q extends Res<Record<string, unknown>[]> {
  select(c: string, o?: { count: "exact"; head: true }): Q;
  eq(c: string, v: string): Q;
  in(c: string, v: string[]): Q;
  order(c: string): Q;
  range(a: number, b: number): Q;
  delete(): Q;
  upsert(rows: unknown[], o: { onConflict: string; ignoreDuplicates?: boolean }): Q;
  update(v: Record<string, unknown>): Q;
  maybeSingle(): Res<Record<string, unknown>>;
}
export interface LooseDb {
  from(t: string): Q;
  rpc(fn: string, args?: Record<string, unknown>): Res;
}

export type ExportResult =
  | { ok: true; uploaded: number; removed: number; at: string }
  | { ok: false; error: string; needsConfirm?: boolean };

const PAGE = 500;
const MAX_CHUNK_ROWS = 200;
const MAX_CHUNK_BYTES = 900_000;
const DELETE_CHUNK = 100;

async function readAll(db: LooseDb, table: string, uid: string, columns = "*"): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).eq("user_id", uid).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** Trozos por número de filas y por tamaño (los textos de material pueden ser largos). */
function chunks(rows: Record<string, unknown>[]): Record<string, unknown>[][] {
  const out: Record<string, unknown>[][] = [];
  let cur: Record<string, unknown>[] = [];
  let bytes = 0;
  for (const r of rows) {
    const size = JSON.stringify(r).length;
    if (cur.length && (cur.length >= MAX_CHUNK_ROWS || bytes + size > MAX_CHUNK_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** ¿Tiene esta cuenta la copia en la web activada? (lo decide un administrador en Supabase). */
export async function cloudAccess(remote: LooseDb): Promise<{ isAdmin: boolean; enabled: boolean }> {
  const { data, error } = await remote.rpc("my_cloud_access");
  const row = Array.isArray(data) ? (data[0] as { is_admin?: boolean; cloud_enabled?: boolean } | undefined) : undefined;
  if (error || !row) return { isAdmin: false, enabled: false };
  return { isAdmin: !!row.is_admin, enabled: !!row.cloud_enabled };
}

export async function exportLocalToWeb(opts: { uid: string; local: LooseDb; remote: LooseDb; force?: boolean }): Promise<ExportResult> {
  const { uid, local, remote } = opts;
  const access = await cloudAccess(remote);
  if (!access.enabled) return { ok: false, error: "La copia en la web no está activada para tu cuenta (la activa un administrador)." };

  // 1. Todo lo de este ordenador, antes de tocar nada en la web.
  const localRows = new Map<string, Record<string, unknown>[]>();
  for (const t of SYNCED_TABLES) {
    const rows = await readAll(local, t, uid);
    localRows.set(
      t,
      rows.map((r) => {
        const copy = { ...r };
        for (const c of LOCAL_ONLY_COLUMNS) delete copy[c];
        return copy;
      }),
    );
  }

  // 2. Lo que hay en la web.
  const remoteIds = new Map<string, string[]>();
  for (const t of SYNCED_TABLES) remoteIds.set(t, (await readAll(remote, t, uid, "id")).map((r) => String(r.id)));

  // 3. Protección: si este ordenador tiene mucho menos contenido propio que la web (p. ej. una
  //    instalación nueva), no se borra nada sin confirmarlo.
  if (!opts.force) {
    const own = (m: Map<string, unknown[]>) => OWN_CONTENT.reduce((n, t) => n + (m.get(t)?.length ?? 0), 0);
    const here = own(localRows);
    const there = own(remoteIds);
    if (there > 0 && (here === 0 || (there - here > 10 && here < there * 0.7))) {
      return {
        ok: false,
        needsConfirm: true,
        error: `En la web hay ${there} clases, apuntes y notas tuyos y en este ordenador ${here}. Si subes ahora, la web quedará igual que este ordenador y se borrará lo que falta aquí. Si lo que quieres es recuperarlo, usa «Traer mis datos de la web».`,
      };
    }
  }

  // 4. Se borra en la web lo que ya no está aquí (de las tablas hijas a las madres).
  let removed = 0;
  for (const t of [...SYNCED_TABLES].reverse()) {
    const keep = new Set((localRows.get(t) ?? []).map((r) => String(r.id)));
    const gone = (remoteIds.get(t) ?? []).filter((id) => !keep.has(id));
    for (let i = 0; i < gone.length; i += DELETE_CHUNK) {
      const { error } = await remote.from(t).delete().in("id", gone.slice(i, i + DELETE_CHUNK));
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    removed += gone.length;
  }

  // 5. Se sube todo (lo que ya estaba se actualiza).
  let uploaded = 0;
  for (const t of SYNCED_TABLES) {
    for (const part of chunks(localRows.get(t) ?? [])) {
      const { error } = await remote.from(t).upsert(part, { onConflict: "id" });
      if (error) throw new Error(`${t}: ${error.message}`);
      uploaded += part.length;
    }
  }

  // 6. Del perfil, el usuario de la universidad (la contraseña está cifrada con la clave de este ordenador).
  const { data: profile } = await local.from("profiles").select("university_login").eq("id", uid).maybeSingle();
  if (profile && typeof profile.university_login === "string") {
    await remote.from("profiles").update({ university_login: profile.university_login }).eq("id", uid);
  }

  return { ok: true, uploaded, removed, at: new Date().toISOString() };
}

/* ─── Estado y preferencia (un archivo junto a la base de datos de la cuenta) ─── */

export interface CloudExportState {
  daily: boolean;
  lastAt: string | null;
  lastResult: string | null;
  lastOk: boolean | null;
}

function stateFile(uid: string): string {
  return path.join(localDbRoot(), uid, "copia-web.json");
}

export function readCloudState(uid: string): CloudExportState {
  const base: CloudExportState = { daily: false, lastAt: null, lastResult: null, lastOk: null };
  try {
    const f = stateFile(uid);
    if (!existsSync(f)) return base;
    return { ...base, ...(JSON.parse(readFileSync(f, "utf8")) as Partial<CloudExportState>) };
  } catch {
    return base;
  }
}

export function writeCloudState(uid: string, patch: Partial<CloudExportState>): CloudExportState {
  const next = { ...readCloudState(uid), ...patch };
  mkdirSync(path.dirname(stateFile(uid)), { recursive: true });
  writeFileSync(stateFile(uid), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function describeResult(r: ExportResult): string {
  return r.ok ? `Subido a la web: ${r.uploaded} registros${r.removed ? `, ${r.removed} borrados que ya no estaban aquí` : ""}.` : r.error;
}
