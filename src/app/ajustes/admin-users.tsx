"use client";

import { useState, useTransition } from "react";
import { setCloudAccessAction, setTrialAccessAction } from "@/features/admin/actions";
import { formatUsd } from "@/integrations/ai/trial";
import type { AppUser } from "@/features/admin/queries";
import { timeAgo } from "@/lib/format";

/** Panel de administrador: a qué cuentas se les permite guardar sus datos en la web. */
export function AdminUsers({ users, me, trialDefaultLimit }: { users: AppUser[]; me: string; trialDefaultLimit: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {u.email ?? "(sin correo)"}
                {u.id === me && <span className="ml-1.5 font-normal text-muted-foreground">(tú)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {u.isAdmin ? "Administrador · siempre puede usar la web" : u.lastSignInAt ? `Último acceso ${timeAgo(u.lastSignInAt)}` : "Nunca ha entrado"}
              </p>
            </div>
            <TrialControls user={u} defaultLimit={trialDefaultLimit} />
            {!u.isAdmin && (
              <label className="flex shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={u.cloudEnabled}
                  disabled={pending}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setBusyId(u.id);
                    setError(null);
                    start(async () => {
                      const r = await setCloudAccessAction(u.id, on);
                      if (!r.ok) setError(r.error ?? "No se pudo guardar el cambio.");
                      setBusyId(null);
                    });
                  }}
                />
                {busyId === u.id ? "Guardando…" : "Copia en la web"}
              </label>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-urgent">{error}</p>}
    </div>
  );
}

/** Prueba gratuita de IA de una cuenta: activarla, su límite al mes y lo que lleva gastado. */
function TrialControls({ user, defaultLimit }: { user: AppUser; defaultLimit: number }) {
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(user.trialEnabled);
  const [limit, setLimit] = useState(user.trialLimit == null ? "" : String(user.trialLimit));
  const [error, setError] = useState<string | null>(null);
  const save = (nextEnabled: boolean, nextLimit: string) =>
    start(async () => {
      setError(null);
      const n = nextLimit.trim() === "" ? null : Number(nextLimit.replace(",", "."));
      const r = await setTrialAccessAction(user.id, nextEnabled, n);
      if (!r.ok) setError(r.error ?? "No se pudo guardar.");
    });
  const cap = user.trialLimit ?? defaultLimit;
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) => {
            setEnabled(e.target.checked);
            save(e.target.checked, limit);
          }}
        />
        IA de prueba
      </label>
      {enabled && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {formatUsd(user.trialUsed)} de
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => save(enabled, limit)}
            inputMode="decimal"
            placeholder={String(defaultLimit)}
            aria-label="Límite al mes en dólares"
            className="h-6 w-14 rounded border border-border bg-background px-1 text-right text-xs"
          />
          $ este mes{user.trialUsed >= cap ? " · agotada" : ""}
        </span>
      )}
      {error && <span className="text-xs text-urgent">{error}</span>}
    </div>
  );
}
