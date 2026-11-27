"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markChangesReadAction } from "@/features/content/actions";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={disabled || pending} onClick={() => start(async () => void (await markChangesReadAction("all")))}>
      {pending ? "Marcando…" : "Marcar todo como leído"}
    </Button>
  );
}
