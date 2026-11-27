import { NextResponse, type NextRequest } from "next/server";
import { backupLocalDb } from "@/features/desktop/backup";
import { describeResult, exportLocalToWeb, readCloudState, writeCloudState, type LooseDb } from "@/features/desktop/cloud-export";
import { createRemoteSupabaseClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/guard";
import { desktopAuthorized } from "@/lib/desktop";
import { logger } from "@/lib/redact";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Copia diaria de la base de datos local (la pide el programa una vez al día) y, si se activó
 * en Ajustes, subida a la web. La subida automática nunca borra en bloque: si hiciera falta
 * confirmación, se apunta el aviso y se espera a que lo haga el usuario con el botón.
 */
export async function POST(req: NextRequest) {
  if (!desktopAuthorized(req.headers.get("x-unihub-desktop"))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401, headers: NO_STORE });
  try {
    const r = await backupLocalDb(auth.user.id, auth.user.email);
    let cloud: string | null = null;
    const state = readCloudState(auth.user.id);
    if (state.daily && (!state.lastAt || Date.now() - new Date(state.lastAt).getTime() > 20 * 3_600_000)) {
      try {
        const res = await exportLocalToWeb({
          uid: auth.user.id,
          local: (await createSupabaseServerClient()) as unknown as LooseDb,
          remote: (await createRemoteSupabaseClient()) as unknown as LooseDb,
        });
        cloud = describeResult(res);
        writeCloudState(auth.user.id, { lastAt: new Date().toISOString(), lastOk: res.ok, lastResult: cloud });
      } catch (err) {
        cloud = "No se pudo subir a la web.";
        writeCloudState(auth.user.id, { lastAt: new Date().toISOString(), lastOk: false, lastResult: cloud });
        logger.error("cloud_export_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
      }
    }
    return NextResponse.json({ ok: true, ...r, cloud }, { headers: NO_STORE });
  } catch (err) {
    logger.error("desktop_backup_failed", { error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
    return NextResponse.json({ error: "backup_failed" }, { status: 500, headers: NO_STORE });
  }
}
