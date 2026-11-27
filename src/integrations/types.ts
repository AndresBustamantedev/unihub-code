/**
 * Contrato común para todos los adaptadores (Canvas, Microsoft Graph, ...).
 * Cada integración vive en su propia carpeta y no depende de las demás.
 */
export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** Texto seguro para mostrar: nunca contiene secretos. */
  detail: string;
  durationMs?: number;
  httpStatus?: number;
}

export type OverallStatus =
  | "authenticated" // el backend puede autenticarse: se puede pasar a la FASE 2
  | "not_configured" // falta configuración (p. ej. token)
  | "auth_failed" // el servidor responde pero rechaza la credencial
  | "unreachable" // no se puede contactar con el servidor
  | "error";

export interface DiagnosticReport {
  provider: string;
  overall: OverallStatus;
  summary: string;
  checks: DiagnosticCheck[];
  nextSteps: string[];
  /** Datos mínimos no sensibles que confirman la identidad. */
  identity?: { id: number; name: string };
  rateLimit?: { remaining: number | null; lastRequestCost: number | null };
  startedAt: string;
  finishedAt: string;
}

export interface IntegrationAdapter {
  readonly provider: string;
  diagnose(): Promise<DiagnosticReport>;
}
