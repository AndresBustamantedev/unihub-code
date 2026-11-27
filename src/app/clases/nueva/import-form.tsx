"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { importClassAction, type ImportState } from "@/features/classes/actions";
import { parseRecordingName, suggestCourse } from "@/features/classes/suggest";

interface CourseOpt {
  id: string;
  name: string;
  course_code: string | null;
}

const input = "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";


export function ImportForm({ courses, defaultCourseId, defaultDate, defaultTitle = "" }: { courses: CourseOpt[]; defaultCourseId: string | null; defaultDate: string; defaultTitle?: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importClassAction, {});
  const [courseId, setCourseId] = useState(defaultCourseId ?? "");
  const [title, setTitle] = useState(defaultTitle);
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [date, setDate] = useState(defaultDate);
  const [dateHint, setDateHint] = useState<string | null>(null);

  /** Rellena asignatura, título y fecha a partir del nombre de la grabación/archivo (sin pisar lo ya escrito). */
  const autofill = (source: string, origin: string) => {
    const info = parseRecordingName(source);
    const s = suggestCourse(info.name, courses);
    const course = s ?? courses.find((c) => c.id === courseId) ?? null;
    if (s && !courseId) {
      setCourseId(s.id);
      setHint(`Asignatura sugerida por ${origin}: ${s.course_code ?? s.name}`);
    }
    if (!title) {
      const day = info.localDate ? new Date(`${info.localDate}:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : null;
      const base = info.title.length > 4 ? info.title : course?.course_code ?? info.title;
      setTitle([base, day].filter(Boolean).join(" · ").slice(0, 300));
    }
    if (info.localDate && date === defaultDate) {
      setDate(info.localDate);
      setDateHint("Fecha tomada del nombre de la grabación; comprueba la hora.");
    }
  };

  const onFile = (file: File | undefined) => {
    if (file) autofill(file.name, "el nombre del archivo");
  };

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Asignatura
          <select name="course_id" required value={courseId} onChange={(e) => setCourseId(e.target.value)} className={input}>
            <option value="" disabled>Elige…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Título
          <input name="title" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tema 4 · Subredes" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Fecha y hora (Madrid)
          <input name="session_at" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          {dateHint && <span className="text-xs text-muted-foreground">{dateHint}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Duración (min, opcional)
          <input name="duration_minutes" type="number" min={0} max={1440} placeholder="se calcula de la transcripción" className={input} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Enlace a la grabación (opcional)
        <input
          name="recording_url"
          type="url"
          placeholder="https://…sharepoint.com/…/stream.aspx?id=…"
          onBlur={(e) => e.target.value.startsWith("https://") && autofill(e.target.value, "la URL de la grabación")}
          className={input}
        />
        <span className="text-xs text-muted-foreground">Pega la URL de Stream: se rellenan solas la asignatura y la fecha. Solo se guarda el enlace.</span>
      </label>

      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm">Transcripción (opcional)</legend>
        <div className="flex gap-1">
          {(["file", "paste"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 text-sm ${mode === m ? "bg-muted font-medium" : "text-muted-foreground"}`}>
              {m === "file" ? "Archivo .vtt / .docx / .txt" : "Pegar texto"}
            </button>
          ))}
        </div>
        {mode === "file" ? (
          <input name="file" type="file" accept=".vtt,.docx,.txt,text/vtt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        ) : (
          <textarea name="pasted" rows={8} placeholder="Pega aquí la transcripción" className="rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        )}
        <span className="text-xs text-muted-foreground">Se guarda el texto limpio (sin marcas de tiempo), no el archivo. Máx. 3,5 MB.</span>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        Notas (opcional)
        <textarea name="notes" rows={3} maxLength={5000} className="rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>

      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Importando…" : "Importar clase"}</Button>
      </div>
    </form>
  );
}
