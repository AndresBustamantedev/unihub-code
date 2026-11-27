-- UniHub · FASE 5 · Materiales, módulos, páginas y calendario
-- Solo metadatos y enlaces a Canvas: no se copian archivos ni cuerpos de páginas.

alter table public.courses add column if not exists materials_synced_at timestamptz;
-- Disponibilidad por recurso: {"modules":"ok","files":"unavailable","pages":"ok"}.
-- "unavailable" = Canvas lo deniega (pestaña oculta); NO significa "vacío".
alter table public.courses add column if not exists materials_status jsonb not null default '{}'::jsonb;

-- ─── course_modules ─────────────────────────────────────────────────────
create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  name text not null,
  position int,
  unlock_at timestamptz,
  state text,
  items_count int not null default 0,
  first_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint course_modules_user_provider_external_key unique (user_id, provider, external_id)
);
create index if not exists course_modules_course_idx on public.course_modules (course_id, position);

create table if not exists public.course_module_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  module_id uuid not null references public.course_modules (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  title text not null,
  item_type text not null,
  position int,
  indent int not null default 0,
  content_id bigint,
  html_url text,
  external_url text,
  first_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint course_module_items_user_provider_external_key unique (user_id, provider, external_id)
);
create index if not exists course_module_items_module_idx on public.course_module_items (module_id, position);
create index if not exists course_module_items_course_idx on public.course_module_items (course_id);

-- ─── course_files (metadatos; html_url apunta a la vista de Canvas, sin URLs firmadas) ──
create table if not exists public.course_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  display_name text not null,
  content_type text,
  size_bytes bigint,
  canvas_created_at timestamptz,
  canvas_updated_at timestamptz,
  html_url text,
  first_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint course_files_user_provider_external_key unique (user_id, provider, external_id)
);
create index if not exists course_files_course_idx on public.course_files (course_id, canvas_created_at desc);
create index if not exists course_files_user_recent_idx on public.course_files (user_id, first_seen_at desc);

-- ─── course_pages (sin cuerpo) ──────────────────────────────────────────
create table if not exists public.course_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  slug text,
  title text not null,
  front_page boolean not null default false,
  canvas_updated_at timestamptz,
  html_url text,
  first_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint course_pages_user_provider_external_key unique (user_id, provider, external_id)
);
create index if not exists course_pages_course_idx on public.course_pages (course_id, canvas_updated_at desc);

-- ─── calendar_events ────────────────────────────────────────────────────
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  provider text not null default 'canvas' check (provider in ('canvas')),
  external_id bigint not null,
  title text not null,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  location_name text,
  description_text text,
  html_url text,
  online_meeting_url text,
  first_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint calendar_events_user_provider_external_key unique (user_id, provider, external_id)
);
create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, start_at);
create index if not exists calendar_events_course_idx on public.calendar_events (course_id);

-- ─── changes: nuevos tipos ──────────────────────────────────────────────
alter table public.changes drop constraint if exists changes_entity_type_check;
alter table public.changes add constraint changes_entity_type_check
  check (entity_type in ('assignment', 'announcement', 'file', 'module'));
alter table public.changes drop constraint if exists changes_kind_check;
alter table public.changes add constraint changes_kind_check
  check (kind in ('new_assignment', 'due_date_changed', 'assignment_removed', 'graded', 'new_announcement', 'new_file', 'module_updated'));

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.course_modules enable row level security;
alter table public.course_module_items enable row level security;
alter table public.course_files enable row level security;
alter table public.course_pages enable row level security;
alter table public.calendar_events enable row level security;

create policy "course_modules_own" on public.course_modules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "course_module_items_own" on public.course_module_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "course_files_own" on public.course_files for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "course_pages_own" on public.course_pages for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar_events_own" on public.calendar_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
