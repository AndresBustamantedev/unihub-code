import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { Bell, BookOpen, CalendarCheck, Home, Layers, LogOut, Search, Settings, Stethoscope, Video, type LucideIcon } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { countUnreadChanges } from "@/features/content/queries";
import { countUnreadConversations } from "@/features/inbox/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

export type Href = "/" | "/tareas" | "/novedades" | "/clases" | "/asignaturas" | "/repasar" | "/buscar" | "/ajustes" | "/diagnostico";

const MAIN: { href: Href; label: string; Icon: LucideIcon }[] = [
  { href: "/", label: "Inicio", Icon: Home },
  { href: "/tareas", label: "Tareas", Icon: CalendarCheck },
  { href: "/novedades", label: "Novedades", Icon: Bell },
  { href: "/clases", label: "Clases", Icon: Video },
  { href: "/asignaturas", label: "Asignaturas", Icon: BookOpen },
  { href: "/repasar", label: "Repasar", Icon: Layers },
  { href: "/buscar", label: "Buscar", Icon: Search },
];
/** En el móvil la barra inferior tiene 5 huecos: «Repasar» y «Buscar» van arriba, en la cabecera. */
const MOBILE = MAIN.filter((it) => it.href !== "/buscar" && it.href !== "/repasar");
const SECONDARY: { href: Href; label: string; Icon: LucideIcon }[] = [
  { href: "/ajustes", label: "Ajustes", Icon: Settings },
  { href: "/diagnostico", label: "Diagnóstico", Icon: Stethoscope },
];

async function logoutAction() {
  "use server";
  await signOut();
  redirect("/login");
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="tabular ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{n > 99 ? "99+" : n}</span>;
}

/** Contador de novedades: se carga aparte (Suspense) para no retrasar la página. */
async function UnreadBadge({ compact }: { compact: boolean }) {
  const supabase = await createSupabaseServerClient();
  const [changes, messages] = await Promise.all([countUnreadChanges(supabase), countUnreadConversations(supabase)]);
  const unread = (changes ?? 0) + (messages ?? 0);
  if (compact) return unread > 0 ? <span className="absolute right-[22%] top-1 size-2 rounded-full bg-primary" aria-label={`${unread} sin leer`} /> : null;
  return <Badge n={unread} />;
}

export async function AppShell({ active, children, wide = false }: { active: Href; children: ReactNode; wide?: boolean }) {
  const store = await cookies();
  const theme = parseTheme(store.get(THEME_COOKIE)?.value);

  const item = (it: (typeof MAIN)[number], compact = false) => {
    const on = active === it.href;
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={on ? "page" : undefined}
        className={cn(
          compact
            ? "relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px]"
            : "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
          on ? (compact ? "text-primary" : "bg-accent-soft font-medium text-primary") : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <it.Icon className={compact ? "size-5" : "size-4"} />
        {it.label}
        {it.href === "/novedades" && (
          <Suspense fallback={null}>
            <UnreadBadge compact={compact} />
          </Suspense>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[13.5rem_1fr]">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-sidebar px-3 py-4 lg:flex">
        <Link href="/" className="mb-5 px-2.5 text-lg font-bold tracking-tight">
          Uni<span className="text-primary">Hub</span>
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Principal">
          {MAIN.map((it) => item(it))}
        </nav>
        <nav className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3" aria-label="Cuenta">
          {SECONDARY.map((it) => item(it))}
          <ThemeToggle initial={theme} className="w-full justify-start px-2.5" />
          <form action={logoutAction}>
            <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              <LogOut className="size-4" /> Salir
            </button>
          </form>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Móvil: cabecera */}
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Link href="/" className="text-base font-bold tracking-tight">
            Uni<span className="text-primary">Hub</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/repasar" aria-label="Repasar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Layers className="size-4" />
            </Link>
            <Link href="/buscar" aria-label="Buscar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Search className="size-4" />
            </Link>
            <ThemeToggle initial={theme} />
            <Link href="/ajustes" aria-label="Ajustes" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <Settings className="size-4" />
            </Link>
          </div>
        </header>

        <main className={cn("mx-auto w-full px-4 pb-24 pt-5 lg:px-8 lg:pb-10 lg:pt-8", wide ? "max-w-[100rem]" : "max-w-5xl")}>{children}</main>

        {/* Móvil: barra inferior */}
        <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE.map((it) => item(it, true))}
        </nav>
      </div>
    </div>
  );
}
