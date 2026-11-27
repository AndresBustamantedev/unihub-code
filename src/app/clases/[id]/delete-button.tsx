"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteClassAction } from "@/features/classes/actions";

export function DeleteClassButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming) return <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>Eliminar</Button>;
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">¿Eliminar clase y transcripción?</span>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => deleteClassAction(id))}>{pending ? "Eliminando…" : "Sí, eliminar"}</Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Button>
    </span>
  );
}
