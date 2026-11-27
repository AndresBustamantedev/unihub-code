import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/features/reminders/run";
import { runScheduledSync } from "@/features/sync/scheduled";
import { runMissingClassReminders } from "@/features/reminders/missing-classes";
import { getOptionalServerEnv, isEmailAllowed } from "@/lib/env/server";
import { logger } from "@/lib/redact";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
function authorized(req: NextRequest, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Sincronización programada (Vercel Cron, Supabase pg_cron o cualquier scheduler).
 * Requiere `Authorization: Bearer $CRON_SECRET`. Idempotente y seguro ante ejecuciones solapadas:
 * sync_runs bloquea duplicados y notifications deduplica avisos.
 */
async function handle(req: NextRequest) {
  const env = getOptionalServerEnv();
  if (!env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503, headers: NO_STORE });
  if (!authorized(req, env.CRON_SECRET)) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const db = createSupabaseAdminClient();
  if (!db) return NextResponse.json({ error: "missing_supabase_secret_key" }, { status: 503, headers: NO_STORE });

  const { data: usersPage, error } = await db.auth.admin.listUsers({ perPage: 100 });
  if (error) {
    logger.error("cron_list_users_failed", { status: error.status ?? null });
    return NextResponse.json({ error: "list_users_failed" }, { status: 500, headers: NO_STORE });
  }

  const results: Record<string, unknown>[] = [];
  for (const user of usersPage.users.filter((u) => isEmailAllowed(u.email))) {
    const started = Date.now();
    try {
      const synced = await runScheduledSync(db, user.id);
      const reminders = await runReminders(db, user.id);
      const missingClasses = await runMissingClassReminders(db, user.id);
      results.push({ ...synced, reminders, missingClasses, ms: Date.now() - started });
    } catch (err) {
      logger.error("cron_user_failed", { error: err instanceof Error ? err.name : "unknown" });
      results.push({ error: "internal", ms: Date.now() - started });
    }
  }
  // Mantenimiento: el registro técnico de sincronizaciones solo se guarda 30 días. Los datos del usuario no se tocan.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: pruned } = await db.from("sync_runs").delete({ count: "exact" }).lt("started_at", cutoff).neq("status", "running");
  logger.info("cron_sync_done", { users: results.length, results, prunedSyncRuns: pruned ?? 0 });
  return NextResponse.json({ ok: true, users: results.length, results }, { headers: NO_STORE });
}

export const GET = handle;
export const POST = handle;
