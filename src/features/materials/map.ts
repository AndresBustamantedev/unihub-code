import type { ChangeKind, Json } from "@/lib/supabase/database.types";

export interface MaterialChange {
  kind: Extract<ChangeKind, "new_file" | "module_updated">;
  entity_type: "file" | "module";
  external_id: number;
  title: string;
  detail: Json;
  dedupe_key: string;
}

export interface FileLite {
  external_id: number;
  display_name: string;
  html_url: string | null;
}

export interface ModuleLite {
  external_id: number;
  name: string;
  html_url: string | null;
}

export interface ItemLite {
  external_id: number;
  module_external_id: number;
  title: string;
  item_type: string;
}

const MAX_TITLES = 8;

/**
 * Novedades de materiales respecto a lo ya conocido.
 * - Archivo nuevo → una novedad por archivo.
 * - Módulo nuevo o con ítems nuevos → UNA novedad por módulo con la lista de lo añadido.
 * `baseline` (primera sincronización de la asignatura) no genera nada.
 */
export function diffMaterials(args: {
  baseline: boolean;
  knownFileIds: Set<number>;
  files: FileLite[];
  knownModuleIds: Set<number>;
  modules: ModuleLite[];
  knownItemIds: Set<number>;
  items: ItemLite[];
}): MaterialChange[] {
  if (args.baseline) return [];
  const out: MaterialChange[] = [];

  for (const f of args.files) {
    if (!args.knownFileIds.has(f.external_id)) {
      out.push({ kind: "new_file", entity_type: "file", external_id: f.external_id, title: f.display_name, detail: { url: f.html_url }, dedupe_key: "" });
    }
  }

  for (const m of args.modules) {
    const added = args.items.filter((i) => i.module_external_id === m.external_id && !args.knownItemIds.has(i.external_id) && i.item_type !== "SubHeader");
    const isNew = !args.knownModuleIds.has(m.external_id);
    if (!isNew && added.length === 0) continue;
    out.push({
      kind: "module_updated",
      entity_type: "module",
      external_id: m.external_id,
      title: m.name,
      detail: {
        new_module: isNew,
        added: added.slice(0, MAX_TITLES).map((i) => i.title),
        added_count: added.length,
        url: m.html_url,
      },
      dedupe_key: isNew ? "new" : added.map((i) => i.external_id).sort((a, b) => a - b).join(","),
    });
  }
  return out;
}

export interface TopicModule {
  id: string;
  external_id: number;
  name: string;
  position: number | null;
  unlock_at: string | null;
  state: string | null;
}

export interface TopicItem {
  module_id: string;
  item_type: string;
  content_id: number | null;
}

export interface CurrentTopic {
  module: TopicModule;
  reason: string;
}

/**
 * "Tema actual" de una asignatura, por orden de fiabilidad:
 * 1. Módulo en curso según el progreso de Canvas (state = started).
 * 2. Módulo que contiene la próxima entrega pendiente.
 * 3. Último módulo desbloqueado por fecha.
 * Si nada de eso existe, devuelve null: no se adivina.
 */
export function currentTopic(
  modules: TopicModule[],
  items: TopicItem[],
  nextAssignmentExternalId: number | null,
  now: Date = new Date(),
): CurrentTopic | null {
  const sorted = [...modules].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const started = sorted.filter((m) => m.state === "started");
  if (started.length > 0) return { module: started[started.length - 1]!, reason: "En curso según tu progreso en Canvas" };

  if (nextAssignmentExternalId !== null) {
    const item = items.find((i) => (i.item_type === "Assignment" || i.item_type === "Quiz") && i.content_id === nextAssignmentExternalId);
    const mod = item && sorted.find((m) => m.id === item.module_id);
    if (mod) return { module: mod, reason: "Contiene tu próxima entrega" };
  }

  const unlockedByDate = sorted.filter((m) => m.unlock_at && new Date(m.unlock_at) <= now);
  if (unlockedByDate.length > 0) {
    const latest = unlockedByDate.reduce((a, b) => (new Date(b.unlock_at!) > new Date(a.unlock_at!) ? b : a));
    return { module: latest, reason: "Último módulo abierto por fecha" };
  }
  return null;
}
