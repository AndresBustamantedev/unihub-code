import { z } from "zod";

/**
 * Variables que el navegador puede ver. Solo URL y clave publishable de
 * Supabase, que son públicas por diseño. NUNCA añadir credenciales aquí.
 * Next sustituye `process.env.NEXT_PUBLIC_*` en build, por eso se leen una a una.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type PublicEnv = z.infer<typeof schema>;

let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuración pública de Supabase inválida o ausente: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
