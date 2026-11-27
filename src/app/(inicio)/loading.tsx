import { AppShell } from "@/components/app/app-shell";
import { HomeSkeleton } from "@/components/app/skeletons";

export default function Loading() {
  return (
    <AppShell active="/">
      <HomeSkeleton />
    </AppShell>
  );
}
