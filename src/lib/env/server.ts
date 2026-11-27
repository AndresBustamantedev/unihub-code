import "server-only";
import { z } from "zod";

/**
 * Configuración de servidor. Importar este módulo desde un componente de
 * cliente rompe el build (gracias a `server-only`), que es lo que queremos.
 */
/** En el programa de escritorio puede valer "*": cualquier usuario con cuenta en el proyecto de Supabase. */
const isDesktopProcess = () => process.env.UNIHUB_DESKTOP === "1";

const appSchema = z.object({
  APP_URL: z.url(),
  ALLOWED_EMAILS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.union([z.email(), z.literal("*")])).min(1))
    .refine((list) => !list.includes("*") || isDesktopProcess(), "«*» solo se admite en el programa de escritorio"),
});

export type AppEnv = z.infer<typeof appSchema>;

let appCached: AppEnv | undefined;

/** Variables de servidor que faltan o tienen mal formato (solo nombres, nunca valores). */
export function appEnvProblems(): string[] {
  const parsed = appSchema.safeParse({ APP_URL: process.env.APP_URL, ALLOWED_EMAILS: process.env.ALLOWED_EMAILS });
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
}

export function getAppEnv(): AppEnv {
  if (appCached) return appCached;
  const parsed = appSchema.safeParse({
    APP_URL: process.env.APP_URL,
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    // Solo nombres de variables, nunca valores.
    throw new Error(`Configuración del servidor inválida o ausente: ${fields}`);
  }
  appCached = parsed.data;
  return appCached;
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getAppEnv().ALLOWED_EMAILS;
  return list.includes("*") || list.includes(email.trim().toLowerCase());
}

/** Opcionales: si faltan, la funcionalidad correspondiente se desactiva con un aviso claro. */
export function getOptionalServerEnv() {
  const s = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    SUPABASE_SECRET_KEY: s(process.env.SUPABASE_SECRET_KEY),
    CRON_SECRET: s(process.env.CRON_SECRET),
    VAPID_PUBLIC_KEY: s(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: s(process.env.VAPID_PRIVATE_KEY),
    VAPID_SUBJECT: s(process.env.VAPID_SUBJECT) ?? "mailto:unihub@localhost",
    CREDENTIALS_ENCRYPTION_KEY: s(process.env.CREDENTIALS_ENCRYPTION_KEY),
  };
}
