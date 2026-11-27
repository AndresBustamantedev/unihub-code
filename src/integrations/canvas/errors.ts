export type CanvasErrorKind =
  | "unauthorized" // 401: token ausente, inválido, caducado o revocado
  | "forbidden" // 403: token válido sin permiso / restringido por la institución
  | "not_found"
  | "rate_limited" // 403 + "Rate Limit Exceeded" o 429
  | "redirect" // 3xx: típicamente redirección a login/SSO
  | "server" // 5xx
  | "network"
  | "timeout"
  | "invalid_response";

export class CanvasApiError extends Error {
  override readonly name = "CanvasApiError";
  constructor(
    readonly kind: CanvasErrorKind,
    message: string,
    readonly status?: number,
    /** Código técnico seguro (p. ej. ENOTFOUND, UNABLE_TO_VERIFY_LEAF_SIGNATURE). */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Mensajes en español, seguros para la UI (sin cuerpos de respuesta ni secretos). */
export function describeCanvasError(err: CanvasApiError): string {
  switch (err.kind) {
    case "unauthorized":
      return "Canvas rechazó la credencial (401). El token falta, es incorrecto, ha caducado o se ha revocado.";
    case "forbidden":
      return "Canvas aceptó la petición pero denegó el acceso (403). Puede ser una restricción institucional sobre tokens o falta de permisos.";
    case "rate_limited":
      return "Canvas ha limitado las peticiones (rate limit). Espera unos minutos y reintenta.";
    case "redirect":
      return "Canvas respondió con una redirección (probablemente al login/SSO). La petición no se autenticó por API.";
    case "not_found":
      return "El endpoint no existe (404). Revisa CANVAS_BASE_URL: debe terminar en /api/v1.";
    case "server":
      return `Error del servidor de Canvas (${err.status ?? "5xx"}). Reintenta más tarde.`;
    case "timeout":
      return "Canvas no respondió a tiempo.";
    case "network":
      return `No se pudo conectar con Canvas (DNS, red o TLS).${err.code ? ` Código: ${err.code}.` : ""}`;
    case "invalid_response":
      return "Canvas devolvió una respuesta que no es JSON válido.";
  }
}

const TLS_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export function isTlsTrustError(code: string | undefined): boolean {
  return !!code && TLS_CODES.has(code);
}

/** Extrae el código de error de undici/Node sin exponer nada más. */
export function networkErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}
