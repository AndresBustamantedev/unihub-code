import { AppShell } from "@/components/app/app-shell";
import { requirePageUser } from "@/lib/auth/page-guard";
import { getOptionalServerEnv } from "@/lib/env/server";
import { formatDue, timeAgo } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/supabase/database.types";
import { PushSetup } from "./push-setup";
import { PasswordForm } from "./password-form";
import { getStorageUsage } from "@/features/storage";
import { formatBytes } from "@/lib/format";
import { AI_LABEL, AI_MODEL_COOKIE, AI_PREF_COOKIE, listAiProviders, readAiConfig } from "@/integrations/ai/provider";
import { AiProviderPicker } from "@/components/app/ai-provider-picker";
import { cookies } from "next/headers";
import { ThemeSelector } from "@/components/app/theme-toggle";
import { parseTheme, THEME_COOKIE } from "@/lib/theme/theme";
import { UniversityLoginForm } from "./university-login-form";
import { UniversitySecretForm } from "./university-secret-form";
import { DesktopSettings } from "./desktop-settings";
import { isDesktop } from "@/lib/desktop";
import { isLocalOnly } from "@/lib/local-only";
import { loadCloudAccess } from "@/features/admin/queries";
import { readCloudState } from "@/features/desktop/cloud-export";
import { AdminUsers } from "./admin-users";
import { CloudBackup } from "./cloud-backup";
import { UpdatesPanel } from "./updates-panel";
import { TrialStatusCard } from "./trial-status";
import { Suspense } from "react";
import { CanvasTokenNotice } from "@/components/app/canvas-token-notice";

export const dynamic = "force-dynamic";

const STATUS: Record<NotificationRow["status"], string> = {
  pending: "enviando",
  sent: "enviado",
  failed: "falló",
  skipped: "omitido (había uno más urgente)",
};

