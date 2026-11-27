"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type ThemePref } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";

const ORDER: ThemePref[] = ["light", "dark", "system"];
const META: Record<ThemePref, { label: string; Icon: typeof Sun }> = {
  light: { label: "Claro", Icon: Sun },
  dark: { label: "Oscuro", Icon: Moon },
  system: { label: "Automático", Icon: Monitor },
};

function apply(pref: ThemePref) {
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Botón compacto: alterna Claro → Oscuro → Automático. */
export function ThemeToggle({ initial, className }: { initial: ThemePref; className?: string }) {
  const [pref, setPref] = useState<ThemePref>(initial);
  useEffect(() => {
    if (pref !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => document.documentElement.classList.toggle("dark", m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [pref]);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!;
  const { Icon, label } = META[pref];
  return (
    <button
      type="button"
      onClick={() => {
        apply(next);
        setPref(next);
      }}
      className={cn("inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", className)}
      aria-label={`Tema: ${label}. Cambiar a ${META[next].label}`}
      title={`Tema: ${label}`}
    >
      <Icon className="size-4" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

/** Selector segmentado para Ajustes. */
export function ThemeSelector({ initial }: { initial: ThemePref }) {
  const [pref, setPref] = useState<ThemePref>(initial);
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
      {ORDER.map((p) => {
        const { Icon, label } = META[p];
        return (
          <button
            key={p}
            role="radio"
            aria-checked={pref === p}
            type="button"
            onClick={() => {
              apply(p);
              setPref(p);
            }}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", pref === p ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
