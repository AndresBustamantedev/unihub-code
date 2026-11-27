import { getTrialStatus } from "@/integrations/ai/prefs";
import { formatUsd, TRIAL_MODEL } from "@/integrations/ai/trial";

/** Programa sin clave de OpenAI propia: la prueba gratuita y cuánto queda este mes. */
export async function TrialStatusCard() {
  const s = await getTrialStatus();
  if (!s) {
    return <p className="text-sm text-muted-foreground">No se pudo comprobar la prueba gratuita de IA (¿sin conexión?).</p>;
  }
  if (!s.enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes clave de OpenAI propia y la prueba gratuita no está activada para tu cuenta (la activa el administrador de UniHub). Pon tu clave en «Cambiar claves» para usar la IA.
      </p>
    );
  }
  const pct = s.limit > 0 ? Math.min(100, Math.round((s.used / s.limit) * 100)) : 100;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p>
        Estás usando la <strong>prueba gratuita</strong> de UniHub ({TRIAL_MODEL === "gpt-6-luna" ? "OpenAI · Luna, el modelo económico" : TRIAL_MODEL}).
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={`h-full ${pct >= 90 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Este mes: {formatUsd(s.used)} de {formatUsd(s.limit)} ({pct} %). Se renueva el día 1. Cuando se acabe, pon tu propia clave de OpenAI en «Cambiar claves» para seguir sin límite.
      </p>
    </div>
  );
}
