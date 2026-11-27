import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { runScheduledSync } from "@/features/sync/scheduled";
import { downloadPendingMaterials } from "@/features/desktop/materials-download";
import { readPendingMaterialTexts } from "@/features/materials/text";
import { syncSearchIndex } from "@/features/search/indexer";
import { getCanvasTokenStatus } from "@/features/canvas-token/status";
import { requireUser } from "@/lib/auth/guard";
import { desktopAuthorized } from "@/lib/desktop";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Sincronización periódica del programa de escritorio (cada 20 min, desde el proceso principal).
 * Usa la sesión del usuario (RLS) y el token de Canvas guardado en ese ordenador: no necesita
 * la clave de servicio de Supabase.
 */
export async function POST(req: NextRequest) {
  if (!desktopAuthorized(req.headers.get("x-unihub-desktop"))) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401, headers: NO_STORE });
  const started = Date.now();
  try {
    const db = await createSupabaseServerClient();
    // Primero el token: si ha caducado, el programa lo avisa (y no tiene sentido descargar nada).
    const canvasToken = await getCanvasTokenStatus({ fresh: true });
    if (canvasToken?.state === "expired") {
      revalidatePath("/");
      return NextResponse.json({ ok: false, canvasToken, ms: Date.now() - started }, { headers: NO_STORE });
    }
    const result = await runScheduledSync(db, auth.user.id);
    // Lo nuevo del material de Canvas se guarda en la carpeta de UniHub (poco a poco).
    const files = await downloadPendingMaterials(db, { limit: 25 });
    // Búsqueda: texto del material ya descargado (sin Canvas) e índice al día. Si falla, la
    // sincronización sigue valiendo: se reintenta en la próxima.
    let search: { texts: number; indexed: number } | null = null;
    try {
      const texts = await readPendingMaterialTexts(db, auth.user.id, { localOnly: true, limit: 40, budgetMs: 60_000 });
      const idx = await syncSearchIndex(db, auth.user.id, { budgetMs: 45_000 });
      search = { texts: texts.done, indexed: idx.indexed };
    } catch (err) {
      logger.warn("search_index_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
    }
    for (const p of ["/", "/asignaturas", "/tareas", "/novedades", "/clases"]) revalidatePath(p);
    return NextResponse.json({ ok: true, ...result, files, search, canvasToken, ms: Date.now() - started }, { headers: NO_STORE });
  } catch (err) {
    logger.error("desktop_sync_failed", { error: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "internal" }, { status: 500, headers: NO_STORE });
  }
}
