import type { DiagnosticCheck, DiagnosticReport, IntegrationAdapter, OverallStatus } from "../types";
import { CanvasClient, type CanvasClientOptions } from "./client";
import { readCanvasConfig, type CanvasEnv } from "./config";
import { CanvasApiError, describeCanvasError, isTlsTrustError } from "./errors";

interface CanvasSelf {
  id: number;
  name: string;
}

const TOKEN_HOWTO =
  "Genera un token en Canvas: Cuenta → Configuración → «Integraciones aprobadas» → «+ Nuevo token de acceso». Cópialo en CANVAS_ACCESS_TOKEN (.env.local) y reinicia el servidor.";
const NO_TOKEN_BUTTON =
  "Si el botón «+ Nuevo token de acceso» no aparece o da error, la universidad ha restringido los tokens personales: pasa a la Opción B (solicitar a TI una Developer Key OAuth) o a la Opción C (extensión de navegador).";

function errMessage(err: unknown): string {
  return err instanceof CanvasApiError ? describeCanvasError(err) : "Error inesperado durante el diagnóstico.";
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const t = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - t) };
  } catch (error) {
    return { error, ms: Math.round(performance.now() - t) };
  }
}

export interface CanvasDiagnosticsDeps {
  env?: CanvasEnv;
  fetchImpl?: CanvasClientOptions["fetchImpl"];
  timeoutMs?: number;
}

