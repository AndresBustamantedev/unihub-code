"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deletePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/features/notify/actions";

type Status = "checking" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setStatus("unsupported");
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  if (!vapidPublicKey) return <p className="text-sm text-amber-600">El servidor no tiene claves VAPID configuradas (ver README).</p>;

  const enable = () =>
    start(async () => {
      setMessage(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
        const r = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
        if (!r.ok) {
          await sub.unsubscribe();
          return setMessage("No se pudo guardar la suscripción.");
        }
        setStatus("on");
        setMessage("Activadas en este dispositivo.");
      } catch {
        setMessage("El navegador rechazó la suscripción.");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMessage("Desactivadas en este dispositivo.");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestPushAction();
      setMessage(r.message);
    });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {status === "checking" && "Comprobando…"}
        {status === "unsupported" && "Este navegador no admite notificaciones push. En iPhone hay que añadir UniHub a la pantalla de inicio primero."}
        {status === "denied" && "Has bloqueado las notificaciones para este sitio. Actívalas en los ajustes del navegador."}
        {status === "off" && "Las notificaciones están desactivadas en este dispositivo."}
        {status === "on" && "Este dispositivo recibe los avisos."}
      </p>
      <div className="flex flex-wrap gap-2">
        {status === "off" && <Button size="sm" onClick={enable} disabled={pending}>Activar en este dispositivo</Button>}
        {status === "on" && (
          <>
            <Button size="sm" variant="outline" onClick={test} disabled={pending}>Enviar prueba</Button>
            <Button size="sm" variant="ghost" onClick={disable} disabled={pending}>Desactivar</Button>
          </>
        )}
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
