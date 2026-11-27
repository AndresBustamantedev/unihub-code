import type { CanvasUser } from "@/integrations/canvas/types";
import type { PersonRow } from "@/lib/supabase/database.types";

const ROLE: Record<string, PersonRow["role"]> = {
  TeacherEnrollment: "teacher",
  TaEnrollment: "ta",
  DesignerEnrollment: "designer",
};

const LABEL: Record<PersonRow["role"], string> = { teacher: "Profesor/a", ta: "Ayudante", designer: "Diseño del curso", other: "Otro" };

/** Una fila por persona y rol. El rol personalizado de Canvas (p. ej. "Tutor") se guarda como etiqueta. */
export function mapPeople(users: CanvasUser[], ctx: { userId: string; courseId: string; nowIso: string }) {
  const out: Omit<PersonRow, "id">[] = [];
  const seen = new Set<string>();
  for (const u of users) {
    if (typeof u.id !== "number") continue;
    const roles = (u.enrollments ?? []).filter((e) => e.type && ROLE[e.type]);
    for (const e of roles.length ? roles : [{ type: "TeacherEnrollment", role: undefined }]) {
      const role = ROLE[e.type ?? ""] ?? "other";
      const key = `${u.id}:${role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const custom = e.role && !/Enrollment$/.test(e.role) ? e.role : null;
      out.push({
        user_id: ctx.userId,
        course_id: ctx.courseId,
        external_id: u.id,
        name: (u.name ?? u.short_name ?? `Usuario ${u.id}`).trim(),
        role,
        role_label: custom ?? LABEL[role],
        email: u.email?.trim() || null,
        missing_since: null,
        last_synced_at: ctx.nowIso,
      });
    }
  }
  return out;
}

/** Nombres de Canvas suelen venir en MAYÚSCULAS: "PAULA PEREZ MILAN" → "Paula Perez Milan". */
export function displayPersonName(name: string): string {
  const letters = name.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length;
  if (!letters.length || upper / letters.length < 0.8) return name;
  return name
    .toLocaleLowerCase("es-ES")
    .split(/(\s+|-)/)
    .map((w) => (/^(de|del|la|las|los|y)$/.test(w) ? w : w.charAt(0).toLocaleUpperCase("es-ES") + w.slice(1)))
    .join("");
}
