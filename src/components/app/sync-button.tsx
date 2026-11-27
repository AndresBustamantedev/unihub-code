"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncAllAction } from "@/features/content/actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const r = await syncAllAction();
            if (r.status === "done") setMessage(r.message);
            else if (r.status === "already_running") setMessage("Ya hay una sincronización en curso.");
            else setMessage("Sesión caducada.");
          })
        }
      >
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        {pending ? "Sincronizando…" : "Sincronizar ahora"}
      </Button>
    </div>
  );
}
