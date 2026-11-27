import { AppShell } from "@/components/app/app-shell";
import { GridSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/asignaturas">
      <GridSkeleton />
    </AppShell>
  );
}
