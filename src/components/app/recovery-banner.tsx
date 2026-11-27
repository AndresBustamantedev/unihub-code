import { dismissRecoveryAction } from "@/features/desktop/recovery-actions";
import type { RecoveryNote } from "@/lib/local-db/pg";
import { PendingButton } from "./pending-button";

/** Programa de escritorio: la base de datos local tuvo que recuperarse al abrirla. */
export function RecoveryBanner({ note }: { note: RecoveryNote }) {
  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-950/40" role="alert">
      <p className="font-semibold text-amber-950 dark:text-amber-100">La base de datos de este ordenador se ha recuperado</p>
      <p className="mt-1 text-amber-950/80 dark:text-amber-100/80">
        No se podía abrir (probablemente el programa se cerró de golpe).{" "}
        {note.mode === "backup"
          ? `Se ha restaurado la copia de seguridad «${note.backup}»: lo hecho después de esa copia no está.`
          : "No había copia de seguridad, así que se ha empezado de cero: pulsa «Sincronizar ahora» para traer Canvas y, si usabas la web, Ajustes → «Traer mis datos de la web»."}{" "}
        La base de datos dañada no se ha borrado: está apartada en <code className="break-all text-xs">{note.aside}</code>.
      </p>
      <form action={dismissRecoveryAction} className="mt-2">
        <PendingButton className="h-7 rounded-md border border-amber-600/30 bg-white/60 px-2.5 text-xs font-medium hover:bg-white dark:bg-transparent">Entendido</PendingButton>
      </form>
    </section>
  );
}
