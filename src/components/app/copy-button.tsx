"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Copia un texto al portapapeles (p. ej. tu usuario de la universidad antes de abrir Stream). */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted", className)}
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      <span aria-live="polite">{done ? "Copiado" : label}</span>
    </button>
  );
}
