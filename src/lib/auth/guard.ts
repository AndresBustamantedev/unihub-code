import "server-only";
import { cache } from "react";
import { isEmailAllowed } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

/**
 * Autorización real (no solo el proxy): verifica la firma del JWT con getClaims()
 * (en local si el proyecto usa claves asimétricas; si no, consulta a Supabase Auth)
 * y exige que el correo esté en ALLOWED_EMAILS.
 * `cache` evita repetir la verificación varias veces en la misma petición.
 */
export const requireUser = cache(async (): Promise<AuthResult> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { ok: false, reason: "unauthenticated" };
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isEmailAllowed(email)) return { ok: false, reason: "forbidden" };
  return { ok: true, user: { id: claims.sub, email } };
});
