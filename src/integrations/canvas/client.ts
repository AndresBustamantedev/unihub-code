import { CanvasApiError, networkErrorCode } from "./errors";
import { isSameOrigin, parseLinkHeader, type LinkRels } from "./pagination";

type Query = Record<string, string | number | boolean | ReadonlyArray<string> | undefined>;

export interface CanvasClientOptions {
  baseUrl: string; // ej. https://campus.example.com/api/v1
  /** Ausente => petición sin autenticar (solo para comprobar alcance). */
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface CanvasResponse<T> {
  data: T;
  status: number;
  links: LinkRels;
  rateLimit: { remaining: number | null; lastRequestCost: number | null };
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;

function toNumberOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Cliente HTTP de Canvas para uso exclusivo en servidor.
 * - El token solo viaja en la cabecera Authorization, nunca en la URL.
 * - No sigue redirecciones (una redirección a login es señal de fallo de auth).
 * - Reintenta con backoff exponencial en 429/5xx/timeout.
 * - Los errores nunca incluyen el cuerpo de la respuesta ni el token.
 */
export class CanvasClient {
  readonly #baseUrl: string;
  readonly #token: string | undefined;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;

  constructor(opts: CanvasClientOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.#token = opts.token;
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  buildUrl(path: string, query?: Query): string {
    const url = new URL(`${this.#baseUrl}/${path.replace(/^\/+/, "")}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, String(v));
        else url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async get<T>(path: string, query?: Query): Promise<CanvasResponse<T>> {
    return this.#requestUrl<T>(this.buildUrl(path, query));
  }

  /** Itera todas las páginas siguiendo `Link: rel="next"` (mismo origen). */
  async *paginate<T>(path: string, query?: Query, maxPages = 50): AsyncGenerator<T[], void, void> {
    let url: string | undefined = this.buildUrl(path, { per_page: 100, ...query });
    let pages = 0;
    while (url && pages < maxPages) {
      const res: CanvasResponse<T[]> = await this.#requestUrl<T[]>(url);
      if (!Array.isArray(res.data)) throw new CanvasApiError("invalid_response", "Se esperaba un array paginado");
      yield res.data;
      pages += 1;
      const next = res.links.next;
      url = next && isSameOrigin(next, this.#baseUrl) ? next : undefined;
    }
  }

  async getAll<T>(path: string, query?: Query, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    for await (const page of this.paginate<T>(path, query, maxPages)) out.push(...page);
    return out;
  }

  async #requestUrl<T>(url: string): Promise<CanvasResponse<T>> {
    if (!isSameOrigin(url, this.#baseUrl)) {
      throw new CanvasApiError("invalid_response", "URL fuera del origen de Canvas configurado");
    }
    let attempt = 0;
    for (;;) {
      try {
        return await this.#once<T>(url);
      } catch (err) {
        const retryable =
          err instanceof CanvasApiError &&
          (err.kind === "rate_limited" || err.kind === "server" || err.kind === "timeout");
        if (!retryable || attempt >= this.#maxRetries) throw err;
        const backoff = 500 * 2 ** attempt + Math.floor(Math.random() * 250);
        await sleep(backoff);
        attempt += 1;
      }
    }
  }

  async #once<T>(url: string): Promise<CanvasResponse<T>> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    const started = performance.now();
    let res: Response;
    try {
      res = await this.#fetch(url, {
        method: "GET",
        headers,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new CanvasApiError("timeout", `Sin respuesta en ${this.#timeoutMs} ms`);
      }
      throw new CanvasApiError("network", "Fallo de red al contactar con Canvas", undefined, networkErrorCode(err));
    } finally {
      clearTimeout(timer);
    }
    const durationMs = Math.round(performance.now() - started);

    const rateLimit = {
      remaining: toNumberOrNull(res.headers.get("x-rate-limit-remaining")),
      lastRequestCost: toNumberOrNull(res.headers.get("x-request-cost")),
    };

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      throw new CanvasApiError("redirect", "Redirección inesperada", res.status);
    }
    if (!res.ok) {
      // Leemos el cuerpo solo para distinguir el rate limit; no se propaga.
      const body = await res.text().catch(() => "");
      if (res.status === 429 || (res.status === 403 && /rate limit exceeded/i.test(body))) {
        throw new CanvasApiError("rate_limited", "Rate limit", res.status);
      }
      if (res.status === 401) throw new CanvasApiError("unauthorized", "No autorizado", 401);
      if (res.status === 403) throw new CanvasApiError("forbidden", "Prohibido", 403);
      if (res.status === 404) throw new CanvasApiError("not_found", "No encontrado", 404);
      if (res.status >= 500) throw new CanvasApiError("server", "Error del servidor", res.status);
      throw new CanvasApiError("invalid_response", `HTTP ${res.status}`, res.status);
    }

    const text = await res.text();
    // Canvas antepone `while(1);` en algunas respuestas JSON (protección anti-JSON hijacking).
    const cleaned = text.replace(/^while\(1\);/, "");
    let data: T;
    try {
      data = JSON.parse(cleaned) as T;
    } catch {
      throw new CanvasApiError("invalid_response", "Respuesta no JSON", res.status);
    }
    return { data, status: res.status, links: parseLinkHeader(res.headers.get("link")), rateLimit, durationMs };
  }
}
