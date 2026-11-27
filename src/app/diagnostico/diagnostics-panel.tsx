"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleMinus, CircleX, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CheckStatus, DiagnosticReport, OverallStatus } from "@/integrations/types";

const OVERALL: Record<OverallStatus, { label: string; tone: CheckStatus }> = {
  authenticated: { label: "Autenticación OK", tone: "pass" },
  not_configured: { label: "Sin configurar", tone: "warn" },
  auth_failed: { label: "Autenticación fallida", tone: "fail" },
  unreachable: { label: "Canvas inaccesible", tone: "fail" },
  error: { label: "Error", tone: "fail" },
};

const ICON: Record<CheckStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: CircleX,
  warn: CircleAlert,
  skip: CircleMinus,
};
const ICON_COLOR: Record<CheckStatus, string> = {
  pass: "text-emerald-600",
  fail: "text-red-600",
  warn: "text-amber-600",
  skip: "text-muted-foreground",
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; report: DiagnosticReport }
  | { kind: "error"; message: string };

export function DiagnosticsPanel() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const run = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/diagnostics/canvas", { cache: "no-store" });
      if (res.status === 429) return setState({ kind: "error", message: "Espera unos segundos antes de repetir el diagnóstico." });
      if (res.status === 401 || res.status === 403) return setState({ kind: "error", message: "Sesión caducada o sin permiso. Vuelve a iniciar sesión." });
      if (!res.ok) return setState({ kind: "error", message: `El diagnóstico falló (HTTP ${res.status}). Revisa los logs del servidor.` });
      setState({ kind: "ready", report: (await res.json()) as DiagnosticReport });
    } catch {
      setState({ kind: "error", message: "No se pudo contactar con el backend de UniHub." });
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              Estado
              {state.kind === "ready" && (
                <Badge variant={OVERALL[state.report.overall].tone}>{OVERALL[state.report.overall].label}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {state.kind === "loading" && "Comprobando conexión…"}
              {state.kind === "error" && state.message}
              {state.kind === "ready" && state.report.summary}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={state.kind === "loading"}>
            <RefreshCw className={state.kind === "loading" ? "animate-spin" : undefined} />
            Repetir
          </Button>
        </CardHeader>
        {state.kind === "ready" && (
          <CardContent>
            <ul className="divide-y divide-border">
              {state.report.checks.map((c) => {
                const Icon = ICON[c.status];
                return (
                  <li key={c.id} className="flex gap-3 py-2">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${ICON_COLOR[c.status]}`} aria-label={c.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm font-medium">
                        <span>{c.label}</span>
                        <span className="text-xs font-normal tabular-nums text-muted-foreground">
                          {c.httpStatus ? `HTTP ${c.httpStatus}` : ""}
                          {c.httpStatus && c.durationMs !== undefined ? " · " : ""}
                          {c.durationMs !== undefined ? `${c.durationMs} ms` : ""}
                        </span>
                      </div>
                      <p className="break-words text-sm text-muted-foreground">{c.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Ejecutado {new Date(state.report.finishedAt).toLocaleString("es-ES")}
            </p>
          </CardContent>
        )}
      </Card>

      {state.kind === "ready" && state.report.nextSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Siguientes pasos</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {state.report.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
