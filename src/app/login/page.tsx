import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && /^\/(?!\/)[\w\-/]*$/.test(next) ? next : "/";
  // Con sesión válida no tiene sentido mostrar el formulario.
  const auth = await requireUser();
  if (auth.ok) redirect(safeNext);
  if (auth.reason === "forbidden") redirect("/acceso-denegado");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="text-2xl font-bold tracking-tight">
          Uni<span className="text-primary">Hub</span>
        </p>
        <p className="text-sm text-muted-foreground">Tu curso en un vistazo. Entra con la cuenta de UniHub, no con la de la universidad.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
