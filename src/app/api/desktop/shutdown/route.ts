import { NextResponse, type NextRequest } from "next/server";
import { closeAllLocalDbs } from "@/lib/local-db/pg";
import { desktopAuthorized } from "@/lib/desktop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cierre ordenado: el programa lo pide justo antes de salir para que la base de datos local
 * guarde su estado (si se corta de golpe, Postgres puede quedar a medias). Solo con el secreto
 * del arranque; no hace falta sesión (también se cierra estando desconectado).
 */
export async function POST(req: NextRequest) {
  if (!desktopAuthorized(req.headers.get("x-unihub-desktop"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const closed = await closeAllLocalDbs();
  return NextResponse.json({ ok: true, closed }, { headers: { "Cache-Control": "no-store" } });
}
