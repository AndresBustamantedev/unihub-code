import { AlertTriangle } from "lucide-react";
import type { SyncOverview } from "@/features/sync/status";
import { timeAgo } from "@/lib/format";
import { SyncButton } from "./sync-button";

/** Estado de sincronización. Si la última falló, avisa de que los datos pueden estar desactualizados. */
export function SyncStatus({ state }: { state: SyncOverview | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <span className="text-xs text-muted-foreground">
          {state === null
            ? "No se pudo leer el estado de sincronización."
            : state.lastSuccessAt
              ? `Sincronizado ${timeAgo(state.lastSuccessAt)}`
              : "Aún no se ha sincronizado nada de Canvas."}
          {state?.running && " · sincronizando…"}
        </span>
        <SyncButton />
      </div>
      {state?.failure && (
        <div role="alert" className="flex gap-2 rounded-md border border-soon/40 bg-soon/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-soon" />
          <span>
            La última sincronización ({timeAgo(state.failure.started_at)}) tuvo problemas: {state.failure.error_message ?? "error desconocido"}{" "}
            {state.lastSuccessAt ? "Lo que ves puede estar desactualizado." : ""}
          </span>
        </div>
      )}
    </div>
  );
}
