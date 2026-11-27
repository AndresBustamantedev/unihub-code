"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { isDesktop } from "@/lib/desktop";
import { logger } from "@/lib/redact";
import { mirrorAll } from "./mirror";
import { checkpointLocalDb } from "@/lib/local-db/pg";
import { OWN_CONTENT, SYNCED_TABLES as TABLES, type Table } from "./tables";
import { createRemoteSupabaseClient, createSupabaseServerClient } from "@/lib/supabase/server";

/** Lo que viene de Canvas sin intervención del usuario: se puede borrar y volver a traer. */
const RESYNCABLE: Table[] = ["courses", "changes", "canvas_conversations", "canvas_activity", "sync_runs", "notifications"];

const PAGE = 500;
const CHUNK = 50;

/** Acceso genérico por nombre de tabla (las tablas se recorren en bucle). */
type Loose = {
  from(t: string): {
    select(c: string, o?: { count: "exact"; head: true }): Promise<{ count: number | null }> & {
      eq(c: string, v: string): { order(c: string): { range(a: number, b: number): Promise<{ data: unknown[] | null; error: { message: string } | null }> } };
    };
    delete(): { eq(c: string, v: string): Promise<unknown> };
    upsert(rows: unknown[], o: { onConflict: string; ignoreDuplicates: boolean }): Promise<{ error: { message: string } | null }>;
  };
};

export type ImportResult = { ok: true; rows: number; tables: number } | { ok: false; error: string };

/**
 * Copia una sola vez los datos de la web (Supabase) a la base de datos local del programa:
 * clases, transcripciones, apuntes, notas, progreso… Supabase no se modifica.
 */
export async function importFromWebAction(): Promise<ImportResult> {
  if (!isDesktop()) return { ok: false, error: "Solo disponible en el programa de escritorio." };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  const uid = auth.user.id;
  const remoteClient = await createRemoteSupabaseClient();
  const localClient = await createSupabaseServerClient();
  const remote = remoteClient as unknown as Loose;
  const local = localClient as unknown as Loose;

  for (const t of OWN_CONTENT) {
    const { count } = await local.from(t).select("id", { count: "exact", head: true });
    if (count) return { ok: false, error: "Este ordenador ya tiene clases o apuntes propios: la importación solo se puede hacer en un programa recién instalado." };
  }

  // Lo sincronizado desde Canvas en el programa se sustituye por lo de la web (mismos datos, mismos identificadores).
  for (const t of RESYNCABLE) await local.from(t).delete().eq("user_id", uid);

  let rows = 0;
  let tables = 0;
  try {
    for (const t of TABLES) {
      let imported = 0;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await remote.from(t).select("*").eq("user_id", uid).order("id").range(from, from + PAGE - 1);
        if (error) throw new Error(`${t}: ${error.message}`);
        const page = (data ?? []) as Record<string, unknown>[];
        for (let i = 0; i < page.length; i += CHUNK) {
          const { error: insError } = await local.from(t).upsert(page.slice(i, i + CHUNK), { onConflict: "id", ignoreDuplicates: true });
          if (insError) throw new Error(`${t}: ${insError.message}`);
        }
        imported += page.length;
        if (page.length < PAGE) break;
      }
      rows += imported;
      if (imported) tables++;
    }
    // Del perfil solo el usuario de la universidad: la contraseña guardada está cifrada con la clave
    // de la web y aquí no se podría leer (se vuelve a guardar en Ajustes si se quiere).
    const { data: profile } = await remoteClient.from("profiles").select("university_login").eq("id", uid).maybeSingle();
    if (profile?.university_login) await localClient.from("profiles").update({ university_login: profile.university_login }).eq("id", uid);
  } catch (err) {
    logger.error("desktop_import_failed", { error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    return { ok: false, error: `No se pudo completar la importación (${err instanceof Error ? err.message.slice(0, 120) : "error"}). Puedes volver a intentarlo.` };
  }
  // Se consolida en disco y se copia también en archivos .md todo lo importado.
  await checkpointLocalDb(uid);
  await mirrorAll(localClient);
  revalidatePath("/", "layout");
  return { ok: true, rows, tables };
}
