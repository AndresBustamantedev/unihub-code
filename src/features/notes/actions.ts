"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { AI_MODEL_COOKIE } from "@/integrations/ai/shared";
import { mirrorSession } from "@/features/desktop/mirror";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateNote, type GenerateResult } from "./generate";

const schema = z.object({ sessionId: z.uuid(), kind: z.enum(["summary", "questions", "exercises"]), provider: z.enum(["openai", "google"]).nullable() });
const COOLDOWN_MS = 8_000;
const lastCall = new Map<string, number>();

export async function generateNoteAction(sessionId: string, kind: string, provider: string | null = null): Promise<GenerateResult> {
  const parsed = schema.safeParse({ sessionId, kind, provider });
  if (!parsed.success) return { ok: false, error: "Petición no válida." };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: "Sesión caducada." };

  // Evita dobles clics que cuestan dinero.
  const now = Date.now();
  if (now - (lastCall.get(auth.user.id) ?? 0) < COOLDOWN_MS) return { ok: false, error: "Espera unos segundos entre generaciones." };
  lastCall.set(auth.user.id, now);

  const supabase = await createSupabaseServerClient();
  const model = (await cookies()).get(AI_MODEL_COOKIE)?.value ?? null;
  const result = await generateNote(supabase, auth.user.id, parsed.data.sessionId, parsed.data.kind, parsed.data.provider, model);
  if (result.ok) await mirrorSession(supabase, parsed.data.sessionId);
  revalidatePath(`/clases/${parsed.data.sessionId}`);
  return result;
}
