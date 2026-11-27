"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AI_LABEL,
  modelOptionsFor,
  readAiModelCookie,
  readAiPrefCookie,
  writeAiPrefs,
  type AiProviderName,
  type PublicProvider,
} from "@/integrations/ai/shared";
import { cn } from "@/lib/utils";

interface Choice {
  provider: AiProviderName;
  model: string;
  label: string;
  hint: string;
}

function choicesFor(providers: PublicProvider[]): Choice[] {
  return providers
    .filter((p) => p.ok)
    .flatMap((p) => modelOptionsFor(p.provider, p.model).map((m) => ({ provider: p.provider, model: m.id, label: `${AI_LABEL[p.provider]} · ${m.label}`, hint: m.hint })));
}

const key = (c: { provider: string; model: string }) => `${c.provider}|${c.model}`;

/**
 * Elige con qué IA y qué modelo generar. Guarda solo nombres en cookies (nunca claves);
 * el servidor valida que el modelo esté permitido.
 * `variant="cards"` (Ajustes) muestra todas las opciones con su descripción.
 */
export function AiProviderPicker({
  providers,
  initial,
  initialModel,
  variant = "select",
  className,
}: {
  providers: PublicProvider[];
  initial: string | null;
  initialModel?: string | null;
  variant?: "select" | "cards";
  className?: string;
}) {
  const router = useRouter();
  const choices = choicesFor(providers);
  const pick = (provider: string | null, model: string | null) =>
    choices.find((c) => c.provider === provider && c.model === model) ?? choices.find((c) => c.provider === provider) ?? choices[0];
  const [value, setValue] = useState(() => {
    const c = pick(initial, initialModel ?? null);
    return c ? key(c) : "";
  });
  useEffect(() => {
    const c = pick(readAiPrefCookie(), readAiModelCookie());
    if (c) setValue(key(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (choices.length === 0) return null;

  const choose = (k: string) => {
    const c = choices.find((x) => key(x) === k);
    if (!c) return;
    setValue(k);
    writeAiPrefs(c.provider, c.model);
    router.refresh();
  };

  if (variant === "cards") {
    return (
      <div role="radiogroup" aria-label="Modelo de IA activo" className={cn("grid gap-2 sm:grid-cols-2", className)}>
        {choices.map((c) => {
          const on = key(c) === value;
          return (
            <button
              key={key(c)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(key(c))}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                on ? "border-primary bg-accent-soft ring-1 ring-primary" : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className={cn("mt-1 size-3.5 shrink-0 rounded-full border-2", on ? "border-primary bg-primary shadow-[inset_0_0_0_2px_var(--color-card)]" : "border-muted-foreground/50")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
                <code className="text-[11px] text-muted-foreground">{c.model}</code>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (choices.length === 1) {
    const c = choices[0]!;
    return <span className={cn("text-xs text-muted-foreground", className)}>Con {c.label}</span>;
  }
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      Generar con
      <select value={value} onChange={(e) => choose(e.target.value)} className="h-7 rounded-md border border-border bg-card px-1.5 text-xs text-foreground">
        {choices.map((c) => (
          <option key={key(c)} value={key(c)}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
