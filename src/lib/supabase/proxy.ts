import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env/public";

/** Refresca la sesión de Supabase en cada petición y devuelve el usuario. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // getClaims refresca el token si ha caducado y verifica su firma (sin ida y vuelta a Auth
  // cuando el proyecto usa claves de firma asimétricas).
  const { data } = await supabase.auth.getClaims();
  return { response, user: data?.claims?.sub ? { id: data.claims.sub } : null };
}
