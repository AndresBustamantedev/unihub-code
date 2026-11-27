import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanvasClient } from "@/integrations/canvas/server";
import type { CanvasFile } from "@/integrations/canvas/types";
import { readCanvasConfig } from "@/integrations/canvas/config";
import type { Database } from "@/lib/supabase/database.types";
import { viewerKind, type ViewerKind } from "./file-kind";
import type { FileEntry } from "./neighbors";

type DB = SupabaseClient<Database>;

export interface ModuleFile {
  id: string;
  course_id: string;
  title: string;
  content_id: number;
  html_url: string | null;
  /** Programa de escritorio: copia en la carpeta de UniHub (ruta relativa). */
  local_path: string | null;
}

/** Un elemento de módulo de tipo archivo del usuario (RLS) con su id de Canvas. */
export async function getModuleFile(db: DB, itemId: string): Promise<ModuleFile | null> {
  const { data } = await db
    .from("course_module_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!data || data.item_type !== "File" || !data.content_id) return null;
  return { id: data.id, course_id: data.course_id, title: data.title, content_id: Number(data.content_id), html_url: data.html_url, local_path: data.local_path ?? null };
}

export interface FileInfo {
  name: string;
  contentType: string | null;
  size: number | null;
  kind: ViewerKind;
  /** URL de descarga de Canvas (con verificador). Nunca lleva el token. */
  url: string | null;
  locked: boolean;
}

/** Metadatos del archivo en Canvas (GET /api/v1/files/:id). */
export async function fetchFileInfo(contentId: number): Promise<FileInfo> {
  const { client } = getCanvasClient();
  const { data } = await client.get<CanvasFile & { url?: string; locked?: boolean }>(`files/${contentId}`);
  const name = data.display_name ?? data.filename ?? `archivo-${contentId}`;
  const contentType = data["content-type"] ?? null;
  return {
    name,
    contentType,
    size: data.size ?? null,
    kind: viewerKind(contentType, name),
    url: typeof data.url === "string" && data.url ? data.url : null,
    locked: !!data.locked_for_user || !!data.locked,
  };
}

/**
 * Descarga el contenido desde Canvas. Solo se aceptan URL del propio Canvas (evita SSRF);
 * el token solo se envía a Canvas y nunca al almacenamiento al que redirige.
 */
export async function fetchFileBody(url: string, range?: string | null): Promise<Response> {
  const cfg = readCanvasConfig();
  if (!cfg.ok) throw new Error("canvas_not_configured");
  const origin = new URL(cfg.baseUrl).origin;
  const first = new URL(url, origin);
  if (first.origin !== origin) throw new Error("unexpected_origin");
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token}` };
  if (range) headers.Range = range;
  let res = await fetch(first, { headers, redirect: "manual" });
  for (let hop = 0; hop < 5 && res.status >= 300 && res.status < 400; hop++) {
    const loc = res.headers.get("location");
    if (!loc) break;
    const next = new URL(loc, first);
    if (next.protocol !== "https:") throw new Error("insecure_redirect");
    // Fuera de Canvas: sin token (la URL firmada basta).
    const h: Record<string, string> = next.origin === origin ? { ...headers } : {};
    if (range) h.Range = range;
    res = await fetch(next, { headers: h, redirect: "manual" });
  }
  return res;
}

/** Archivos de la asignatura (para "anterior / siguiente") y el nombre del tema del actual. */
export async function getFileSiblings(db: DB, courseId: string): Promise<{ files: FileEntry[]; moduleNames: Map<string, string> }> {
  const [{ data: modules }, { data: items }] = await Promise.all([
    db.from("course_modules").select("id, name, position").eq("course_id", courseId).is("missing_since", null),
    db.from("course_module_items").select("id, title, module_id, position, content_id").eq("course_id", courseId).eq("item_type", "File").is("missing_since", null),
  ]);
  const modPos = new Map((modules ?? []).map((m) => [m.id, m.position ?? 0]));
  const files = (items ?? [])
    .filter((i) => i.content_id && modPos.has(i.module_id))
    .map((i) => ({ id: i.id, title: i.title, module_id: i.module_id, modulePosition: modPos.get(i.module_id) ?? 0, position: i.position ?? 0 }));
  return { files, moduleNames: new Map((modules ?? []).map((m) => [m.id, m.name])) };
}
