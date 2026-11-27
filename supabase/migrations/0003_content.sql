-- UniHub · FASE 3 · Tareas, anuncios y bandeja de novedades

-- Cuándo se sincronizó por última vez el contenido de cada asignatura.
-- NULL = nunca: la primera importación no genera novedades (evita una avalancha).
alter table public.courses add column if not exists content_synced_at timestamptz;

-- ─── assignments ────────────────────────────────────────────────────────
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  name text not null,
  description_text text,
  due_at timestamptz,
  unlock_at timestamptz,
  lock_at timestamptz,
  points_possible numeric,
  submission_types text[] not null default '{}',
  html_url text,
  canvas_updated_at timestamptz,
  submission_state text not null default 'unknown'
    check (submission_state in ('pending', 'submitted', 'graded', 'excused', 'not_required', 'unknown')),
  submitted_at timestamptz,
  score numeric,
  grade text,
  late boolean not null default false,
  missing boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint assignments_user_provider_external_key unique (user_id, provider, external_id)
);

create index if not exists assignments_user_due_idx on public.assignments (user_id, due_at);
create index if not exists assignments_course_idx on public.assignments (course_id);

-- ─── announcements ──────────────────────────────────────────────────────
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  title text not null,
  message_excerpt text,
  author_name text,
  posted_at timestamptz,
  html_url text,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  constraint announcements_user_provider_external_key unique (user_id, provider, external_id)
);

create index if not exists announcements_user_posted_idx on public.announcements (user_id, posted_at desc);
create index if not exists announcements_course_idx on public.announcements (course_id);

-- ─── changes (historial + bandeja de novedades) ─────────────────────────
create table if not exists public.changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  entity_type text not null check (entity_type in ('assignment', 'announcement')),
  entity_id uuid,
  external_id bigint not null,
  kind text not null check (kind in ('new_assignment', 'due_date_changed', 'assignment_removed', 'graded', 'new_announcement')),
  title text not null,
  detail jsonb,
  -- Identifica un cambio concreto (p. ej. la nueva fecha) para no registrarlo dos veces.
  dedupe_key text not null default '',
  detected_at timestamptz not null default now(),
  read_at timestamptz,
  constraint changes_dedupe_key unique (user_id, entity_type, external_id, kind, dedupe_key)
);

create index if not exists changes_user_unread_idx on public.changes (user_id, detected_at desc) where read_at is null;
create index if not exists changes_user_recent_idx on public.changes (user_id, detected_at desc);
create index if not exists changes_course_idx on public.changes (course_id);

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.assignments enable row level security;
alter table public.announcements enable row level security;
alter table public.changes enable row level security;

create policy "assignments_own" on public.assignments
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "announcements_own" on public.announcements
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "changes_own" on public.changes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
