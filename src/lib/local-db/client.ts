import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createLocalDataClient, type LocalResult } from "./builder";
import { redirect } from "next/navigation";
import { getLocalDb } from "./pg";

type DB = SupabaseClient<Database>;

const unauthenticated: LocalResult<null> = {
  data: null,
  error: { message: "Sin sesión", code: "PGRST301", details: null, hint: null },
  count: null,
  status: 401,
  statusText: "Unauthorized",
};

/** Cualquier consulta sin sesión devuelve un error (como haría RLS en Supabase). */
function deniedClient() {
  const q: Record<string, unknown> = {};
  const chain = () => proxy;
  const proxy: unknown = new Proxy(q, {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(unauthenticated).then(resolve);
      return chain;
    },
  });
  return { from: () => proxy, rpc: async () => unauthenticated };
}

/**
 * Devuelve el cliente de Supabase con `from` y `rpc` redirigidos a la base de datos local de la
 * cuenta con sesión. `auth` sigue siendo el de Supabase (inicio de sesión y verificación).
 */
export async function withLocalData(remote: DB): Promise<DB> {
  const { data } = await remote.auth.getClaims();
  const uid = data?.claims?.sub ?? null;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  let local: ReturnType<typeof createLocalDataClient> | ReturnType<typeof deniedClient>;
  try {
    local = uid ? createLocalDataClient(await getLocalDb(uid, email)) : deniedClient();
  } catch (err) {
    // Otro proceso tiene abierta la base de datos: pantalla que lo explica (por nombre y no con
    // instanceof: Next puede cargar este módulo en varios trozos, cada uno con su propia clase).
    if ((err as Error | null)?.name === "LocalDbLockedError") redirect("/en-uso");
    throw err;
  }
  return new Proxy(remote, {
    get(target, prop, receiver) {
      if (prop === "from") return local.from;
      if (prop === "rpc") return local.rpc;
      return Reflect.get(target, prop, receiver);
    },
  }) as DB;
}
