import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { inlineHeaders, viewerKind } from "@/features/materials/file-kind";
import { requireUser } from "@/lib/auth/guard";
import { isDesktop } from "@/lib/desktop";
import { resolveInRoot } from "@/lib/local-files";
import { LOCAL_TYPES as TYPES } from "@/lib/local-files-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Programa de escritorio: sirve un archivo de la carpeta de UniHub (material descargado, vídeos de
 * clase). Solo rutas dentro de esa carpeta. Admite Range para poder avanzar en los vídeos.
 */
export async function GET(req: NextRequest) {
  if (!isDesktop()) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401, headers: NO_STORE });
  const abs = resolveInRoot(req.nextUrl.searchParams.get("ruta") ?? "");
  if (!abs) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  let size: number;
  try {
    const st = statSync(abs);
    if (!st.isFile()) throw new Error("no_file");
    size = st.size;
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const name = path.basename(abs);
  const ext = path.extname(abs).toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  const download = req.nextUrl.searchParams.get("descargar") === "1" || !TYPES[ext];
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    ...inlineHeaders(download ? "none" : viewerKind(type, name)),
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && size > 0) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
