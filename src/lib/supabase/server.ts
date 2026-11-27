import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env/public";
import { isDesktop } from "@/lib/desktop";
import { isLocalOnly } from "@/lib/local-only";
import { createOfflineClient } from "./offline";

function createRemoteClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  // Programa compilado sin Supabase: usuario local fijo y sin nube.
  if (isLocalOnly()) return createOfflineClient();
  const env = getPublicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el proxy ya refresca la sesión.
        }
      },
    },
  });
}

/**
 * Cliente para las páginas y acciones del servidor.
 * - Web: Supabase para todo (sesión y datos).
 * - Programa de escritorio: Supabase SOLO para la sesión; las consultas de datos
 *   (`from`, `rpc`) van a la base de datos local de esa cuenta.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const remote = createRemoteClient(cookieStore);
  if (!isDesktop()) return remote;
  const { withLocalData } = await import("@/lib/local-db/client");
  return withLocalData(remote);
}

/** Cliente de Supabase real aunque se esté en el escritorio (p. ej. para importar datos de la web). */
export async function createRemoteSupabaseClient() {
  return createRemoteClient(await cookies());
}
