-- UniHub · FASE 4 · Recordatorios y suscripciones push

-- ─── notifications ──────────────────────────────────────────────────────
-- Un recordatorio por (tarea, umbral, fecha límite). Si la fecha cambia, la nueva
-- fecha genera recordatorios nuevos; la misma fecha nunca repite aviso.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  kind text not null check (kind in ('due_72h', 'due_24h', 'due_6h')),
  due_at timestamptz not null,
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  title text not null,
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_count int not null default 0,
  error text,
  read_at timestamptz,
  constraint notifications_dedupe_key unique (user_id, assignment_id, kind, due_at)
);

create index if not exists notifications_user_recent_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_assignment_idx on public.notifications (assignment_id);

-- ─── push_subscriptions ─────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "notifications_own" on public.notifications
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
