import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFileBody, fetchFileInfo } from "@/features/materials/files";
import { CanvasApiError } from "@/integrations/canvas/errors";
import { relPath, resolveInRoot, uniqueRel, writeStreamFile } from "@/lib/local-files";
import { logger } from "@/lib/redact";
import type { Database } from "@/lib/supabase/database.types";
import { existsSync } from "node:fs";
import { mirrorEnabled, moduleDirFor } from "./mirror";

type DB = SupabaseClient<Database>;

/** Archivos más grandes no se descargan solos (se pueden abrir desde Canvas). */
const MAX_FILE_BYTES = 300 * 1024 * 1024;

export interface DownloadResult {
  downloaded: number;
  skipped: number;
  failed: number;
  pending: number;
}

/**
 * Descarga a la carpeta de UniHub los archivos de los módulos de las asignaturas seguidas que aún
 * no están guardados. Se hace poco a poco (`limit` por llamada) para no bloquear la sincronización;
 * lo que falte se baja en la siguiente.
 */
export async function downloadPendingMaterials(db: DB, opts: { limit?: number } = {}): Promise<DownloadResult> {
  const result: DownloadResult = { downloaded: 0, skipped: 0, failed: 0, pending: 0 };
  if (!mirrorEnabled()) return result;
  const limit = opts.limit ?? 25;

  const { data: courses } = await db.from("courses").select("id, name").eq("followed", true);
  if (!courses?.length) return result;
  const byId = new Map(courses.map((c) => [c.id, c]));
  const { data: items } = await db
    .from("course_module_items")
    .select("id, course_id, module_id, title, content_id, local_path")
    .in("course_id", [...byId.keys()])
    .eq("item_type", "File")
    .is("missing_since", null)
    .order("position", { ascending: true, nullsFirst: false });

  // Si el archivo se borró a mano de la carpeta, se vuelve a descargar.
  const todo = (items ?? []).filter((i) => i.content_id && (!i.local_path || !existsSync(resolveInRoot(i.local_path) ?? "")));
  result.pending = Math.max(0, todo.length - limit);

  for (const item of todo.slice(0, limit)) {
    const course = byId.get(item.course_id)!;
    try {
      const info = await fetchFileInfo(Number(item.content_id));
      if (info.locked || !info.url || (info.size ?? 0) > MAX_FILE_BYTES) {
        result.skipped++;
        continue;
      }
      const res = await fetchFileBody(info.url);
      if (!res.ok || !res.body) {
        result.failed++;
        continue;
      }
      const dir = await moduleDirFor(db, item.course_id, item.module_id, course);
      const rel = uniqueRel(`${dir}/${relPath(info.name)}`);
      await writeStreamFile(rel, res.body);
      await db.from("course_module_items").update({ local_path: rel }).eq("id", item.id);
      result.downloaded++;
    } catch (err) {
      result.failed++;
      logger.warn("material_download_failed", { kind: err instanceof CanvasApiError ? err.kind : err instanceof Error ? err.name : "unknown" });
    }
  }
  return result;
}
