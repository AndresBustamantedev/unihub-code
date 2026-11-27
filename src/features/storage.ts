import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Cuota de base de datos del plan gratuito de Supabase. */
export const FREE_DB_QUOTA_BYTES = 500 * 1024 * 1024;

const LABEL: Record<string, string> = {
  transcripts: "Transcripciones",
  study_notes: "Apuntes con IA",
  class_sessions: "Clases",
  assignments: "Tareas",
  announcements: "Anuncios",
  course_modules: "Módulos",
  course_module_items: "Elementos de módulos",
  canvas_conversations: "Mensajes",
  canvas_activity: "Notificaciones de Canvas",
  changes: "Historial de novedades",
  sync_runs: "Registro técnico",
};

export interface StorageUsage {
  databaseBytes: number;
  appBytes: number;
  quotaBytes: number;
  top: { label: string; bytes: number }[];
}

export async function getStorageUsage(db: SupabaseClient<Database>): Promise<StorageUsage | null> {
  const { data, error } = await db.rpc("storage_usage");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as { database_bytes?: number; tables?: { name: string; bytes: number }[] };
  const tables = d.tables ?? [];
  return {
    databaseBytes: Number(d.database_bytes ?? 0),
    appBytes: tables.reduce((n, t) => n + Number(t.bytes), 0),
    quotaBytes: FREE_DB_QUOTA_BYTES,
    top: tables.slice(0, 5).map((t) => ({ label: LABEL[t.name] ?? t.name, bytes: Number(t.bytes) })),
  };
}
