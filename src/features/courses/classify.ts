import type { CanvasCourse } from "@/integrations/canvas/types";
import type { CourseCategory } from "@/lib/supabase/database.types";

export interface Classification {
  category: CourseCategory;
  reason: string;
}

/**
 * Palabras que suelen identificar espacios que no son asignaturas
 * (comunidades, información, orientación…). Es una sugerencia: el usuario
 * decide qué seguir, la categoría solo sirve para agrupar.
 */
const AUXILIARY_NAME =
  /\b(comunidad|community|biblioteca|library|orientaci[oó]n|bienvenid[ao]s?|welcome|sandbox|plantilla|template|tutor[ií]as?|informaci[oó]n|secretar[ií]a|onboarding|curso cero|inducci[oó]n|delegad[oa]s?|espacio de|zona de|campus virtual|canal|noticias|movilidad|empleabilidad|career|club)\b/i;

const DEFAULT_TERM = /default|por defecto|predeterminad|sin periodo/i;

/** Códigos de grupo de la Universidad Europea, p. ej. "(M11-PAGO M11-PAWT)": señal fuerte de asignatura real. */
const SUBJECT_GROUPS = /\((?:[A-Z]\d{2}-[A-Z]{2,}\s*)+\)/;

/** Espacios del grado que no son asignaturas: aula del tutor, comunidad del grado (COM_/TUT_). */
const AUXILIARY_SPACE = /\baula tutor\b|\((?:TUT|COM)_\d{4}\w*\)/i;

/** Formación complementaria autoguiada. */
const ASYNC_TERM = /as[ií]ncron/i;

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifyCourse(course: CanvasCourse, now: Date = new Date()): Classification {
  if (course.access_restricted_by_date) {
    return { category: "past", reason: "Canvas restringe el acceso por fecha" };
  }

  const enrollments = course.enrollments ?? [];
  const isStudent = enrollments.some((e) => (e.type ?? "").toLowerCase().includes("student"));
  if (enrollments.length > 0 && !isStudent) {
    const types = [...new Set(enrollments.map((e) => e.type).filter(Boolean))].join(", ");
    return { category: "auxiliary", reason: `No estás como estudiante (${types || "otro rol"})` };
  }

  const label = `${course.name ?? ""} ${course.course_code ?? ""}`;
  const isSubject = SUBJECT_GROUPS.test(course.name ?? "");
  if (!isSubject) {
    if (AUXILIARY_SPACE.test(label)) return { category: "auxiliary", reason: "Espacio del grado (tutoría/comunidad), no es una asignatura" };
    const auxMatch = AUXILIARY_NAME.exec(label);
    if (auxMatch) return { category: "auxiliary", reason: `El nombre sugiere un espacio no lectivo («${auxMatch[0]}»)` };
    if (ASYNC_TERM.test(course.term?.name ?? "")) return { category: "auxiliary", reason: "Formación complementaria asíncrona" };
  }

  if (course.workflow_state === "completed" || course.concluded === true) {
    return { category: "past", reason: "Curso concluido en Canvas" };
  }
  if (enrollments.length > 0 && enrollments.every((e) => e.enrollment_state === "completed")) {
    return { category: "past", reason: "Matrícula finalizada" };
  }

  const end = toDate(course.end_at) ?? toDate(course.term?.end_at);
  if (end && end < now) return { category: "past", reason: `Terminó el ${end.toLocaleDateString("es-ES")}` };

  const start = toDate(course.start_at) ?? toDate(course.term?.start_at);
  if (start && start > now) return { category: "future", reason: `Empieza el ${start.toLocaleDateString("es-ES")}` };

  const termName = course.term?.name ?? "";
  if (isSubject && !start && !end) return { category: "current", reason: "Asignatura con grupo, sin fechas en Canvas" };
  if (!start && !end && (!course.term || DEFAULT_TERM.test(termName))) {
    return { category: "auxiliary", reason: "Sin periodo académico ni fechas" };
  }

  return {
    category: "current",
    reason: termName && !DEFAULT_TERM.test(termName) ? `Periodo: ${termName}` : "Activo y dentro de fechas",
  };
}
