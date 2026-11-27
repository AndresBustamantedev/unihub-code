"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearFails, isLocked, recordFail } from "@/lib/auth/attempts";
import { requireUser } from "@/lib/auth/guard";
import { appEnvProblems, isEmailAllowed } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/redact";

export interface LoginState {
  error?: string;
}

const inputSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().regex(/^\/(?!\/)[\w\-/]*$/).max(200).catch("/"),
});

const BAD_CREDENTIALS = "Correo o contraseña incorrectos.";

export async function signInWithPasswordAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = inputSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") ?? "/" });
  if (!parsed.success) return { error: "Introduce tu correo y tu contraseña." };
  const email = parsed.data.email.trim().toLowerCase();

  if (isLocked(email)) return { error: "Demasiados intentos fallidos. Espera 15 minutos." };
  const problems = appEnvProblems();
  if (problems.length) {
    logger.error("login_config_invalid", { fields: problems.join(",") });
    return { error: `El servidor no está bien configurado: revisa ${problems.join(" y ")} en las variables de entorno y vuelve a desplegar.` };
  }
  // Mismo mensaje para correos no autorizados: no se revela quién tiene cuenta.
  if (!isEmailAllowed(email)) {
    recordFail(email);
    await new Promise((r) => setTimeout(r, 400));
    return { error: BAD_CREDENTIALS };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    recordFail(email);
    logger.warn("password_login_failed", { code: error.code ?? null, status: error.status ?? null });
    if (error.status === 429) return { error: "Demasiados intentos. Espera unos minutos." };
    return { error: BAD_CREDENTIALS };
  }
  clearFails(email);
  redirect(parsed.data.next);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export interface PasswordState {
  ok?: boolean;
  error?: string;
}

const passwordSchema = z
  .object({ password: z.string().min(10, "Mínimo 10 caracteres.").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden.", path: ["confirm"] });

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const auth = await requireUser();
  if (!auth.ok) return { error: "Sesión caducada: vuelve a entrar." };
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Contraseña no válida." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("password_change_failed", { code: error.code ?? null });
    if (error.code === "same_password") return { error: "Es la misma contraseña que ya tienes." };
    if (error.code === "weak_password") return { error: "Contraseña demasiado débil: usa más longitud y mezcla de caracteres." };
    if (error.code === "reauthentication_needed") return { error: "Supabase pide volver a identificarte: cierra sesión, entra de nuevo y repite." };
    return { error: "No se pudo cambiar la contraseña." };
  }
  return { ok: true };
}
