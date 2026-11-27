/**
 * Parser de la cabecera HTTP `Link` (RFC 8288) tal como la usa Canvas:
 *   <https://.../courses?page=2&per_page=10>; rel="next", <...>; rel="last"
 */
export type LinkRels = Partial<Record<"current" | "next" | "prev" | "first" | "last", string>>;

export function parseLinkHeader(header: string | null | undefined): LinkRels {
  const rels: LinkRels = {};
  if (!header) return rels;
  for (const part of header.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="?([^";]+)"?/i.exec(part.trim());
    if (!match) continue;
    const [, url, rel] = match;
    if (!url || !rel) continue;
    for (const r of rel.split(/\s+/)) {
      if (r === "current" || r === "next" || r === "prev" || r === "first" || r === "last") {
        rels[r] = url;
      }
    }
  }
  return rels;
}

/**
 * Solo seguimos enlaces del mismo origen que la base configurada para no
 * enviar nunca el token a otro host.
 */
export function isSameOrigin(candidate: string, base: string): boolean {
  try {
    return new URL(candidate).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
