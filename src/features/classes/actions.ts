"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import mammoth from "mammoth";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { madridLocalToIso } from "@/lib/format";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePlain, parseTranscript, parseTeamsText, type ParsedTranscript } from "./parse";
import { extractTopics } from "./topics";
import { mirrorSession } from "@/features/desktop/mirror";

const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
const MAX_TEXT_CHARS = 600_000;

export interface ImportState {
  error?: string;
}

const fieldsSchema = z.object({
  course_id: z.uuid({ error: "Elige una asignatura." }),
  title: z.string().trim().min(1, "Pon un título.").max(300),
  session_at: z.string().transform((v, ctx) => {
    const iso = madridLocalToIso(v);
    if (!iso) ctx.addIssue({ code: "custom", message: "Fecha no válida." });
    return iso ?? "";
  }),
  duration_minutes: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(0).max(1440).nullable()),
  recording_url: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.url({ protocol: /^https$/, error: "El enlace debe empezar por https://" }).max(2000).nullable()),
  notes: z.string().trim().max(5000).transform((v) => (v === "" ? null : v)),
  pasted: z.string().max(MAX_TEXT_CHARS, "El texto pegado es demasiado largo."),
});

async function readTranscript(file: File | null, pasted: string): Promise<{ parsed: ParsedTranscript; format: "vtt" | "docx" | "txt" | "paste" } | { error: string } | null> {
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { error: "El archivo supera 3,5 MB." };
    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    if (name.endsWith(".docx")) {
      try {
        const { value } = await mammoth.extractRawText({ buffer: buf });
        return { parsed: parseTeamsText(value), format: "docx" };
      } catch {
        return { error: "No se pudo leer el .docx." };
      }
    }
    if (name.endsWith(".vtt") || name.endsWith(".txt")) {
      const r = parseTranscript(buf.toString("utf8"));
      return { parsed: r, format: r.format === "vtt" ? "vtt" : "txt" };
    }
    return { error: "Formato no admitido: usa .vtt, .docx o .txt." };
  }
  if (pasted.trim()) {
    const r = parseTranscript(pasted);
    return { parsed: r.format === "plain" ? parsePlain(pasted) : r, format: "paste" };
  }
  return null;
}

export async function importClassAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };

  const parsed = fieldsSchema.safeParse({
    course_id: formData.get("course_id"),
    title: formData.get("title") ?? "",
    session_at: formData.get("session_at") ?? "",
    duration_minutes: formData.get("duration_minutes") ?? "",
    recording_url: formData.get("recording_url") ?? "",
    notes: formData.get("notes") ?? "",
    pasted: formData.get("pasted") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const f = parsed.data;

  const fileEntry = formData.get("file");
  const transcript = await readTranscript(fileEntry instanceof File ? fileEntry : null, f.pasted);
  if (transcript && "error" in transcript) return { error: transcript.error };
  if (!transcript && !f.recording_url) return { error: "Añade una transcripción o un enlace a la grabación." };
  if (transcript && transcript.parsed.wordCount === 0) return { error: "La transcripción está vacía tras limpiarla." };
  if (transcript && transcript.parsed.text.length > MAX_TEXT_CHARS) return { error: "La transcripción es demasiado larga." };

  const supabase = await createSupabaseServerClient();
  const { data: course } = await supabase.from("courses").select("id").eq("id", f.course_id).maybeSingle();
  if (!course) return { error: "Asignatura no encontrada." };

  const { data: session, error } = await supabase
    .from("class_sessions")
    .insert({
      user_id: auth.user.id,
      course_id: f.course_id,
      title: f.title,
      session_at: f.session_at,
      duration_minutes: f.duration_minutes ?? transcript?.parsed.durationMinutes ?? null,
      recording_url: f.recording_url,
      notes: f.notes,
      topics: transcript ? extractTopics(transcript.parsed.text) : [],
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !session) {
    logger.error("class_insert_failed", { code: error?.code ?? null });
    return { error: "No se pudo guardar la clase." };
  }

  if (transcript) {
    const { error: tErr } = await supabase.from("transcripts").insert({
      user_id: auth.user.id,
      session_id: session.id,
      source_format: transcript.format,
      content_text: transcript.parsed.text,
      word_count: transcript.parsed.wordCount,
      speakers: transcript.parsed.speakers.slice(0, 50),
    });
    if (tErr) {
      await supabase.from("class_sessions").delete().eq("id", session.id);
      logger.error("transcript_insert_failed", { code: tErr.code ?? null });
      return { error: "No se pudo guardar la transcripción." };
    }
  }

  // Programa de escritorio: también como archivos .md en la carpeta de UniHub.
  await mirrorSession(supabase, session.id);
  revalidatePath("/clases");
  revalidatePath("/");
  redirect(`/clases/${session.id}`);
}

export async function deleteClassAction(id: string): Promise<void> {
  const auth = await requireUser();
  if (!auth.ok || !z.uuid().safeParse(id).success) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("class_sessions").delete().eq("id", id); // la transcripción cae en cascada
  revalidatePath("/clases");
  revalidatePath("/");
  redirect("/clases");
}
