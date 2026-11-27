import type { Database } from "@/lib/supabase/database.types";

export type Table = keyof Database["public"]["Tables"];

/**
 * Tablas que se copian entre la web (Supabase) y el programa de escritorio, en orden de
 * referencias (primero asignaturas, luego lo que cuelga de ellas).
 */
export const SYNCED_TABLES: Table[] = [
  "courses",
  "assignments",
  "announcements",
  "course_modules",
  "course_module_items",
  "course_files",
  "course_pages",
  "calendar_events",
  "course_people",
  "class_schedule",
  "class_skips",
  "class_sessions",
  "transcripts",
  "study_notes",
  "class_resources",
  "material_notes",
  "material_texts",
  "changes",
  "canvas_conversations",
  "canvas_activity",
  "flashcards",
  "flashcard_reviews",
  "exams",
];

/** Contenido que crea el usuario (clases, apuntes, notas, enlaces): lo que no se puede volver a traer de Canvas. */
export const OWN_CONTENT: Table[] = ["class_sessions", "study_notes", "material_notes", "class_resources", "flashcards"];

/** Columnas con rutas de este ordenador: no tienen sentido en la web. */
export const LOCAL_ONLY_COLUMNS = ["local_video", "local_path"];
