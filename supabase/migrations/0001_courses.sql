-- UniHub · FASE 2 · Asignaturas y ejecuciones de sincronización
-- Las credenciales de Canvas NO se guardan aquí (siguen en variables de servidor).

-- ─── profiles ───────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── courses ────────────────────────────────────────────────────────────
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  name text not null,
  course_code text,
  workflow_state text,
  enrollment_types text[] not null default '{}',
  enrollment_states text[] not null default '{}',
  term_name text,
  term_start_at timestamptz,
  term_end_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  html_url text,
  category text not null check (category in ('current', 'future', 'past', 'auxiliary')),
  category_reason text,
  followed boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint courses_user_provider_external_key unique (user_id, provider, external_id)
);

create index if not exists courses_user_category_idx on public.courses (user_id, category);
create index if not exists courses_user_followed_idx on public.courses (user_id) where followed;

-- ─── sync_runs ──────────────────────────────────────────────────────────
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null,
  resource text not null,
  status text not null check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb,
  error_code text,
  error_message text
);

-- Protección contra ejecuciones duplicadas: solo una "running" por recurso.
create unique index if not exists sync_runs_one_running_idx
  on public.sync_runs (user_id, provider, resource) where status = 'running';
create index if not exists sync_runs_user_recent_idx
  on public.sync_runs (user_id, provider, resource, started_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.sync_runs enable row level security;

create policy "profiles_own" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "courses_own" on public.courses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "sync_runs_own" on public.sync_runs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
