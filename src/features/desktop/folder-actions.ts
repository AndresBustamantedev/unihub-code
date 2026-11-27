"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { isDesktop } from "@/lib/desktop";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { downloadPendingMaterials } from "./materials-download";
import { mirrorAll } from "./mirror";

/**
 * Pone al día la carpeta de UniHub: todos los .md de clases y notas, y todo el material de
 * Canvas que falte. Útil al elegir una carpeta nueva o si se borró algo.
 */
export async function refreshFolderAction(): Promise<{ ok: boolean; message: string }> {
  const auth = await requireUser();
  if (!isDesktop() || !auth.ok) return { ok: false, message: "No disponible." };
  const db = await createSupabaseServerClient();
  const md = await mirrorAll(db);
  const files = await downloadPendingMaterials(db, { limit: 150 });
  revalidatePath("/", "layout");
  const parts = [`${md.classes} clases y ${md.materials} notas de material en archivos .md`, `${files.downloaded} archivos de Canvas descargados`];
  if (files.pending) parts.push(`faltan ${files.pending} (se bajarán en las próximas sincronizaciones o pulsando otra vez)`);
  if (files.failed) parts.push(`${files.failed} no se pudieron bajar`);
  return { ok: true, message: `${parts.join(" · ")}.` };
}
