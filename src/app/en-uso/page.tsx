import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "UniHub ya está abierto" };
export const dynamic = "force-dynamic";

/** La base de datos local está abierta en otro proceso: UniHub no abre una segunda copia. */
export default function EnUso() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-xl font-bold tracking-tight">UniHub ya está abierto en otro sitio</h1>
      <p className="text-sm text-muted-foreground">
        Tus datos los está usando otro UniHub en este ordenador. Para no estropearlos, este no los abre a la vez.
      </p>
      <p className="text-sm text-muted-foreground">
        Cierra el otro: icono de UniHub junto al reloj → Salir (si hay más de uno, todos). Si no ves ninguno, espera 2 minutos: el
        candado se libera solo cuando el otro proceso ya no está.
      </p>
      <Link href="/" className="w-fit rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
        Volver a intentarlo
      </Link>
    </main>
  );
}
