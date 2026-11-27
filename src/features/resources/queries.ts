import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassResourceRow, Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

/** Recursos de una clase, o de toda la asignatura (los de cada clase incluidos) si no se indica clase. */
export async function listResources(db: DB, opts: { courseId: string; sessionId?: string; itemId?: string }): Promise<ClassResourceRow[]> {
  let q = db.from("class_resources").select("*").eq("course_id", opts.courseId).order("created_at", { ascending: false }).limit(200);
  if (opts.sessionId) q = q.eq("session_id", opts.sessionId);
  if (opts.itemId) q = q.eq("module_item_id", opts.itemId);
  const { data } = await q;
  return data ?? [];
}

/** Número de recursos por clase (para la lista de clases). */
export async function countResourcesBySession(db: DB, sessionIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sessionIds.length === 0) return out;
  const { data } = await db.from("class_resources").select("session_id").in("session_id", sessionIds);
  for (const r of data ?? []) if (r.session_id) out.set(r.session_id, (out.get(r.session_id) ?? 0) + 1);
  return out;
}
