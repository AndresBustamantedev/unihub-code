"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { changePasswordAction, type PasswordState } from "@/app/login/actions";

const input = "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1 text-sm">
        Nueva contraseña
        <input name="password" type="password" minLength={10} required autoComplete="new-password" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Repetir
        <input name="confirm" type="password" minLength={10} required autoComplete="new-password" className={input} />
      </label>
      <Button type="submit" size="sm" disabled={pending} className="h-9">{pending ? "Guardando…" : "Cambiar contraseña"}</Button>
      {state.error && <p role="alert" className="text-sm text-urgent sm:col-span-3">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-emerald-600 sm:col-span-3">Contraseña cambiada.</p>}
    </form>
  );
}
