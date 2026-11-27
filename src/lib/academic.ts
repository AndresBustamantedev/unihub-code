/** Curso académico (empieza en septiembre) y semestres de la carrera (1–10). */

export const DEGREE_SEMESTERS = 10;

/** Año de inicio del curso académico de una fecha: sep 2026 – ago 2027 → 2026. */
export function academicYearOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export function academicYearLabel(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function courseAcademicYear(c: { start_at: string | null; term_start_at: string | null; first_seen_at: string }): number | null {
  return academicYearOf(c.start_at ?? c.term_start_at ?? c.first_seen_at);
}

/** Semestre 3 → 2.º curso. */
export function yearOfSemester(semester: number): number {
  return Math.ceil(semester / 2);
}

export function semesterTitle(semester: number): string {
  return `Semestre ${semester} · ${yearOfSemester(semester)}.º curso`;
}
