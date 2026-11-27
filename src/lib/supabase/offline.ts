import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { localUser } from "@/lib/local-only";

const NO_CLOUD = { message: "Este programa funciona sin cuenta: no hay conexión con Supabase.", code: "UNIHUB_LOCAL_ONLY", details: null, hint: null };
const failed = { data: null, error: NO_CLOUD, count: null, status: 503, statusText: "Local only" };

/** Consulta encadenable que siempre termina en error (no hay base de datos en la nube). */
function failingQuery(): unknown {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(failed).then(resolve);
        return () => proxy;
      },
    },
  );
  return proxy;
}

/**
 * Sustituto del cliente de Supabase en el modo solo local: la «sesión» es siempre el usuario
 * local y cualquier acceso a la nube devuelve un error claro.
 */
export function createOfflineClient(): SupabaseClient<Database> {
  const user = localUser();
  const claims = { sub: user.id, email: user.email, role: "authenticated" };
  const auth = {
    getClaims: async () => ({ data: { claims, header: {}, signature: new Uint8Array() }, error: null }),
    getUser: async () => ({ data: { user: { id: user.id, email: user.email } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: NO_CLOUD }),
    updateUser: async () => ({ data: { user: null }, error: NO_CLOUD }),
    exchangeCodeForSession: async () => ({ data: { user: null, session: null }, error: NO_CLOUD }),
    verifyOtp: async () => ({ data: { user: null, session: null }, error: NO_CLOUD }),
  };
  return { auth, from: () => failingQuery(), rpc: async () => failed } as unknown as SupabaseClient<Database>;
}
