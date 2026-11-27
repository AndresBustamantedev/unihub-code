import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/clases">
      <ListSkeleton tabs={0} rows={3} />
    </AppShell>
  );
}
