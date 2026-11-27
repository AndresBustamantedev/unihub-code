import { cn } from "@/lib/utils";

/** Bloque gris de carga. Sin animación si el sistema pide reducir movimiento. */
export function Sk({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} aria-hidden />;
}

function Header({ action = true }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Sk className="h-3.5 w-32" />
        <Sk className="h-7 w-48" />
      </div>
      {action && <Sk className="h-8 w-28" />}
    </div>
  );
}

function Rows({ n = 5, tall = false }: { n?: number; tall?: boolean }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card px-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-start gap-3 py-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Sk className={cn("h-4", i % 3 === 0 ? "w-3/4" : "w-5/6")} />
            <Sk className={cn("h-3", i % 2 ? "w-1/2" : "w-2/3")} />
            {tall && <Sk className="h-7 w-72 max-w-full" />}
          </div>
          <Sk className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <Loading>
      <Header action={false} />
      <div className="hidden grid-cols-7 gap-1.5 md:grid">
        {Array.from({ length: 7 }, (_, i) => <Sk key={i} className="h-36 rounded-lg" />)}
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 3 }, (_, i) => <Sk key={i} className="h-20 rounded-lg" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Sk className="h-48 rounded-xl" />
        <Sk className="h-48 rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <Sk key={i} className="h-36 rounded-xl" />)}
      </div>
    </Loading>
  );
}

export function ListSkeleton({ tabs = 3, rows = 6, tall = false }: { tabs?: number; rows?: number; tall?: boolean }) {
  return (
    <Loading>
      <Header />
      <div className="flex gap-2">{Array.from({ length: tabs }, (_, i) => <Sk key={i} className="h-7 w-24" />)}</div>
      <Rows n={rows} tall={tall} />
    </Loading>
  );
}

export function ClassesSkeleton() {
  return (
    <Loading>
      <Header />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <Sk key={i} className="h-20 rounded-lg" />)}
      </div>
      <div className="flex gap-2">{Array.from({ length: 4 }, (_, i) => <Sk key={i} className="h-7 w-24" />)}</div>
      <Rows n={4} tall />
    </Loading>
  );
}

export function GridSkeleton() {
  return (
    <Loading>
      <Header action={false} />
      <Sk className="h-4 w-28" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Sk key={i} className="h-44 rounded-xl" />)}
      </div>
    </Loading>
  );
}

export function DetailSkeleton() {
  return (
    <Loading>
      <Sk className="h-40 rounded-xl" />
      <div className="flex gap-2">{Array.from({ length: 6 }, (_, i) => <Sk key={i} className="h-8 w-20" />)}</div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Sk className="h-64 rounded-xl" />
        <Sk className="h-64 rounded-xl" />
      </div>
    </Loading>
  );
}
