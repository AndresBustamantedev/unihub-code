"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { setFollowedAction } from "@/features/courses/actions";
import { cn } from "@/lib/utils";

export function FollowToggle({ courseId, followed, name }: { courseId: string; followed: boolean; name: string }) {
  const [optimistic, setOptimistic] = useOptimistic(followed);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Dejar de seguir ${name}` : `Seguir ${name}`}
      title={optimistic ? "Dejar de seguir" : "Seguir en la pantalla principal"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await setFollowedAction(courseId, !optimistic);
        })
      }
      className="rounded-md p-1 hover:bg-muted disabled:opacity-60"
    >
      <Star className={cn("size-4", optimistic ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
    </button>
  );
}
