"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateNoteAction } from "@/features/notes/actions";
import { readAiPrefCookie } from "@/integrations/ai/shared";

export function GenerateButton({ sessionId, kind, exists, disabled }: { sessionId: string; kind: string; exists: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button
        size="sm"
        variant={exists ? "ghost" : "outline"}
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await generateNoteAction(sessionId, kind, readAiPrefCookie());
            if (!r.ok) setError(r.error);
          })
        }
      >
        <Sparkles className={pending ? "animate-pulse" : undefined} />
        {pending ? "Generando…" : exists ? "Regenerar" : "Generar"}
      </Button>
    </span>
  );
}
