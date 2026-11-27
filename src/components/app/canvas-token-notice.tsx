import { getCanvasTokenStatus } from "@/features/canvas-token/status";
import { isDesktop } from "@/lib/desktop";
import { CanvasTokenBanner } from "./canvas-token-banner";

/** Se carga aparte (dentro de <Suspense>): la consulta a Canvas no retrasa la página. */
export async function CanvasTokenNotice() {
  const status = await getCanvasTokenStatus();
  if (!status || (status.state !== "expiring" && status.state !== "expired")) return null;
  return <CanvasTokenBanner status={status} desktop={isDesktop()} />;
}
