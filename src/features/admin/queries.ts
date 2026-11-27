import "server-only";
import { trialLimitUsd, trialMonth } from "@/integrations/ai/trial";
import { createRemoteSupabaseClient } from "@/lib/supabase/server";

export interface AppUser {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
  isAdmin: boolean;
  cloudEnabled: boolean;
  /** Prueba gratuita de IA: activada, límite propio (null = el general) y gasto de este mes. */
  trialEnabled: boolean;
  trialLimit: number | null;
  trialUsed: number;
  trialRequests: number;
}

/** Permisos de la cuenta y, si es administradora, la lista de cuentas. Siempre contra Supabase. */
export async function loadCloudAccess(): Promise<{ isAdmin: boolean; enabled: boolean; users: AppUser[] | null; trialDefaultLimit?: number }> {
  const remote = await createRemoteSupabaseClient();
  const { data, error } = await remote.rpc("my_cloud_access");
  const me = !error && Array.isArray(data) ? data[0] : undefined;
  if (!me) return { isAdmin: false, enabled: false, users: null };
  if (!me.is_admin) return { isAdmin: false, enabled: !!me.cloud_enabled, users: null };
  const [{ data: list }, { data: trial }] = await Promise.all([remote.rpc("admin_list_users"), remote.rpc("admin_trial_usage", { m: trialMonth() })]);
  const t = new Map((trial ?? []).map((x) => [x.user_id, x]));
  return {
    isAdmin: true,
    enabled: !!me.cloud_enabled,
    trialDefaultLimit: trialLimitUsd(),
    users: (list ?? []).map((u) => {
      const x = t.get(u.id);
      return {
        id: u.id,
        email: u.email,
        lastSignInAt: u.last_sign_in_at,
        isAdmin: u.is_admin,
        cloudEnabled: u.cloud_enabled,
        trialEnabled: !!x?.enabled,
        trialLimit: x?.limit_usd == null ? null : Number(x.limit_usd),
        trialUsed: Number(x?.cost_usd ?? 0),
        trialRequests: Number(x?.requests ?? 0),
      };
    }),
  };
}