export default async function AjustesPage() {
  const user = await requirePageUser("/ajustes");
  const desktop = isDesktop();
  const localOnly = isLocalOnly();
  const env = getOptionalServerEnv();
  const supabase = await createSupabaseServerClient();
  const [{ data: notifications, error }, { count: devices }, { data: lastAuto }, usage, { data: profile }, store, access] = await Promise.all([
    supabase.from("notifications").select("*").neq("status", "skipped").order("created_at", { ascending: false }).limit(20),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("sync_runs").select("started_at, status").eq("resource", "content").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    getStorageUsage(supabase),
    supabase.from("profiles").select("university_login, university_secret").maybeSingle(),
    cookies(),
    loadCloudAccess(),
  ]);

  const theme = parseTheme(store.get(THEME_COOKIE)?.value);
  const ai = readAiConfig(process.env, store.get(AI_PREF_COOKIE)?.value ?? null, store.get(AI_MODEL_COOKIE)?.value ?? null);
  const providers = listAiProviders();
  const pct = usage ? Math.min(100, (usage.databaseBytes / usage.quotaBytes) * 100) : 0;
  const checks = [
    { ok: !!env.CRON_SECRET, label: "CRON_SECRET", hint: "protege /api/cron/sync" },
    { ok: !!env.SUPABASE_SECRET_KEY, label: "SUPABASE_SECRET_KEY", hint: "permite sincronizar sin sesión abierta" },
    { ok: !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY, label: "Claves VAPID", hint: "necesarias para push" },
  ];

  return (
    <AppShell active="/ajustes">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold tracking-tight">Ajustes</h1>
        <Suspense fallback={null}>
          <CanvasTokenNotice />
        </Suspense>

        {!localOnly && (
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Contraseña</h2>
            <PasswordForm />
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-1 text-sm font-semibold">Acceso a Teams y Stream</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Guarda tu usuario y tu contraseña para copiarlos con un clic antes de abrir una grabación. La contraseña se guarda cifrada con una clave que solo tiene el servidor y nunca se muestra en pantalla.
          </p>
          <div className="flex flex-col gap-3">
            <UniversityLoginForm value={profile?.university_login ?? null} />
            <UniversitySecretForm saved={!!profile?.university_secret} keyConfigured={!!env.CREDENTIALS_ENCRYPTION_KEY} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Espacio usado</h2>
          {desktop && usage ? (
            <p className="text-sm">
              Tus datos ocupan <span className="tabular font-semibold">{formatBytes(usage.databaseBytes)}</span> en este ordenador (sin límite: es tu disco). Lo que más ocupa:{" "}
              {usage.top.map((t) => `${t.label} ${formatBytes(t.bytes)}`).join(", ")}. {localOnly ? "Este programa funciona sin cuenta: nada sale de tu ordenador." : access.enabled ? "En Supabase está tu cuenta de acceso y la copia que subas a la web." : "En Supabase solo está tu cuenta de acceso."}
            </p>
          ) : usage ? (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <span className="tabular font-semibold">{formatBytes(usage.databaseBytes)}</span> de {formatBytes(usage.quotaBytes)}
                </span>
                <span className="tabular text-xs text-muted-foreground">{pct.toFixed(1)} %</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className={pct >= 80 ? "h-full bg-urgent" : "h-full bg-primary"} style={{ width: `${Math.max(pct, 1)}%` }} />
              </div>
              {pct >= 80 && (
                <p className="mt-2 text-sm text-urgent">
                  Te acercas al límite gratuito. Descarga el ZIP de las asignaturas que ya terminaste y borra sus clases antiguas.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Datos de UniHub: {formatBytes(usage.appBytes)} (el resto es el sistema de Supabase). Lo que más ocupa:{" "}
                {usage.top.map((t) => `${t.label} ${formatBytes(t.bytes)}`).join(", ")}. Postgres ya comprime los textos largos; el registro técnico de más de 30 días se borra solo.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudo medir el espacio.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Apariencia</h2>
          <ThemeSelector initial={theme} />
          <p className="mt-2 text-xs text-muted-foreground">«Automático» sigue el modo claro u oscuro de tu dispositivo.</p>
        </section>

        {desktop && (
          <section className="rounded-lg border border-primary/30 bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Programa de escritorio</h2>
            <DesktopSettings canImport={!localOnly} />
          </section>
        )}

        {desktop && (
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Actualizaciones</h2>
            <UpdatesPanel />
          </section>
        )}

        {desktop && (
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">Copia en la web</h2>
            {localOnly ? (
              <p className="text-sm text-muted-foreground">
                Este programa se compiló sin Supabase, así que funciona sin cuenta y sin copia en la web. Tus datos están en este ordenador y en tu carpeta de UniHub, con copia de seguridad diaria.
              </p>
            ) : access.enabled ? (
              <CloudBackup state={readCloudState(user.id)} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Tus datos están solo en este ordenador (y en tu carpeta). La copia en la web no está activada para tu cuenta: la activa un administrador de UniHub.
              </p>
            )}
          </section>
        )}

        {access.isAdmin && access.users && (
          <section className="rounded-lg border border-border bg-card p-3">
            <h2 className="mb-1 text-sm font-semibold">Usuarios (administrador)</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              Elige quién puede guardar sus datos en la web y a quién das la IA de prueba (con tu clave de OpenAI, el modelo Luna y un límite al mes; vacío = el general). Sin la copia activada, una cuenta usa Supabase solo para iniciar sesión: sus datos se quedan en su ordenador y Supabase rechaza cualquier dato suyo.
            </p>
            <AdminUsers users={access.users} me={user.id} trialDefaultLimit={access.trialDefaultLimit ?? 0.5} />
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-1 text-sm font-semibold">Recordatorios de entrega</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Aviso 72 h, 24 h y 6 h antes de cada tarea pendiente de tus asignaturas seguidas. Solo con fechas recién verificadas en Canvas y nunca dos veces el mismo aviso. Si una tarea aparece con poco margen, se envía solo el aviso más urgente.
          </p>
          {desktop ? (
            <p className="text-sm">En el programa de escritorio los avisos llegan como notificaciones de Windows.</p>
          ) : (
            <>
              <PushSetup vapidPublicKey={env.VAPID_PUBLIC_KEY ?? null} />
              <p className="mt-2 text-xs text-muted-foreground">Dispositivos suscritos: {devices ?? "?"}</p>
            </>
          )}
        </section>

        {!desktop && <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Sincronización automática</h2>
          <ul className="mb-2 space-y-1 text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-2">
                <span className={c.ok ? "text-emerald-600" : "text-amber-600"}>{c.ok ? "✓" : "✗"}</span>
                <span>{c.label}</span>
                <span className="text-muted-foreground">· {c.hint}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Última sincronización de contenido: {lastAuto ? `${timeAgo(lastAuto.started_at)} (${lastAuto.status})` : "nunca"}. La programación cada 20 min se activa al desplegar (ver README).
          </p>
        </section>}

        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Inteligencia artificial</h2>
          <ul className="mb-2 space-y-1 text-sm">
            {providers.map((p) => (
              <li key={p.provider} className="flex flex-wrap items-baseline gap-x-2">
                <span className={p.ok ? "text-emerald-600" : "text-muted-foreground"}>{p.ok ? "✓" : "–"}</span>
                <span className="font-medium">{AI_LABEL[p.provider]}</span>
                {p.ok ? <code className="text-xs text-muted-foreground">{p.model}</code> : <span className="text-xs text-muted-foreground">{p.reason}</span>}
              </li>
            ))}
          </ul>
          {!ai.ok && (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Comprobando la prueba gratuita…</p>}>
              <TrialStatusCard />
            </Suspense>
          )}
          {ai.ok && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm">Modelo activo (se usa en resúmenes, apuntes y preguntas sobre documentos):</p>
              <AiProviderPicker
                variant="cards"
                providers={providers.map(({ provider, ok, model }) => ({ provider, ok, model }))}
                initial={ai.config.provider}
                initialModel={ai.config.model}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {desktop ? "En el programa, tu clave se guarda cifrada en este ordenador («Cambiar claves»)." : <>Las claves se leen solo en el servidor desde <code>.env.local</code> (o las variables de Vercel) y nunca llegan al navegador.</>} Solo se usan al pulsar «Generar» o al preguntar; cada proveedor cobra por uso. Precios aproximados de noviembre de 2026.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card px-3">
          <h2 className="pt-2.5 text-sm font-semibold">Últimos avisos</h2>
          {error ? (
            <p className="py-2 text-sm text-red-600">No se pudo cargar el historial.</p>
          ) : !notifications?.length ? (
            <p className="py-2 text-sm text-muted-foreground">Aún no se ha enviado ningún aviso.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id} className="py-2">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(n.created_at)} · {STATUS[n.status]}
                    {n.status === "sent" && ` · ${n.delivered_count} dispositivo(s)`} · vence {formatDue(n.due_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
