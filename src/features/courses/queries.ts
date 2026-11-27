import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseRow, Database, SyncRunRow } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;

export type QueryResult<T> = { ok: true; data: T } | { ok: false };

export async function listCourses(supabase: DB, opts: { followedOnly?: boolean } = {}): Promise<QueryResult<CourseRow[]>> {
  let q = supabase.from("courses").select("*").order("name", { ascending: true });
  if (opts.followedOnly) q = q.eq("followed", true);
  const { data, error } = await q;
  return error ? { ok: false } : { ok: true, data: data ?? [] };
}

export interface SyncState {
  latest: SyncRunRow | null;
  lastSuccess: SyncRunRow | null;
}

export async function getCoursesSyncState(supabase: DB): Promise<QueryResult<SyncState>> {
  const base = () =>
    supabase.from("sync_runs").select("*").eq("provider", "canvas").eq("resource", "courses").order("started_at", { ascending: false }).limit(1);
  const [latest, success] = await Promise.all([base().maybeSingle(), base().eq("status", "success").maybeSingle()]);
  if (latest.error || success.error) return { ok: false };
  return { ok: true, data: { latest: latest.data, lastSuccess: success.data } };
}
