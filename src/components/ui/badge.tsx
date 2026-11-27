import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      pass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      fail: "bg-red-500/15 text-red-700 dark:text-red-400",
      warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      skip: "bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { variant: "skip" },
});

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
