import type { ClassSessionRow, TranscriptRow } from "@/lib/supabase/database.types";
import { formatEventRange } from "@/lib/format";

/** Markdown limpio de una clase: sirve para guardarlo o como fuente de NotebookLM. */
export function sessionToMarkdown(
  s: Pick<ClassSessionRow, "title" | "session_at" | "duration_minutes" | "recording_url" | "topics" | "notes">,
  courseName: string,
  t: Pick<TranscriptRow, "content_text" | "speakers"> | null,
): string {
  const lines = [
    `# ${s.title}`,
    "",
    `- **Asignatura:** ${courseName}`,
    `- **Fecha:** ${formatEventRange(s.session_at, null)}`,
    s.duration_minutes ? `- **Duración:** ${s.duration_minutes} min` : null,
    s.recording_url ? `- **Grabación:** ${s.recording_url}` : null,
    s.topics.length ? `- **Temas detectados:** ${s.topics.join(", ")}` : null,
    t?.speakers.length ? `- **Intervienen:** ${t.speakers.join(", ")}` : null,
    "",
    s.notes ? `## Notas\n\n${s.notes}\n` : null,
    t ? `## Transcripción\n\n${t.content_text.replace(/^([^:\n]{2,80}):\s/gm, "**$1:** ")}\n` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function safeFilename(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._ -]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80) || "clase"
  );
}
