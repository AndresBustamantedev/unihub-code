"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { isDesktop } from "@/lib/desktop";
import { checkpointLocalDb } from "@/lib/local-db/pg";
import { logger } from "@/lib/redact";
import { createRemoteSupabaseClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { describeResult, exportLocalToWeb, writeCloudState, type ExportResult, type LooseDb } from "./cloud-export";

/** Botón «Subir mis datos a la web». `force` tras confirmar el aviso de borrado. */
export async function exportToWebAction(force = false): Promise<ExportResult> {
  if (!isDesktop()) return { ok: false, error: "Solo disponible en el programa de escritorio." };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };
  const uid = auth.user.id;
  let r: ExportResult;
  try {
    await checkpointLocalDb(uid);
    r = await exportLocalToWeb({
      uid,
      local: (await createSupabaseServerClient()) as unknown as LooseDb,
      remote: (await createRemoteSupabaseClient()) as unknown as LooseDb,
      force,
    });
  } catch (err) {
    logger.error("cloud_export_failed", { error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    r = { ok: false, error: `No se pudo completar la subida (${err instanceof Error ? err.message.slice(0, 120) : "error"}). Vuelve a intentarlo: lo que ya se subió se mantiene.` };
  }
  if (!("needsConfirm" in r && r.needsConfirm)) writeCloudState(uid, { lastAt: new Date().toISOString(), lastOk: r.ok, lastResult: describeResult(r) });
  revalidatePath("/ajustes");
  return r;
}

/** Subida automática una vez al día (junto con la copia de seguridad). */
export async function setCloudDailyAction(on: boolean): Promise<{ ok: boolean }> {
  if (!isDesktop()) return { ok: false };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false };
  writeCloudState(auth.user.id, { daily: !!on });
  revalidatePath("/ajustes");
  return { ok: true };
}
