import { NextResponse, type NextRequest } from "next/server";
import { desktopAlerts } from "@/features/notify/desktop-alerts";
import { requireUser } from "@/lib/auth/guard";
import { desktopAuthorized } from "@/lib/desktop";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/** Avisos para las notificaciones de Windows. `?desde=` = última comprobación (ISO). */
export async function GET(req: NextRequest) {
  if (!desktopAuthorized(req.headers.get("x-unihub-desktop"))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401, headers: NO_STORE });
  const raw = req.nextUrl.searchParams.get("desde");
  const parsed = raw ? new Date(raw) : null;
  // Por defecto (primera vez), solo lo de las últimas 24 h, para no avisar de todo el historial.
  const since = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(Date.now() - 86_400_000);
  const db = await createSupabaseServerClient();
  const alerts = await desktopAlerts(db, auth.user.id, since);
  return NextResponse.json({ alerts, checkedAt: new Date().toISOString() }, { headers: NO_STORE });
}
