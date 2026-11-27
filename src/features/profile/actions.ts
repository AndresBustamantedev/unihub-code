"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOptionalServerEnv } from "@/lib/env/server";
import { openSecret, parseKey, sealSecret } from "@/lib/secrets/vault";

export interface LoginState {
  error?: string;
  ok?: boolean;
}

/** Solo el usuario (correo) de la universidad. La contraseña no se guarda nunca. */
const schema = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Escribe tu usuario completo, por ejemplo tu-usuario@tu-universidad.es.");

export async function saveUniversityLoginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };
  const parsed = schema.safeParse(formData.get("university_login") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dato no válido." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ university_login: parsed.data || null }).eq("id", auth.user.id);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/ajustes");
  revalidatePath("/clases");
  return { ok: true };
}

export interface SecretState {
  error?: string;
  ok?: "saved" | "deleted";
}

function vaultKey() {
  return parseKey(getOptionalServerEnv().CREDENTIALS_ENCRYPTION_KEY);
}

/**
 * Guarda la contraseña de la universidad cifrada. Nunca se escribe en logs ni se
 * devuelve a la página: solo se descifra al pulsar «Copiar contraseña».
 */
export async function saveUniversitySecretAction(_prev: SecretState, formData: FormData): Promise<SecretState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };
  const key = vaultKey();
  if (!key) return { error: "Falta CREDENTIALS_ENCRYPTION_KEY en .env.local (32 bytes en base64)." };
  const supabase = await createSupabaseServerClient();
  if (formData.get("intent") === "delete") {
    const { error } = await supabase.from("profiles").update({ university_secret: null }).eq("id", auth.user.id);
    if (error) return { error: "No se pudo borrar." };
    revalidatePath("/ajustes");
    revalidatePath("/clases");
    return { ok: "deleted" };
  }
  const value = String(formData.get("secret") ?? "");
  if (!value || value.length > 256) return { error: "Escribe la contraseña (máximo 256 caracteres)." };
  const { error } = await supabase.from("profiles").update({ university_secret: sealSecret(value, key, auth.user.id) }).eq("id", auth.user.id);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/ajustes");
  revalidatePath("/clases");
  return { ok: "saved" };
}

/** Descifra la contraseña solo para el usuario con sesión, en el momento de copiarla. */
export async function revealUniversitySecretAction(): Promise<{ value?: string; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada." };
  const key = vaultKey();
  if (!key) return { error: "Falta la clave de cifrado en el servidor." };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("university_secret").eq("id", auth.user.id).maybeSingle();
  if (!data?.university_secret) return { error: "No hay contraseña guardada." };
  const value = openSecret(data.university_secret, key, auth.user.id);
  return value === null ? { error: "No se pudo descifrar (¿cambió la clave?). Vuelve a guardarla en Ajustes." } : { value };
}
