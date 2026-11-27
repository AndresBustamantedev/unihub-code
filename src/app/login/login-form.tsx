"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithPasswordAction, type LoginState } from "./actions";

const input = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPasswordAction, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Correo
        <input name="email" type="email" required autoComplete="username" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Contraseña
        <span className="relative">
          <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" className={`${input} pr-10`} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>
      {state.error && <p role="alert" className="text-sm text-urgent">{state.error}</p>}
      <Button type="submit" disabled={pending} className="h-10">{pending ? "Entrando…" : "Entrar"}</Button>
    </form>
  );
}
