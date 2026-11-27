import { AppShell } from "@/components/app/app-shell";
import { DetailSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/asignaturas">
      <DetailSkeleton />
    </AppShell>
  );
}
