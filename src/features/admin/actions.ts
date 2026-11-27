"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createRemoteSupabaseClient } from "@/lib/supabase/server";

/** Solo administradores (Supabase lo comprueba): activar o desactivar la copia en la web de una cuenta. */
export async function setCloudAccessAction(target: string, enable: boolean): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  if (!/^[0-9a-f-]{36}$/i.test(target)) return { ok: false, error: "Usuario no válido." };
  const remote = await createRemoteSupabaseClient();
  const { error } = await remote.rpc("admin_set_cloud_access", { target, enable: !!enable });
  if (error) return { ok: false, error: error.code === "42501" ? "Solo un administrador puede hacerlo." : "No se pudo guardar el cambio." };
  revalidatePath("/ajustes");
  return { ok: true };
}

/** Solo administradores: prueba gratuita de IA de una cuenta (activar y límite propio en $/mes). */
export async function setTrialAccessAction(target: string, enable: boolean, limitUsd: number | null): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  if (!/^[0-9a-f-]{36}$/i.test(target)) return { ok: false, error: "Usuario no válido." };
  if (limitUsd !== null && (!Number.isFinite(limitUsd) || limitUsd < 0 || limitUsd > 1000)) return { ok: false, error: "Límite no válido." };
  const remote = await createRemoteSupabaseClient();
  const { error } = await remote.rpc("admin_set_trial_access", { target, enable: !!enable, limit_usd: limitUsd });
  if (error) return { ok: false, error: error.code === "42501" ? "Solo un administrador puede hacerlo." : "No se pudo guardar el cambio." };
  revalidatePath("/ajustes");
  return { ok: true };
}
