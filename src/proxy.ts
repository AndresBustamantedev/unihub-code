import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isLocalOnly } from "@/lib/local-only";

// /api/cron se protege con CRON_SECRET (no hay sesión de usuario); /sw.js debe servirse sin login.
const PUBLIC_PATHS = ["/login", "/acceso-denegado", "/auth/callback", "/auth/error", "/api/cron", "/api/desktop/shutdown",
  "/api/ai/trial",
  "/en-uso", "/sw.js", "/manifest.webmanifest"];

/** Página de error clara si falta configuración (solo nombres de variables, nunca valores). */
function configError(): NextResponse | null {
  // Acceso directo (no process.env[k]): Next incrusta las NEXT_PUBLIC_* al compilar y el
  // programa de escritorio no las tiene en tiempo de ejecución.
  const present: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  const missing = Object.keys(present).filter((k) => !present[k]);
  if (missing.length === 0) return null;
  const body = `<!doctype html><meta charset="utf-8"><title>UniHub · falta configuración</title>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.3rem">Falta configuración en el servidor</h1>
<p>No están definidas estas variables: <code>${missing.join("</code>, <code>")}</code>.</p>
<p>Añádelas en Vercel → Settings → Environment Variables (entorno Production) y <strong>vuelve a desplegar</strong>: las variables <code>NEXT_PUBLIC_*</code> se incluyen al compilar.</p></body>`;
  return new NextResponse(body, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function proxy(request: NextRequest) {
  // Modo solo local (programa sin Supabase): no hay sesión que comprobar ni pantalla de acceso.
  if (isLocalOnly()) {
    const { pathname } = request.nextUrl;
    if (pathname === "/login" || pathname === "/acceso-denegado") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
  const misconfigured = configError();
  if (misconfigured) return misconfigured;
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
