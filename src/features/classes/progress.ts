import type { ClassSessionRow } from "@/lib/supabase/database.types";

type StudyFields = Pick<ClassSessionRow, "watched_at" | "understanding" | "review_state">;

/**
 * Estado de estudio de una clase, de menos a más avanzado:
 * - unwatched: aún no la has visto
 * - watched: vista, sin valorar si la entendiste
 * - unclear: no la entendiste
 * - reviewing: la estás repasando (o la entendiste solo a medias)
 * - mastered: entendida o repaso terminado
 */
export type StudyStatus = "unwatched" | "watched" | "unclear" | "reviewing" | "mastered";

export function studyStatus(s: StudyFields): StudyStatus {
  if (s.review_state === "done") return "mastered";
  if (s.review_state === "reviewing") return "reviewing";
  if (s.understanding === "low") return "unclear";
  if (s.understanding === "mid") return "reviewing";
  if (s.understanding === "high") return "mastered";
  return s.watched_at ? "watched" : "unwatched";
}

export const STUDY_LABEL: Record<StudyStatus, string> = {
  unwatched: "Sin ver",
  watched: "Vista",
  unclear: "No la entendí",
  reviewing: "Repasando",
  mastered: "Entendida",
};

export type StudyFilter = "todas" | "sin-ver" | "repasar" | "entendidas";
export const STUDY_FILTERS: ReadonlyArray<{ id: StudyFilter; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "sin-ver", label: "Sin ver" },
  { id: "repasar", label: "Por repasar" },
  { id: "entendidas", label: "Entendidas" },
];

export function parseStudyFilter(v: string | undefined): StudyFilter {
  return STUDY_FILTERS.some((f) => f.id === v) ? (v as StudyFilter) : "todas";
}

export function matchesFilter(s: StudyFields, f: StudyFilter): boolean {
  const st = studyStatus(s);
  switch (f) {
    case "todas":
      return true;
    case "sin-ver":
      return st === "unwatched";
    case "repasar":
      return st === "unclear" || st === "reviewing";
    case "entendidas":
      return st === "mastered";
  }
}

export interface CourseProgress {
  total: number;
  watched: number;
  unwatched: number;
  toReview: number;
  mastered: number;
  /** Todas vistas y ninguna sin entender. */
  upToDate: boolean;
}

export function courseProgress(sessions: ReadonlyArray<StudyFields>): CourseProgress {
  let watched = 0;
  let toReview = 0;
  let mastered = 0;
  for (const s of sessions) {
    const st = studyStatus(s);
    if (st !== "unwatched") watched++;
    if (st === "unclear" || st === "reviewing") toReview++;
    if (st === "mastered") mastered++;
  }
  const total = sessions.length;
  return { total, watched, unwatched: total - watched, toReview, mastered, upToDate: total > 0 && watched === total && toReview === 0 };
}
