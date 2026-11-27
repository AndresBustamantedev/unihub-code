export type ResourceKind = "video" | "doc" | "code" | "exercise" | "link";

const VIDEO = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)$/;
const CODE = /(^|\.)(github\.com|gitlab\.com|stackoverflow\.com|replit\.com|leetcode\.com|godbolt\.org)$/;
const EXERCISE = /(^|\.)(khanacademy\.org|exercism\.org|hackerrank\.com|codewars\.com|brilliant\.org)$/;

/** Normaliza una URL escrita por el alumno: añade https:// si falta y solo admite http(s). */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function resourceKind(url: string): ResourceKind {
  const host = hostOf(url);
  if (VIDEO.test(host)) return "video";
  if (CODE.test(host)) return "code";
  if (EXERCISE.test(host)) return "exercise";
  if (/\.pdf($|\?)/i.test(url)) return "doc";
  return "link";
}

/** Título por defecto si no se escribe uno: el dominio (sin pedir la página, para no hacer peticiones a terceros). */
export function defaultTitle(url: string): string {
  const host = hostOf(url);
  const kind = resourceKind(url);
  return kind === "video" ? `Vídeo de ${host}` : host;
}
