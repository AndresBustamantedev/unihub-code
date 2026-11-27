import { AppShell } from "@/components/app/app-shell";
import { ClassesSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/clases">
      <ClassesSkeleton />
    </AppShell>
  );
}
