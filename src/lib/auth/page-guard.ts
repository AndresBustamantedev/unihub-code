import "server-only";
import { redirect } from "next/navigation";
import type { AuthUser } from "./guard";
import { requireUser } from "./guard";
import { registerCourseHues } from "@/lib/course-color";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Para páginas. Sin sesión → /login. Con sesión pero correo no autorizado → /acceso-denegado
 * (nunca de vuelta a /login, para que no pueda haber un bucle de redirecciones).
 */
export async function requirePageUser(path: string): Promise<AuthUser> {
  // Los colores de asignatura se piden a la vez que se verifica la sesión (sin sesión, RLS devuelve vacío).
  const supabase = await createSupabaseServerClient();
  const [auth, hues] = await Promise.all([requireUser(), supabase.from("courses").select("id, color_hue").not("color_hue", "is", null)]);
  if (!auth.ok) {
    if (auth.reason === "forbidden") redirect("/acceso-denegado");
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  registerCourseHues(hues.data ?? []);
  return auth.user;
}
