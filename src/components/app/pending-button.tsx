"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que se desactiva mientras se procesa el formulario. */
export function PendingButton({ children, pendingLabel, className }: { children: React.ReactNode; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
