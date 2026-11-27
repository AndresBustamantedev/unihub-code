import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { htmlToText } from "@/lib/html";
import type { Database } from "@/lib/supabase/database.types";
import { fetchFileBody, fetchFileInfo, type ModuleFile } from "./files";
import { viewerKind } from "./file-kind";
import { readFileSync } from "node:fs";
import { isDesktop } from "@/lib/desktop";
import { localFileInfo, resolveInRoot } from "@/lib/local-files";

type DB = SupabaseClient<Database>;

/** Por encima de esto no se intenta extraer (un PDF escaneado grande no aporta texto). */
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_CHARS = 400_000;

/** `permanent`: no tiene sentido reintentarlo (escaneado, formato que no se lee, bloqueado…). */
export type MaterialText = { ok: true; text: string; pages: number } | { ok: false; reason: string; permanent?: boolean };

const UNREADABLE = "No se puede leer el texto de este documento (escaneado, bloqueado o en un formato que la IA no lee).";

/** Texto con marcas "[Página N]" para que la IA pueda citar páginas. */
export function joinPages(pages: string[]): string {
  return pages
    .map((t, i) => `[Página ${i + 1}]\n${t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()}`)
    .join("\n\n")
    .slice(0, MAX_CHARS);
}

/** Programa de escritorio: si el archivo está en la carpeta de UniHub, se lee de ahí (sin Canvas). */
function readLocal(item: ModuleFile): { buf: Uint8Array; kind: ReturnType<typeof viewerKind> } | null {
  if (!isDesktop() || !item.local_path) return null;
  const info = localFileInfo(item.local_path);
  const abs = resolveInRoot(item.local_path);
  if (!info || !abs || info.size > MAX_BYTES) return null;
  return { buf: new Uint8Array(readFileSync(abs)), kind: viewerKind(info.contentType, info.name) };
}

async function fromBuffer(buf: Uint8Array, kind: ReturnType<typeof viewerKind>): Promise<MaterialText> {
  if (!["pdf", "text", "html"].includes(kind)) return { ok: false, reason: "La IA solo puede leer PDF, texto y HTML.", permanent: true };
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const joined = joinPages(text);
    if (joined.replace(/\[Página \d+\]/g, "").trim().length < 50) return { ok: false, reason: "El PDF no tiene texto (parece escaneado).", permanent: true };
    return { ok: true, text: joined, pages: totalPages };
  }
  const raw = new TextDecoder().decode(buf);
  const text = (kind === "html" ? (htmlToText(raw, MAX_CHARS) ?? "") : raw).slice(0, MAX_CHARS);
  return { ok: true, text, pages: 1 };
}

async function extract(item: ModuleFile): Promise<MaterialText> {
  const local = readLocal(item);
  if (local) return fromBuffer(local.buf, local.kind);
  const info = await fetchFileInfo(item.content_id);
  if (info.locked || !info.url) return { ok: false, reason: "Canvas tiene este archivo bloqueado.", permanent: true };
  if (info.size && info.size > MAX_BYTES) return { ok: false, reason: "El archivo es demasiado grande para leerlo.", permanent: true };
  if (!["pdf", "text", "html"].includes(info.kind)) return { ok: false, reason: "La IA solo puede leer PDF, texto y HTML.", permanent: true };
  const res = await fetchFileBody(info.url);
  if (!res.ok) return { ok: false, reason: `Canvas respondió ${res.status}.` };
  return fromBuffer(new Uint8Array(await res.arrayBuffer()), info.kind);
}

/**
 * Texto del material: se extrae una vez y se guarda solo el texto (no el archivo). Si no se puede
 * leer por algo que no va a cambiar (escaneado, formato…), se apunta con texto vacío y 0 páginas
 * para no volver a intentarlo cada vez (p. ej. al preparar la búsqueda).
 */
export async function getMaterialText(db: DB, userId: string, item: ModuleFile, opts: { retryUnreadable?: boolean } = {}): Promise<MaterialText> {
  const { data } = await db.from("material_texts").select("content_text, pages").eq("module_item_id", item.id).maybeSingle();
  if (data && (data.pages > 0 || data.content_text)) return { ok: true, text: data.content_text, pages: data.pages };
  if (data && !opts.retryUnreadable) return { ok: false, reason: UNREADABLE, permanent: true };
  const r = await extract(item);
  if (r.ok || r.permanent) {
    await db
      .from("material_texts")
      .upsert(
        { user_id: userId, module_item_id: item.id, content_text: r.ok ? r.text : "", pages: r.ok ? r.pages : 0 },
        { onConflict: "user_id,module_item_id" },
      );
  }
  return r;
}

/**
 * Lee el texto del material que aún no se ha leído (para poder buscar en él). En el programa,
 * solo los archivos ya descargados en la carpeta (rápido y sin Canvas); en la web, desde Canvas.
 */
export async function readPendingMaterialTexts(
  db: DB,
  userId: string,
  opts: { courseId?: string | null; localOnly?: boolean; limit?: number; budgetMs?: number } = {},
): Promise<{ done: number; failed: number; left: number }> {
  const started = Date.now();
  let courseIds: string[];
  if (opts.courseId) courseIds = [opts.courseId];
  else {
    const { data } = await db.from("courses").select("id").eq("followed", true);
    courseIds = (data ?? []).map((c) => c.id);
  }
  if (!courseIds.length) return { done: 0, failed: 0, left: 0 };
  let q = db.from("course_module_items").select("id, course_id, title, content_id, html_url, local_path").eq("item_type", "File").in("course_id", courseIds);
  if (opts.localOnly) q = q.not("local_path", "is", null);
  const { data: items } = await q;
  const files = (items ?? []).filter((i) => i.content_id);
  if (!files.length) return { done: 0, failed: 0, left: 0 };
  const { data: known } = await db.from("material_texts").select("module_item_id").in("module_item_id", files.map((f) => f.id));
  const have = new Set((known ?? []).map((k) => k.module_item_id));
  const todo = files.filter((f) => !have.has(f.id));
  let done = 0;
  let failed = 0;
  const limit = opts.limit ?? 5;
  for (const f of todo.slice(0, limit)) {
    if (Date.now() - started > (opts.budgetMs ?? 25_000)) break;
    try {
      const r = await getMaterialText(db, userId, { ...f, content_id: Number(f.content_id), local_path: f.local_path ?? null });
      if (r.ok) done++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { done, failed, left: Math.max(0, todo.length - done - failed) };
}
