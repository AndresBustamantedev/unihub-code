import { AppShell } from "@/components/app/app-shell";
import { ListSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/ajustes">
      <ListSkeleton tabs={0} rows={5} />
    </AppShell>
  );
}
