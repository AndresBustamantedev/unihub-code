"use client";

/** Franja del modo demo: los datos son inventados y se puede pasar a los propios en un clic. */
export function DemoBanner() {
  const bridge = typeof window !== "undefined" ? window.unihubDesktop : undefined;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Estás viendo datos de ejemplo.</span>{" "}
        <span className="text-muted-foreground">Las asignaturas, clases y tareas son inventadas. Conecta tu Canvas para ver las tuyas; tus datos se guardan aparte.</span>
      </p>
      {bridge && (
        <button
          type="button"
          onClick={() => void bridge.openSetup()}
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Conectar mi Canvas
        </button>
      )}
    </div>
  );
}
