import type { CanvasClient } from "@/integrations/canvas/client";
import type { CanvasCourse } from "@/integrations/canvas/types";

export interface FetchedCourse {
  course: CanvasCourse;
  /** Estados de matrícula con los que apareció (active, invited_or_pending, completed). */
  seenAs: string[];
}

const ENROLLMENT_STATES = ["active", "invited_or_pending", "completed"] as const;

/**
 * Recupera TODOS los cursos visibles: activos, invitaciones y concluidos.
 * Canvas no devuelve los concluidos por defecto, por eso se piden por separado
 * y se fusionan por id (sin duplicados).
 */
export async function fetchAllCanvasCourses(client: CanvasClient): Promise<FetchedCourse[]> {
  const byId = new Map<number, FetchedCourse>();
  for (const state of ENROLLMENT_STATES) {
    const pages = await client.getAll<CanvasCourse>("courses", {
      enrollment_state: state,
      "include[]": ["term", "concluded", "course_image"],
    });
    for (const course of pages) {
      if (typeof course.id !== "number") continue;
      const existing = byId.get(course.id);
      if (existing) {
        existing.seenAs.push(state);
        // Conserva la versión con más información.
        if (!existing.course.name && course.name) existing.course = course;
      } else {
        byId.set(course.id, { course, seenAs: [state] });
      }
    }
  }
  return [...byId.values()];
}
