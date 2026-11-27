import { AppShell } from "@/components/app/app-shell";
import { Sk } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/asignaturas" wide>
      <div className="flex flex-col gap-3" role="status">
        <span className="sr-only">Cargando…</span>
        <Sk className="h-3.5 w-40" />
        <Sk className="h-7 w-2/3" />
        <Sk className="h-12 rounded-lg" />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Sk className="h-[70dvh] rounded-lg" />
          <Sk className="h-[70dvh] rounded-lg" />
        </div>
      </div>
    </AppShell>
  );
}
