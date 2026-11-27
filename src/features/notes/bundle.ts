import type {
  AnnouncementRow,
  AssignmentRow,
  ClassSessionRow,
  CourseRow,
  ModuleItemRow,
  ModuleRow,
  StudyNoteRow,
  TranscriptRow,
} from "@/lib/supabase/database.types";
import { formatDue, formatEventRange } from "@/lib/format";
import { safeFilename, sessionToMarkdown } from "@/features/classes/markdown";

const NOTE_LABEL: Record<StudyNoteRow["kind"], string> = { summary: "resumen", questions: "preguntas", exercises: "ejercicios" };

export interface BundleInput {
  course: Pick<CourseRow, "name" | "course_code" | "term_name" | "html_url">;
  modules: Pick<ModuleRow, "id" | "name" | "position">[];
  items: Pick<ModuleItemRow, "module_id" | "title" | "item_type" | "position">[];
  assignments: Pick<AssignmentRow, "name" | "due_at" | "submission_state" | "description_text" | "points_possible">[];
  announcements: Pick<AnnouncementRow, "title" | "posted_at" | "author_name" | "message_excerpt">[];
  sessions: (Pick<ClassSessionRow, "id" | "title" | "session_at" | "duration_minutes" | "recording_url" | "topics" | "notes"> & {
    transcript: Pick<TranscriptRow, "content_text" | "speakers"> | null;
  })[];
  notes: Pick<StudyNoteRow, "session_id" | "kind" | "content_md">[];
  generatedAt: Date;
}

/**
 * Paquete de fuentes para NotebookLM (o cualquier herramienta): un Markdown de contexto de la
 * asignatura, uno por clase con su transcripción y los apuntes generados. Devuelve ruta → contenido.
 */
export function buildCourseBundle(b: BundleInput): Record<string, string> {
  const files: Record<string, string> = {};
  const dated = (iso: string, title: string) => safeFilename(`${iso.slice(0, 10)}_${title}`);

  const outline = [...b.modules]
    .sort((a, z) => (a.position ?? 0) - (z.position ?? 0))
    .map((m) => {
      const its = b.items.filter((i) => i.module_id === m.id && i.item_type !== "SubHeader").sort((a, z) => (a.position ?? 0) - (z.position ?? 0));
      return `### ${m.name}\n${its.map((i) => `- ${i.title} (${i.item_type})`).join("\n") || "- (vacío)"}`;
    })
    .join("\n\n");

  const tasks = b.assignments
    .map((a) => `### ${a.name}\n- Entrega: ${formatDue(a.due_at) ?? "sin fecha"} · Estado: ${a.submission_state}${a.points_possible ? ` · ${a.points_possible} puntos` : ""}${a.description_text ? `\n\n${a.description_text}` : ""}`)
    .join("\n\n");

  const ann = b.announcements
    .map((a) => `### ${a.title}\n_${a.author_name ?? "?"} · ${formatEventRange(a.posted_at, null)}_\n\n${a.message_excerpt ?? ""}`)
    .join("\n\n");

  files["00_asignatura.md"] = [
    `# ${b.course.name}`,
    "",
    [b.course.course_code, b.course.term_name].filter(Boolean).join(" · "),
    b.course.html_url ? `Canvas: ${b.course.html_url}` : "",
    "",
    "## Estructura del curso (módulos)",
    outline || "_Sin módulos sincronizados._",
    "",
    "## Tareas",
    tasks || "_Sin tareas sincronizadas._",
    "",
    "## Anuncios recientes",
    ann || "_Sin anuncios._",
    "",
  ].join("\n");

  for (const s of b.sessions) {
    const base = dated(s.session_at, s.title);
    files[`clases/${base}.md`] = sessionToMarkdown(s, b.course.name, s.transcript);
    for (const n of b.notes.filter((x) => x.session_id === s.id)) {
      files[`apuntes/${base}_${NOTE_LABEL[n.kind]}.md`] = `# ${s.title} — ${NOTE_LABEL[n.kind]}\n\n_Generado con IA a partir de la transcripción; puede contener errores._\n\n${n.content_md}\n`;
    }
  }

  files["LEEME.txt"] = [
    `Fuentes de ${b.course.name} exportadas desde UniHub el ${b.generatedAt.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}.`,
    "",
    "Para NotebookLM: crea un cuaderno para la asignatura y usa «Añadir fuente» → subir archivos.",
    "Sube 00_asignatura.md y los archivos de clases/ y apuntes/ que quieras estudiar.",
    "Si tu cuaderno no admite .md, cambia la extensión a .txt: el contenido es texto plano.",
    "",
    "Contiene transcripciones de clase con nombres de participantes: no lo compartas públicamente.",
  ].join("\n");
  return files;
}
