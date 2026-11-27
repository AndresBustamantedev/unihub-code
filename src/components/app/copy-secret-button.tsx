"use client";

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { revealUniversitySecretAction } from "@/features/profile/actions";
import { cn } from "@/lib/utils";

/**
 * Copia la contraseña de la universidad sin mostrarla en pantalla.
 * Se pide al servidor en el momento del clic; con ClipboardItem + promesa el navegador
 * mantiene el permiso del clic aunque la respuesta tarde (Safari lo exige).
 */
export function CopySecretButton({ className }: { className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchValue = async () => {
    const r = await revealUniversitySecretAction();
    if (!r.value) throw new Error(r.error ?? "No se pudo copiar.");
    return r.value;
  };

  const copy = async () => {
    setError(null);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = fetchValue().then((v) => new Blob([v], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText(await fetchValue());
      }
      setState("done");
      setTimeout(() => setState("idle"), 1800);
    } catch (e) {
      setState("error");
      setError(e instanceof Error && e.message ? e.message : "No se pudo copiar.");
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={copy}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted", className)}
      >
        {state === "done" ? <Check className="size-3.5 text-emerald-600" /> : <KeyRound className="size-3.5" />}
        <span aria-live="polite">{state === "done" ? "Copiada" : "Copiar contraseña"}</span>
      </button>
      {state === "error" && error && <span role="alert" className="mt-1 max-w-56 text-[11px] text-urgent">{error}</span>}
    </span>
  );
}
