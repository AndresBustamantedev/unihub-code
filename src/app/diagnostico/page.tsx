import { AppShell } from "@/components/app/app-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { DiagnosticsPanel } from "./diagnostics-panel";

export const dynamic = "force-dynamic";

export default async function DiagnosticoPage() {
  await requirePageUser("/diagnostico");
  return (
    <AppShell active="/diagnostico">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">Diagnóstico de Canvas</h1>
        <p className="text-sm text-muted-foreground">¿Puede el backend autenticarse contra el campus?</p>
      </div>
      <DiagnosticsPanel />
    </AppShell>
  );
}
