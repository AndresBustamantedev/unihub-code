import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CanvasApiError } from "@/integrations/canvas/errors";
import { inlineHeaders } from "@/features/materials/file-kind";
import { fetchFileBody, fetchFileInfo, getModuleFile } from "@/features/materials/files";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Sirve un archivo de Canvas a través de UniHub (para verlo dentro de la app o descargarlo).
 * `?descargar=1` fuerza la descarga. Admite Range para poder avanzar en vídeos.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "unauthenticated" ? 401 : 403, headers: NO_STORE });
  if (!z.uuid().safeParse(itemId).success) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const db = await createSupabaseServerClient();
  const item = await getModuleFile(db, itemId);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  try {
    const info = await fetchFileInfo(item.content_id);
    if (info.locked || !info.url) return NextResponse.json({ error: "locked" }, { status: 403, headers: NO_STORE });
    const download = req.nextUrl.searchParams.get("descargar") === "1" || info.kind === "none" || info.kind === "office";
    const upstream = await fetchFileBody(info.url, req.headers.get("range"));
    if (!upstream.ok || !upstream.body) {
      logger.warn("material_upstream_failed", { status: upstream.status });
      return NextResponse.json({ error: "upstream" }, { status: 502, headers: NO_STORE });
    }
    const headers: Record<string, string> = {
      "Content-Type": info.contentType ?? upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", info.name),
      "Cache-Control": "private, max-age=600",
      ...inlineHeaders(download ? "none" : info.kind),
    };
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
  } catch (err) {
    if (err instanceof CanvasApiError) {
      logger.warn("material_info_failed", { kind: err.kind, status: err.status ?? null });
      const status = err.status === 401 || err.status === 403 ? 403 : err.status === 404 ? 404 : 502;
      return NextResponse.json({ error: err.kind }, { status, headers: NO_STORE });
    }
    logger.error("material_failed", { error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "internal" }, { status: 500, headers: NO_STORE });
  }
}
