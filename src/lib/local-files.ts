import "server-only";
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { displayCourseName } from "@/lib/course-color";
import { safeSegment } from "./local-files-names";
import { LOCAL_TYPES } from "./local-files-types";

export { safeSegment } from "./local-files-names";

/**
 * Carpeta de archivos del programa de escritorio (la elige el usuario; puede estar dentro de
 * Google Drive o OneDrive para que todo se suba solo). Todas las rutas que se guardan en la base
 * de datos son relativas a esta carpeta, así se puede mover sin romper nada.
 */
export function filesRoot(): string | null {
  const root = process.env.UNIHUB_FILES_DIR;
  return root && path.isAbsolute(root) ? root : null;
}

/** Ruta absoluta dentro de la carpeta, o null si se sale de ella (evita "../"). */
export function resolveInRoot(rel: string): string | null {
  const root = filesRoot();
  if (!root || !rel || rel.includes("\0")) return null;
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  if (!r || r.startsWith("..") || path.isAbsolute(r)) return null;
  return abs;
}

/** Une segmentos (ya saneados) en una ruta relativa con "/". */
export function relPath(...segments: string[]): string {
  return segments.map((s) => safeSegment(s)).join("/");
}

export function courseDir(course: { name: string }): string {
  return safeSegment(displayCourseName(course.name));
}

/** Escribe un archivo de texto de forma atómica (nunca queda a medias). */
export function writeTextFile(rel: string, content: string): boolean {
  const abs = resolveInRoot(rel);
  if (!abs) return false;
  mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, abs);
  return true;
}

/** Guarda una descarga en la carpeta (también de forma atómica). Devuelve los bytes escritos. */
export async function writeStreamFile(rel: string, body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array>): Promise<number> {
  const abs = resolveInRoot(rel);
  if (!abs) throw new Error("Ruta fuera de la carpeta de UniHub");
  mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.part`;
  const out = createWriteStream(tmp);
  await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), out);
  renameSync(tmp, abs);
  return out.bytesWritten;
}

/** Si ya existe un archivo con ese nombre, añade " (2)", " (3)"… */
export function uniqueRel(rel: string): string {
  if (!resolveInRoot(rel) || !existsSync(resolveInRoot(rel)!)) return rel;
  const ext = path.posix.extname(rel);
  const base = rel.slice(0, rel.length - ext.length);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!existsSync(resolveInRoot(candidate)!)) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

/** Datos de un archivo de la carpeta (para el visor), o null si ya no existe. */
export function localFileInfo(rel: string): { name: string; size: number; contentType: string | null } | null {
  const abs = resolveInRoot(rel);
  if (!abs || !existsSync(abs)) return null;
  const st = statSync(abs);
  if (!st.isFile()) return null;
  return { name: path.basename(abs), size: st.size, contentType: LOCAL_TYPES[path.extname(abs).toLowerCase()]?.split(";")[0] ?? null };
}
