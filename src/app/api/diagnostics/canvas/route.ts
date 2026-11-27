import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { runCanvasDiagnostics } from "@/integrations/canvas";
import { logger } from "@/lib/redact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const COOLDOWN_MS = 5_000;
let lastRunAt = 0;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    const status = auth.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: auth.reason }, { status, headers: NO_STORE });
  }

  // Evita martillear Canvas si se pulsa el botón repetidamente.
  const now = Date.now();
  if (now - lastRunAt < COOLDOWN_MS) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "5" } });
  }
  lastRunAt = now;

  try {
    const report = await runCanvasDiagnostics();
    logger.info("canvas_diagnostics", {
      overall: report.overall,
      checks: report.checks.map((c) => `${c.id}:${c.status}${c.httpStatus ? `:${c.httpStatus}` : ""}`),
    });
    return NextResponse.json(report, { headers: NO_STORE });
  } catch (err) {
    logger.error("canvas_diagnostics_crash", { error: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "internal_error" }, { status: 500, headers: NO_STORE });
  }
}
