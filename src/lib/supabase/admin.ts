import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import { getOptionalServerEnv } from "@/lib/env/server";
import type { Database } from "./database.types";

/**
 * Cliente con la clave secreta: ignora RLS. SOLO para el cron (no hay sesión de usuario).
 * Todo código que lo use debe filtrar por user_id explícitamente.
 */
export function createSupabaseAdminClient() {
  const key = getOptionalServerEnv().SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
