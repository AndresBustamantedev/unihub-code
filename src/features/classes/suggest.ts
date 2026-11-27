const IGNORE = new Set(["transcript", "transcripcion", "grabacion", "recording", "reunion", "meeting", "clase", "sesion", "teams", "para", "with", "docx", "grupo"]);
const ACRONYM_SKIP = new Set(["de", "del", "la", "las", "el", "los", "con", "y", "a", "en", "para", "por"]);

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(s: string): string[] {
  return normalize(s)
    .replace(/\([^)]*\)/g, " ") // quita "(M11-PAGO ...)"
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !IGNORE.has(t) && !/^\d+$/.test(t));
}

/** "PROGRAMACIÓN CON ESTRUCTURAS LINEALES (M21-PAGO)" → "pel" */
export function courseAcronym(name: string): string {
  return normalize(name.replace(/\([^)]*\)/g, " "))
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !ACRONYM_SKIP.has(w))
    .map((w) => w[0])
    .join("");
}

/** Siglas candidatas en el nombre: tokens de 2–6 letras escritos en MAYÚSCULAS (p. ej. "PEL-20261008…"). */
function acronymTokens(label: string): Set<string> {
  return new Set((label.match(/\b[A-ZÁÉÍÓÚÑ]{2,6}\b/g) ?? []).map(normalize));
}

/** Sugiere la asignatura a partir del nombre del archivo, el título o la URL de la grabación. */
export function suggestCourse<T extends { id: string; name: string; course_code: string | null }>(label: string, courses: T[]): T | null {
  const wanted = new Set(tokens(label));
  const acronyms = acronymTokens(label);

  // 1) Siglas exactas (únicas): es como Teams/Stream suelen nombrar las grabaciones.
  const byAcronym = courses.filter((c) => {
    const a = courseAcronym(c.name);
    return a.length >= 2 && acronyms.has(a);
  });
  if (byAcronym.length === 1) return byAcronym[0]!;

  // 2) Palabras del nombre.
  let best: { c: T; score: number } | null = null;
  for (const c of courses) {
    const ct = [...new Set(tokens(`${c.name} ${c.course_code ?? ""}`))];
    if (ct.length === 0) continue;
    const hits = ct.filter((t) => wanted.has(t)).length;
    const score = hits / ct.length;
    if (hits > 0 && (!best || score > best.score)) best = { c, score };
  }
  return best && best.score >= 0.5 ? best.c : null;
}

/**
 * Extrae datos del nombre de una grabación de Teams/Stream, tanto si es el archivo
 * descargado como la URL de stream.aspx (parámetro id=…/Recordings/<nombre>).
 * Ej.: "PEL-20261008_193518-Meeting Recording" → fecha local "2026-10-08T19:35", título "PEL".
 */
export function parseRecordingName(input: string): { name: string; localDate: string | null; title: string } {
  let name = input;
  try {
    const url = new URL(input);
    const id = url.searchParams.get("id");
    name = decodeURIComponent(id ?? url.pathname).split("/").pop() ?? input;
  } catch {
    /* no es una URL */
  }
  name = name.replace(/\.(mp4|vtt|docx|txt)$/i, "");
  const m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(name);
  const localDate = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
  const title = name
    .replace(/\d{8}_\d{6}/, " ")
    .replace(/meeting recording|grabaci[oó]n de (la )?reuni[oó]n|transcript(ion)?|transcripci[oó]n/gi, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name, localDate, title };
}
