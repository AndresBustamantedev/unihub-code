import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ActivityItem, ConversationItem } from "@/components/app/canvas-items";
import { ChangeItem } from "@/components/app/change-item";
import { MarkAllReadButton } from "@/components/app/mark-read-button";
import { SyncStatus } from "@/components/app/sync-status";
import { listChanges, listRecentAnnouncements } from "@/features/content/queries";
import { countUnreadActivity, countUnreadConversations, listActivity, listConversations } from "@/features/inbox/queries";
import { getSyncOverview } from "@/features/sync/status";
import { readCanvasConfig } from "@/integrations/canvas/config";
import { requirePageUser } from "@/lib/auth/page-guard";
import { timeAgo } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = {
  cambios: "Cambios detectados",
  mensajes: "Mensajes de Canvas",
  canvas: "Notificaciones de Canvas",
} as const;
type Tab = keyof typeof TABS;

const Muted = ({ children }: { children: React.ReactNode }) => <p className="py-2 text-sm text-muted-foreground">{children}</p>;

export default async function NovedadesPage({ searchParams }: { searchParams: Promise<{ vista?: string; filtro?: string }> }) {
  await requirePageUser("/novedades");
  const { vista, filtro } = await searchParams;
  const tab: Tab = vista && vista in TABS ? (vista as Tab) : "cambios";
  const supabase = await createSupabaseServerClient();
  const cfg = readCanvasConfig();
  const inboxUrl = cfg.baseUrl ? `${new URL(cfg.baseUrl).origin}/conversations` : null;

  const [sync, unreadMessages, unreadActivity] = await Promise.all([getSyncOverview(supabase), countUnreadConversations(supabase), countUnreadActivity(supabase)]);

  return (
    <AppShell active="/novedades">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Novedades</h1>
          <p className="text-sm text-muted-foreground">Lo que cambia en tus asignaturas, tus mensajes y las notificaciones de Canvas.</p>
        </div>
        <SyncStatus state={sync} />

        <nav className="flex flex-wrap gap-1">
          {(Object.keys(TABS) as Tab[]).map((k) => (
            <Link
              key={k}
              href={k === "cambios" ? "/novedades" : `/novedades?vista=${k}`}
              className={cn("rounded-md px-2.5 py-1 text-sm", k === tab ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {TABS[k]}
              {k === "mensajes" && !!unreadMessages && <span className="tabular ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unreadMessages}</span>}
              {k === "canvas" && !!unreadActivity && <span className="tabular ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unreadActivity}</span>}
            </Link>
          ))}
        </nav>

        {tab === "cambios" && <ChangesTab />}
        {tab === "mensajes" && <MessagesTab inboxUrl={inboxUrl} />}
        {tab === "canvas" && <ActivityTab unreadOnly={filtro !== "todas"} unread={unreadActivity ?? 0} />}
      </div>
    </AppShell>
  );
}

async function ChangesTab() {
  const supabase = await createSupabaseServerClient();
  const [changes, announcements] = await Promise.all([listChanges(supabase, { limit: 100 }), listRecentAnnouncements(supabase, 15)]);
  const unread = changes.ok ? changes.data.filter((c) => !c.read_at).length : 0;
  return (
    <>
      <section className="rounded-lg border border-border bg-card px-3">
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-sm font-semibold">Historial de cambios</h2>
          <MarkAllReadButton disabled={unread === 0} />
        </div>
        {!changes.ok ? (
          <Muted>No se pudieron cargar las novedades.</Muted>
        ) : changes.data.length === 0 ? (
          <Muted>Todavía no se ha detectado ningún cambio. La primera sincronización es el punto de partida; desde ahí verás tareas nuevas, fechas cambiadas, calificaciones, anuncios, archivos y mensajes nuevos.</Muted>
        ) : (
          <ul className="divide-y divide-border">{changes.data.map((c) => <ChangeItem key={c.id} c={c} />)}</ul>
        )}
      </section>
      <section className="rounded-lg border border-border bg-card px-3">
        <h2 className="pt-2.5 text-sm font-semibold">Anuncios recientes de tus asignaturas</h2>
        {!announcements.ok ? (
          <Muted>No se pudieron cargar los anuncios.</Muted>
        ) : announcements.data.length === 0 ? (
          <Muted>Sin anuncios en los últimos 120 días en tus asignaturas seguidas.</Muted>
        ) : (
          <ul className="divide-y divide-border">
            {announcements.data.map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{a.title}</span>
                  {a.html_url && (
                    <a href={a.html_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir anuncio en Canvas">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{a.course?.course_code ?? a.course?.name} · {a.author_name ?? "?"} · {timeAgo(a.posted_at)}</p>
                {a.message_excerpt && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{a.message_excerpt}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function MessagesTab({ inboxUrl }: { inboxUrl: string | null }) {
  const supabase = await createSupabaseServerClient();
  const conversations = await listConversations(supabase, { limit: 100 });
  return (
    <section className="rounded-lg border border-border bg-card px-3">
      <div className="flex items-center justify-between pt-2.5">
        <h2 className="text-sm font-semibold">Bandeja de entrada de Canvas</h2>
        {inboxUrl && <a href={inboxUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground">Abrir en Canvas</a>}
      </div>
      {conversations === null ? (
        <Muted>No se pudieron cargar los mensajes.</Muted>
      ) : conversations.length === 0 ? (
        <Muted>Sin mensajes sincronizados todavía. Pulsa «Sincronizar ahora».</Muted>
      ) : (
        <ul className="divide-y divide-border">{conversations.map((c) => <ConversationItem key={c.id} c={c} inboxUrl={inboxUrl} />)}</ul>
      )}
      <p className="pb-2 text-xs text-muted-foreground">
        Solo lectura: UniHub ve el asunto y una vista previa (≤100 caracteres) del último mensaje. Leer o responder se hace en Canvas; abrirlo aquí no lo marca como leído.
      </p>
    </section>
  );
}

async function ActivityTab({ unreadOnly, unread }: { unreadOnly: boolean; unread: number }) {
  const supabase = await createSupabaseServerClient();
  const activity = await listActivity(supabase, { limit: 150, unreadOnly });
  return (
    <section className="rounded-lg border border-border bg-card px-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5">
        <h2 className="text-sm font-semibold">Notificaciones de Canvas (todas las asignaturas)</h2>
        <div className="flex gap-1 text-xs">
          <Link href="/novedades?vista=canvas" className={cn("rounded-md px-2 py-1", unreadOnly ? "bg-accent-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
            Sin leer ({unread})
          </Link>
          <Link href="/novedades?vista=canvas&filtro=todas" className={cn("rounded-md px-2 py-1", !unreadOnly ? "bg-accent-soft font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
            Todas
          </Link>
        </div>
      </div>
      {activity === null ? (
        <Muted>No se pudo cargar la actividad.</Muted>
      ) : activity.length === 0 ? (
        <Muted>{unreadOnly ? "No tienes notificaciones sin leer en Canvas." : "Sin actividad sincronizada todavía. Pulsa «Sincronizar ahora»."}</Muted>
      ) : (
        <ul className="divide-y divide-border">{activity.map((a) => <ActivityItem key={a.id} a={a} />)}</ul>
      )}
      <p className="pb-2 text-xs text-muted-foreground">
        Flujo de actividad de la API de Canvas (anuncios, debates, calificaciones, avisos). «Sin leer» refleja lo que Canvas marca como no leído; se marcan como leídas al abrirlas en Canvas.
      </p>
    </section>
  );
}
