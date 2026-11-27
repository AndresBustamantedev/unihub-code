export interface FileEntry {
  id: string;
  title: string;
  module_id: string;
  modulePosition: number;
  position: number;
}

export interface FileNeighbors {
  prev: FileEntry | null;
  next: FileEntry | null;
  /** Posición (1…n) dentro de la asignatura. */
  index: number;
  total: number;
  /** Posición dentro del tema (módulo) y nº de archivos del tema. */
  inModule: { index: number; total: number };
}

/** Orden de lectura: tema a tema y, dentro de cada tema, en el orden de Canvas. */
export function orderFiles(files: FileEntry[]): FileEntry[] {
  return [...files].sort((a, b) => a.modulePosition - b.modulePosition || a.position - b.position || a.title.localeCompare(b.title));
}

export function neighborsOf(files: FileEntry[], id: string): FileNeighbors | null {
  const ordered = orderFiles(files);
  const i = ordered.findIndex((f) => f.id === id);
  if (i < 0) return null;
  const current = ordered[i]!;
  const sameModule = ordered.filter((f) => f.module_id === current.module_id);
  return {
    prev: ordered[i - 1] ?? null,
    next: ordered[i + 1] ?? null,
    index: i + 1,
    total: ordered.length,
    inModule: { index: sameModule.findIndex((f) => f.id === id) + 1, total: sameModule.length },
  };
}
