import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = { title: "Acceso denegado" };

async function logoutAction() {
  "use server";
  await signOut();
  redirect("/login");
}

export default function AccesoDenegado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-bold tracking-tight">Acceso denegado</h1>
      <p className="text-sm text-muted-foreground">Esta cuenta no está autorizada en UniHub (no figura en ALLOWED_EMAILS).</p>
      <form action={logoutAction}>
        <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cerrar sesión</button>
      </form>
    </main>
  );
}
