import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isPushConfigured, sendPush, type PushPayload } from "./webpush";

type DB = SupabaseClient<Database>;

/** Envía a todos los dispositivos del usuario. Borra las suscripciones caducadas. Devuelve cuántos recibieron. */
export async function deliverToUser(db: DB, userId: string, payload: PushPayload): Promise<{ delivered: number; devices: number }> {
  if (!isPushConfigured()) return { delivered: 0, devices: 0 };
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId);
  let delivered = 0;
  for (const s of subs ?? []) {
    const outcome = await sendPush(s, payload);
    if (outcome === "ok") {
      delivered++;
      await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
    } else if (outcome === "gone" || s.failure_count >= 9) {
      await db.from("push_subscriptions").delete().eq("id", s.id);
    } else {
      await db.from("push_subscriptions").update({ failure_count: s.failure_count + 1 }).eq("id", s.id);
    }
  }
  return { delivered, devices: subs?.length ?? 0 };
}
