import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { AssignmentItem, isOverdue } from "@/components/app/assignment-item";
import { SyncStatus } from "@/components/app/sync-status";
import { listAssignments, type AssignmentWithCourse } from "@/features/content/queries";
import { getSyncOverview } from "@/features/sync/status";
import { requirePageUser } from "@/lib/auth/page-guard";
import { BUCKET_LABEL, dueBucket, type DueBucket } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS = {
  pendientes: { label: "Pendientes", test: (a: AssignmentWithCourse) => a.submission_state === "pending" || a.submission_state === "unknown" },
  entregadas: { label: "Entregadas", test: (a: AssignmentWithCourse) => a.submission_state === "submitted" },
  calificadas: { label: "Calificadas", test: (a: AssignmentWithCourse) => a.submission_state === "graded" },
  todas: { label: "Todas", test: () => true },
} as const;
type FilterKey = keyof typeof FILTERS;

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "tomorrow", "week", "later", "none"];

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await requirePageUser("/tareas");
  const { estado } = await searchParams;
  const filter: FilterKey = estado && estado in FILTERS ? (estado as FilterKey) : "pendientes";
  const supabase = await createSupabaseServerClient();
  const [assignments, sync] = await Promise.all([listAssignments(supabase), getSyncOverview(supabase)]);
  const now = new Date();
  const items = assignments.ok ? assignments.data.filter(FILTERS[filter].test) : [];

  // Pendientes: agrupadas por urgencia. Resto: entregas más recientes primero.
  const groups =
    filter === "pendientes"
      ? BUCKET_ORDER.map((b) => ({ key: b, label: BUCKET_LABEL[b], items: items.filter((a) => dueBucket(a.due_at, now) === b) }))
      : [{ key: "all", label: FILTERS[filter].label, items: [...items].sort((a, b) => (b.due_at ?? "").localeCompare(a.due_at ?? "")) }];

  return (
    <AppShell active="/tareas">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Tareas</h1>
          <nav className="flex gap-1">
            {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
              <Link
                key={k}
                href={k === "pendientes" ? "/tareas" : `/tareas?estado=${k}`}
                className={cn("rounded-md px-2.5 py-1 text-sm", k === filter ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {FILTERS[k].label}
              </Link>
            ))}
          </nav>
        </div>
        <SyncStatus state={sync} />

        {!assignments.ok ? (
          <p className="text-sm text-red-600">No se pudieron cargar las tareas.</p>
        ) : !sync || sync.neverSucceeded ? (
          <p className="text-sm text-muted-foreground">Aún no hay datos sincronizados. Pulsa «Sincronizar ahora».</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna tarea en «{FILTERS[filter].label}» en tus asignaturas seguidas{sync.failure ? ", según la última sincronización correcta" : ""}.
          </p>
        ) : (
          groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.key} className="rounded-lg border border-border bg-card px-3">
                <h2 className={cn("pt-2.5 text-sm font-semibold", g.key === "overdue" && "text-red-600")}>
                  {g.label} <span className="font-normal text-muted-foreground">({g.items.length})</span>
                </h2>
                <ul className="divide-y divide-border">{g.items.map((a) => <AssignmentItem key={a.id} a={a} />)}</ul>
              </section>
            ))
        )}
        {filter === "pendientes" && items.some((a) => isOverdue(a, now)) && (
          <p className="text-xs text-muted-foreground">«Vencida» = sin entrega registrada en Canvas y con la fecha límite pasada.</p>
        )}
      </div>
    </AppShell>
  );
}
