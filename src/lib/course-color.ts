import { courseAcronym } from "@/features/classes/suggest";

/** Tonos separados entre sí y legibles en claro y oscuro. */
export const HUES = [221, 162, 27, 271, 345, 190, 45, 120, 300, 0];

/** Colores asignados (guardados en courses.color_hue), cargados por requirePageUser en cada página. */
const assigned = new Map<string, number>();
export function registerCourseHues(rows: { id: string; color_hue: number | null }[]): void {
  for (const r of rows) if (r.color_hue !== null) assigned.set(r.id, r.color_hue);
}

/** Primer tono de la paleta que no usan las demás asignaturas seguidas. */
export function pickFreeHue(used: (number | null)[]): number {
  const taken = new Set(used.filter((h): h is number => h !== null));
  return HUES.find((h) => !taken.has(h)) ?? HUES[taken.size % HUES.length]!;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Tono estable para una asignatura (mismo color en todas las pantallas). */
export function courseHue(courseId: string): number {
  return assigned.get(courseId) ?? HUES[hash(courseId) % HUES.length]!;
}

/** Sigla corta para chips: "PROGRAMACIÓN CON ESTRUCTURAS LINEALES (…)" → "PEL". */
export function courseShort(name: string, code?: string | null): string {
  const a = courseAcronym(name).toUpperCase();
  if (a.length >= 2 && a.length <= 5) return a;
  return (code ?? name).slice(0, 12);
}

const KEEP_UPPER = /^(I{1,3}|IV|V|VI{0,3}|IX|X|TIC|IA|UML|SQL|IP|TCP|POO|API|UE)$/;

/** "FUNDAMENTOS DE REDES (M11-PAGO M12-PAGO)" → "Fundamentos de redes". Respeta nombres ya escritos con mayúsculas normales. */
export function displayCourseName(name: string): string {
  const base = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const letters = base.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length;
  if (letters.length === 0 || upper / letters.length < 0.7) return base;
  const lower = base
    .split(/(\s+)/)
    .map((w) => (KEEP_UPPER.test(w) ? w : w.toLocaleLowerCase("es-ES")))
    .join("");
  return lower.charAt(0).toLocaleUpperCase("es-ES") + lower.slice(1);
}
