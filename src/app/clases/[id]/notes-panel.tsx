import { Markdown } from "@/components/app/markdown";
import type { NoteKind, StudyNoteRow } from "@/lib/supabase/database.types";
import { timeAgo } from "@/lib/format";
import { GenerateButton } from "./generate-button";
import { AiProviderPicker } from "@/components/app/ai-provider-picker";
import type { PublicProvider } from "@/integrations/ai/shared";

const KINDS: { kind: NoteKind; title: string; hint: string }[] = [
  { kind: "summary", title: "Resumen y apuntes", hint: "Resumen, conceptos clave, definiciones y avisos mencionados." },
  { kind: "questions", title: "Preguntas de repaso", hint: "10 preguntas con respuesta, incluidas algunas tipo test." },
  { kind: "exercises", title: "Ejercicios prácticos", hint: "4 ejercicios con pista y solución." },
];

export function NotesPanel({
  sessionId,
  notes,
  currentHash,
  aiReady,
  aiReason,
  hasTranscript,
  providers,
  preferred,
  preferredModel,
}: {
  sessionId: string;
  notes: StudyNoteRow[];
  currentHash: string | null;
  aiReady: boolean;
  aiReason: string | null;
  hasTranscript: boolean;
  providers: PublicProvider[];
  preferred: string | null;
  preferredModel?: string | null;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Apuntes con IA</h2>
        {!hasTranscript ? (
          <span className="text-xs text-muted-foreground">Necesita transcripción.</span>
        ) : aiReady ? (
          <AiProviderPicker providers={providers} initial={preferred} initialModel={preferredModel} />
        ) : (
          <span className="text-xs text-muted-foreground">IA no configurada: {aiReason}</span>
        )}
      </div>
      {KINDS.map(({ kind, title, hint }) => {
        const note = notes.find((n) => n.kind === kind);
        const stale = note && currentHash && note.input_hash !== currentHash;
        return (
          <details key={kind} open={!!note && kind === "summary"} className="rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <span className="text-sm font-medium">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {note ? `Generado ${timeAgo(note.created_at)} · ${note.model}${stale ? " · la transcripción cambió desde entonces" : ""}` : hint}
                </span>
              </span>
              <GenerateButton sessionId={sessionId} kind={kind} exists={!!note} disabled={!aiReady || !hasTranscript} />
            </summary>
            {note && (
              <div className="border-t border-border px-3 py-2">
                <Markdown>{note.content_md}</Markdown>
                <p className="mt-2 text-xs text-muted-foreground">Generado por IA a partir de una transcripción automática (con los nombres anonimizados): puede contener errores. Contrástalo con el material oficial.</p>
              </div>
            )}
          </details>
        );
      })}
    </section>
  );
}
