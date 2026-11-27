"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveUniversityLoginAction, type LoginState } from "@/features/profile/actions";

export function UniversityLoginForm({ value }: { value: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(saveUniversityLoginAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
        Usuario de la universidad
        <input
          name="university_login"
          type="email"
          autoComplete="off"
          defaultValue={value ?? ""}
          placeholder="tu-usuario@tu-universidad.es"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-9">{pending ? "Guardando…" : "Guardar"}</Button>
      {state.error && <p role="alert" className="w-full text-sm text-urgent">{state.error}</p>}
      {state.ok && <p role="status" className="w-full text-sm text-emerald-600">Guardado.</p>}
    </form>
  );
}
