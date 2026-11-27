const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", euro: "€", hellip: "…", ndash: "–", mdash: "—",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", middot: "·", deg: "°", ccedil: "ç",
};

/** Convierte el HTML de Canvas en texto plano corto. No se renderiza HTML de terceros. */
export function htmlToText(html: string | null | undefined, maxLength = 1500): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#") && e !== "#39") return String.fromCodePoint(parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