export async function runCanvasDiagnostics(deps: CanvasDiagnosticsDeps = {}): Promise<DiagnosticReport> {
  const startedAt = new Date().toISOString();
  const checks: DiagnosticCheck[] = [];
  const nextSteps: string[] = [];
  const config = readCanvasConfig(deps.env);
  const finish = (overall: OverallStatus, summary: string, extra: Partial<DiagnosticReport> = {}): DiagnosticReport => ({
    provider: "canvas",
    overall,
    summary,
    checks,
    nextSteps,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...extra,
  });

  // 1) Configuración
  const baseUrl = config.baseUrl;
  if (config.ok) {
    checks.push({ id: "config", label: "Configuración", status: "pass", detail: `Base URL: ${config.baseUrl} · token presente (no se muestra)` });
  } else {
    const parts = [
      ...config.missing.map((m) => `falta ${m}`),
      ...config.invalid,
    ];
    checks.push({ id: "config", label: "Configuración", status: config.baseUrl ? "warn" : "fail", detail: parts.join(" · ") });
  }
  if (!baseUrl) {
    nextSteps.push("Define CANVAS_BASE_URL con la dirección de tu campus Canvas terminada en /api/v1 (por ejemplo https://tu-universidad.instructure.com/api/v1) en .env.local.");
    return finish("not_configured", "Falta la URL base de Canvas.");
  }

  // 2) Alcance del servidor (sin credenciales; 401 es lo esperado)
  const anon = new CanvasClient({ baseUrl, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs, maxRetries: 0 });
  const reach = await timed(() => anon.get<unknown>("users/self"));
  if (reach.error instanceof CanvasApiError && reach.error.kind === "unauthorized") {
    checks.push({ id: "reachability", label: "Servidor Canvas accesible", status: "pass", detail: "La API responde y exige autenticación (401 sin credencial, esperado).", durationMs: reach.ms, httpStatus: 401 });
  } else if (reach.error instanceof CanvasApiError && (reach.error.kind === "network" || reach.error.kind === "timeout")) {
    checks.push({ id: "reachability", label: "Servidor Canvas accesible", status: "fail", detail: errMessage(reach.error), durationMs: reach.ms });
    const code = reach.error.code;
    if (isTlsTrustError(code)) {
      nextSteps.push(
        "Node no confía en el certificado del campus (tu navegador sí, porque usa el almacén de certificados de Windows). Prueba: $env:NODE_OPTIONS=\"--use-system-ca\"; npm run canvas:check",
        "Si tienes un antivirus que inspecciona HTTPS (Avast, Kaspersky, ESET…), esa es la causa más habitual.",
      );
    } else if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      nextSteps.push("Fallo de DNS: el equipo no resuelve el dominio del campus desde Node. Comprueba VPN/proxy.");
    } else if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
      nextSteps.push("La conexión se corta: suele ser un proxy o firewall. Si usas proxy, Node no lo toma de Windows automáticamente.");
    } else {
      nextSteps.push("Comprueba la conectividad del servidor con el campus (DNS/firewall). Si despliegas en Vercel, verifica que el campus no bloquee IPs externas.");
    }
    return finish("unreachable", "No se puede contactar con la API de Canvas desde el backend.");
  } else if (reach.error) {
    const e = reach.error;
    checks.push({ id: "reachability", label: "Servidor Canvas accesible", status: "warn", detail: `Respuesta no esperada sin credencial: ${errMessage(e)}`, durationMs: reach.ms, httpStatus: e instanceof CanvasApiError ? e.status : undefined });
  } else {
    checks.push({ id: "reachability", label: "Servidor Canvas accesible", status: "warn", detail: "La API respondió 200 sin credencial; inesperado en Canvas.", durationMs: reach.ms, httpStatus: 200 });
  }

  // 3) Token
  if (!config.ok) {
    checks.push({ id: "auth", label: "Autenticación con token", status: "skip", detail: "Sin token válido configurado." });
    checks.push({ id: "courses", label: "Acceso a cursos", status: "skip", detail: "Requiere autenticación." });
    nextSteps.push(TOKEN_HOWTO, NO_TOKEN_BUTTON);
    return finish("not_configured", "El servidor Canvas responde, pero no hay token configurado.");
  }

  const client = new CanvasClient({ baseUrl, token: config.token, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs });
  const self = await timed(() => client.get<CanvasSelf>("users/self"));
  if (self.error || !self.value) {
    const e = self.error;
    checks.push({ id: "auth", label: "Autenticación con token", status: "fail", detail: errMessage(e), durationMs: self.ms, httpStatus: e instanceof CanvasApiError ? e.status : undefined });
    checks.push({ id: "courses", label: "Acceso a cursos", status: "skip", detail: "Requiere autenticación." });
    if (e instanceof CanvasApiError && e.kind === "unauthorized") {
      nextSteps.push("Revisa que copiaste el token completo (formato «1234~xxxx...»), que no ha caducado y que no lo has borrado en Canvas.", TOKEN_HOWTO);
      return finish("auth_failed", "Canvas rechaza el token configurado.");
    }
    if (e instanceof CanvasApiError && (e.kind === "forbidden" || e.kind === "redirect")) {
      nextSteps.push(NO_TOKEN_BUTTON);
      return finish("auth_failed", "El token no está permitido para acceso por API en esta instalación.");
    }
    nextSteps.push("Reintenta en unos minutos. Si persiste, revisa los logs del servidor (están redactados).");
    return finish("error", "No se pudo completar la autenticación.");
  }

  const identity = { id: self.value.data.id, name: self.value.data.name };
  checks.push({ id: "auth", label: "Autenticación con token", status: "pass", detail: `Autenticado como ${identity.name} (id Canvas ${identity.id}).`, durationMs: self.ms, httpStatus: self.value.status });

  // 4) Cursos (solo primera página, sin guardar nada)
  const courses = await timed(() => client.get<unknown[]>("courses", { per_page: 100, enrollment_state: "active" }));
  let rateLimit = self.value.rateLimit;
  if (courses.value && Array.isArray(courses.value.data)) {
    rateLimit = courses.value.rateLimit;
    const n = courses.value.data.length;
    const more = courses.value.links.next ? " (hay más páginas)" : "";
    checks.push({ id: "courses", label: "Acceso a cursos", status: n > 0 ? "pass" : "warn", detail: n > 0 ? `${n} curso(s) con matrícula activa en la primera página${more}.` : "La petición funcionó pero no devolvió cursos activos. La sincronización también revisa los cursos terminados y futuros.", durationMs: courses.ms, httpStatus: courses.value.status });
  } else {
    checks.push({ id: "courses", label: "Acceso a cursos", status: "fail", detail: errMessage(courses.error), durationMs: courses.ms, httpStatus: courses.error instanceof CanvasApiError ? courses.error.status : undefined });
    nextSteps.push("El token autentica pero no puede leer cursos: puede tener scopes limitados. Genera uno sin restricciones de alcance si Canvas lo permite.");
    return finish("auth_failed", "Autenticado, pero sin acceso a los cursos.", { identity, rateLimit });
  }

  checks.push({
    id: "rate_limit",
    label: "Límite de peticiones",
    status: rateLimit.remaining !== null && rateLimit.remaining < 100 ? "warn" : "pass",
    detail: rateLimit.remaining !== null ? `Cupo restante: ${rateLimit.remaining.toFixed(1)} · coste última petición: ${rateLimit.lastRequestCost?.toFixed(3) ?? "?"}` : "Canvas no envió cabeceras de rate limit.",
  });

  return finish("authenticated", "El backend se autentica correctamente contra Canvas.", { identity, rateLimit });
}

export const canvasAdapter: IntegrationAdapter = {
  provider: "canvas",
  diagnose: () => runCanvasDiagnostics(),
};
