import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/tareas">
      <ListSkeleton tabs={4} />
    </AppShell>
  );
}
