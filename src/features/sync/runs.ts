import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { logger } from "@/lib/redact";

type DB = SupabaseClient<Database>;
const STALE_RUN_MS = 10 * 60 * 1000;

export type StartRunResult = { ok: true; id: string } | { ok: false; reason: "already_running" | "db" };

/** Abre una ejecución. Solo puede haber una "running" por (usuario, proveedor, recurso). */
export async function startRun(supabase: DB, userId: string, provider: string, resource: string): Promise<StartRunResult> {
  const now = Date.now();
  await supabase
    .from("sync_runs")
    .update({ status: "error", finished_at: new Date(now).toISOString(), error_code: "stale", error_message: "Ejecución abandonada" })
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("resource", resource)
    .eq("status", "running")
    .lt("started_at", new Date(now - STALE_RUN_MS).toISOString());

  const { data, error } = await supabase
    .from("sync_runs")
    .insert({ user_id: userId, provider, resource, status: "running" })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, reason: "already_running" };
    logger.error("sync_run_insert_failed", { resource, code: error?.code ?? null });
    return { ok: false, reason: "db" };
  }
  return { ok: true, id: data.id };
}

export async function finishRun(
  supabase: DB,
  runId: string,
  outcome: { status: "success"; stats: Json } | { status: "error"; code: string; message: string; stats?: Json },
): Promise<void> {
  await supabase
    .from("sync_runs")
    .update(
      outcome.status === "success"
        ? { status: "success", finished_at: new Date().toISOString(), stats: outcome.stats }
        : { status: "error", finished_at: new Date().toISOString(), error_code: outcome.code, error_message: outcome.message, stats: outcome.stats ?? null },
    )
    .eq("id", runId);
}
