import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-2 px-4">
      <h1 className="text-lg font-semibold">Enlace no válido</h1>
      <p className="text-sm text-muted-foreground">El enlace ha caducado o ya se usó. Solicita uno nuevo.</p>
      <Link className="text-sm underline" href="/login">Volver al acceso</Link>
    </main>
  );
}
