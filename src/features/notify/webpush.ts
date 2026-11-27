import "server-only";
import { sendNotification, setVapidDetails, WebPushError } from "web-push";
import { getOptionalServerEnv } from "@/lib/env/server";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
}

export type PushOutcome = "ok" | "gone" | "error";

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const env = getOptionalServerEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return (configured = false);
  setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return (configured = true);
}

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
  if (!isPushConfigured()) return "error";
  try {
    await sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 3600, urgency: "high", topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
    );
    return "ok";
  } catch (err) {
    // 404/410: la suscripción ya no existe (el usuario la revocó o cambió de navegador).
    if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) return "gone";
    return "error";
  }
}
