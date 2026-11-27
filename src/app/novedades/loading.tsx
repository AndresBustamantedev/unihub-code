import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/novedades">
      <ListSkeleton tabs={3} rows={8} />
    </AppShell>
  );
}
