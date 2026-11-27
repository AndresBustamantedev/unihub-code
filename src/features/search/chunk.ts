/**
 * Troceado de textos para la búsqueda: fragmentos de ~1200 caracteres que cortan por párrafos o
 * frases, con un pequeño solape para no partir una idea entre dos fragmentos.
 */

export interface Chunk {
  content: string;
  location: string | null;
}

const SIZE = 1200;
const OVERLAP = 150;
const MAX = 3800;

/** Minúsculas y sin tildes (igual que public.unihub_norm en SQL). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function cut(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= SIZE) return [clean];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + SIZE, clean.length);
    if (end < clean.length) {
      // Mejor final: fin de párrafo, si no fin de frase, si no un espacio.
      const window = clean.slice(start + Math.floor(SIZE * 0.6), end);
      const para = window.lastIndexOf("\n\n");
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf("\n"));
      const space = window.lastIndexOf(" ");
      const at = para >= 0 ? para + 2 : sentence >= 0 ? sentence + 1 : space >= 0 ? space + 1 : -1;
      if (at > 0) end = start + Math.floor(SIZE * 0.6) + at;
    }
    out.push(clean.slice(start, end).trim().slice(0, MAX));
    if (end >= clean.length) break;
    // Solape: se retrocede hasta un espacio para no empezar a mitad de palabra.
    let next = Math.max(end - OVERLAP, start + 1);
    const sp = clean.indexOf(" ", next);
    if (sp > 0 && sp < end) next = sp + 1;
    start = next;
  }
  return out.filter(Boolean);
}

/** Texto corrido (transcripciones, apuntes, notas): «Parte i de n» si hay varias. */
export function chunkText(text: string): Chunk[] {
  const parts = cut(text);
  return parts.map((content, i) => ({ content, location: parts.length > 1 ? `Parte ${i + 1} de ${parts.length}` : null }));
}

/** Texto de un PDF con marcas «[Página N]»: cada fragmento sabe de qué página sale. */
export function chunkPages(text: string): Chunk[] {
  const re = /\[Página (\d+)\]\n?/g;
  const marks = [...text.matchAll(re)];
  if (!marks.length) return chunkText(text).map((c) => ({ ...c, location: c.location }));
  const out: Chunk[] = [];
  marks.forEach((m, i) => {
    const from = m.index! + m[0].length;
    const to = i + 1 < marks.length ? marks[i + 1]!.index! : text.length;
    for (const content of cut(text.slice(from, to))) out.push({ content, location: `Página ${m[1]}` });
  });
  return out;
}

/**
 * Fragmento para mostrar alrededor de las palabras buscadas, con las coincidencias marcadas.
 * Devuelve trozos [texto, ¿coincide?] para pintarlos sin HTML.
 */
export function snippet(content: string, query: string, width = 240): Array<[string, boolean]> {
  const terms = [...new Set(norm(query).split(/[^a-z0-9ñ]+/i).filter((t) => t.length >= 3))].map((t) => (t.length > 5 ? t.slice(0, t.length - 2) : t));
  // Mismo largo que el original carácter a carácter (las tildes se quitan sin cambiar posiciones).
  const n = [...content].map((ch) => norm(ch) || ch).join("");
  const sameLength = n.length === content.length;
  const hay = sameLength ? n : norm(content);
  const src = sameLength ? content : hay;
  let first = -1;
  for (const t of terms) {
    const i = hay.indexOf(t);
    if (i >= 0 && (first < 0 || i < first)) first = i;
  }
  const start = first < 0 ? 0 : Math.max(0, first - Math.floor(width / 3));
  const end = Math.min(src.length, start + width);
  let a = start;
  while (a > 0 && a > start - 20 && /\S/.test(src[a - 1]!)) a--;
  const piece = src.slice(a, end);
  const pieceN = hay.slice(a, end);
  const out: Array<[string, boolean]> = [];
  if (a > 0) out.push(["…", false]);
  let i = 0;
  while (i < piece.length) {
    let hit = -1;
    let hitLen = 0;
    for (const t of terms) {
      const j = pieceN.indexOf(t, i);
      if (j >= 0 && (hit < 0 || j < hit)) {
        hit = j;
        // Se marca la palabra entera (derivad → derivadas).
        let k = j + t.length;
        while (k < pieceN.length && /[a-z0-9ñ]/.test(pieceN[k]!)) k++;
        hitLen = k - j;
      }
    }
    if (hit < 0) {
      out.push([piece.slice(i), false]);
      break;
    }
    if (hit > i) out.push([piece.slice(i, hit), false]);
    out.push([piece.slice(hit, hit + hitLen), true]);
    i = hit + hitLen;
  }
  if (end < src.length) out.push(["…", false]);
  return out;
}
