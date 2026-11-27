import { generatedCover } from "./cover-art";

/** Orden de preferencia de la portada (la generada siempre al final como respaldo). */
export function coverSources(c: { id: string; name: string; cover_url?: string | null; canvas_image_url?: string | null }): string[] {
  return [c.cover_url, c.canvas_image_url, generatedCover(c.id, c.name)].filter((s): s is string => !!s);
}
