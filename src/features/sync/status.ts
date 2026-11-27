import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SyncRunRow } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;
const RESOURCES = ["courses", "content", "materials", "inbox"] as const;

export interface SyncOverview {
  /** La más antigua de las últimas sincronizaciones correctas de cada recurso (garantía de frescura). */
  lastSuccessAt: string | null;
  running: boolean;
  /** Fallo más reciente entre los recursos cuya última ejecución falló. */
  failure: SyncRunRow | null;
  neverSucceeded: boolean;
}

export async function getSyncOverview(supabase: DB): Promise<SyncOverview | null> {
  // Una sola consulta con las ejecuciones recientes; solo si algún recurso no tiene ahí
  // ninguna correcta (muchos fallos seguidos) se busca su última correcta aparte.
  const recent = await supabase
    .from("sync_runs")
    .select("*")
    .eq("provider", "canvas")
    .in("resource", [...RESOURCES])
    .order("started_at", { ascending: false })
    .limit(200);
  if (recent.error) return null;
  const rows = recent.data ?? [];
  const perResource = await Promise.all(
    RESOURCES.map(async (resource) => {
      const mine = rows.filter((r) => r.resource === resource);
      const latestRow = mine[0] ?? null;
      let okRow = mine.find((r) => r.status === "success") ?? null;
      let error = null;
      if (latestRow && !okRow) {
        const res = await supabase
          .from("sync_runs")
          .select("*")
          .eq("provider", "canvas")
          .eq("resource", resource)
          .eq("status", "success")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        okRow = res.data;
        error = res.error;
      }
      return { latest: { data: latestRow, error: null }, ok: { data: okRow, error } };
    }),
  );
  if (perResource.some((r) => r.latest.error || r.ok.error)) return null;

  const latest = perResource.map((r) => r.latest.data as SyncRunRow | null);
  // Recursos que nunca se han ejecutado (p. ej. materiales antes de la FASE 5) no cuentan para la frescura.
  const successes = perResource
    .filter((r) => r.latest.data)
    .map((r) => (r.ok.data as SyncRunRow | null)?.finished_at ?? null);
  const failures = latest.filter((r): r is SyncRunRow => r?.status === "error").sort((a, b) => b.started_at.localeCompare(a.started_at));

  return {
    lastSuccessAt: successes.length > 0 && successes.every(Boolean) ? (successes as string[]).sort()[0]! : successes.filter(Boolean).sort()[0] ?? null,
    running: latest.some((r) => r?.status === "running"),
    failure: failures[0] ?? null,
    neverSucceeded: successes.every((s) => !s),
  };
}
