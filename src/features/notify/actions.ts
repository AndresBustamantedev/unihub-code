"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deliverToUser } from "./deliver";
import { isPushConfigured } from "./webpush";

const subSchema = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscriptionAction(raw: unknown, userAgent: string): Promise<{ ok: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const parsed = subSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent.slice(0, 200),
      failure_count: 0,
    },
    { onConflict: "endpoint" },
  );
  revalidatePath("/ajustes");
  return { ok: !error };
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  revalidatePath("/ajustes");
  return { ok: !error };
}

export async function sendTestPushAction(): Promise<{ ok: boolean; message: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, message: "Sesión caducada." };
  if (!isPushConfigured()) return { ok: false, message: "Faltan las claves VAPID en el servidor." };
  const supabase = await createSupabaseServerClient();
  const r = await deliverToUser(supabase, auth.user.id, { title: "UniHub · prueba", body: "Las notificaciones funcionan en este dispositivo.", url: "/", tag: "test" });
  revalidatePath("/ajustes");
  if (r.devices === 0) return { ok: false, message: "No hay dispositivos suscritos." };
  return { ok: r.delivered > 0, message: `Enviada a ${r.delivered} de ${r.devices} dispositivo(s).` };
}
