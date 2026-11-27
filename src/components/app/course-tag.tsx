import type { CSSProperties } from "react";
import { courseHue, courseShort } from "@/lib/course-color";
import { cn } from "@/lib/utils";

/** Chip de asignatura con su color fijo. */
export function CourseTag({ id, name, code, className }: { id: string; name: string; code?: string | null; className?: string }) {
  return (
    <span
      title={name}
      style={{ "--h": courseHue(id) } as CSSProperties}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[11px] font-semibold",
        "bg-[hsl(var(--h)_75%_94%)] text-[hsl(var(--h)_60%_30%)] dark:bg-[hsl(var(--h)_35%_20%)] dark:text-[hsl(var(--h)_80%_78%)]",
        className,
      )}
    >
      {courseShort(name, code)}
    </span>
  );
}

/** Barra vertical de color para tarjetas. */
export function courseStripeStyle(id: string): CSSProperties {
  return { "--h": courseHue(id), borderLeftColor: `hsl(${courseHue(id)} 65% 50%)` } as CSSProperties;
}
