"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Portada de asignatura: imagen elegida → imagen de Canvas → portada generada.
 * Si una URL falla al cargar, cae a la siguiente sin dejar un hueco roto.
 */
export function CourseCover({ sources, alt, className }: { sources: (string | null | undefined)[]; alt: string; className?: string }) {
  const list = sources.filter((s): s is string => !!s);
  const [i, setI] = useState(0);
  const src = list[Math.min(i, list.length - 1)];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setI((n) => (n < list.length - 1 ? n + 1 : n))}
      className={cn("block h-full w-full object-cover", className)}
    />
  );
}
