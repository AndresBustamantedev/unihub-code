"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CopySecretButton } from "@/components/app/copy-secret-button";
import { saveUniversitySecretAction, type SecretState } from "@/features/profile/actions";

export function UniversitySecretForm({ saved, keyConfigured }: { saved: boolean; keyConfigured: boolean }) {
  const [state, action, pending] = useActionState<SecretState, FormData>(saveUniversitySecretAction, {});
  const form = useRef<HTMLFormElement>(null);
  if (!keyConfigured) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-300">
        Para guardar la contraseña cifrada falta <code>CREDENTIALS_ENCRYPTION_KEY</code> en <code>.env.local</code>. Añádela y reinicia.
      </p>
    );
  }
  return (
    <form ref={form} action={action} onSubmit={() => setTimeout(() => form.current?.reset(), 0)} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
        Contraseña de la universidad {saved && <span className="text-xs text-emerald-700 dark:text-emerald-300">· guardada (cifrada)</span>}
        <input
          name="secret"
          type="password"
          autoComplete="new-password"
          placeholder={saved ? "Escribe una nueva para reemplazarla" : "Pégala aquí"}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <Button type="submit" name="intent" value="save" size="sm" variant="outline" disabled={pending} className="h-9">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {saved && (
        <>
          <CopySecretButton className="h-9" />
          <Button type="submit" name="intent" value="delete" size="sm" variant="ghost" disabled={pending} className="h-9 text-muted-foreground" formNoValidate>
            Borrar
          </Button>
        </>
      )}
      {state.error && <p role="alert" className="w-full text-sm text-urgent">{state.error}</p>}
      {state.ok === "saved" && <p role="status" className="w-full text-sm text-emerald-600">Guardada cifrada.</p>}
      {state.ok === "deleted" && <p role="status" className="w-full text-sm text-muted-foreground">Borrada.</p>}
    </form>
  );
}
