-- UniHub · Mensajes (bandeja de entrada) y notificaciones (flujo de actividad) de Canvas
-- Solo lectura: se usa el listado (que no marca nada como leído). Se guardan extractos cortos.

create table if not exists public.canvas_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  external_id bigint not null,
  subject text,
  last_message_excerpt text,
  last_message_at timestamptz,
  participants text[] not null default '{}',
  context_name text,
  workflow_state text not null,
  message_count int not null default 0,
  starred boolean not null default false,
  first_seen_at timestamptz not null default now(),
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint canvas_conversations_user_external_key unique (user_id, external_id)
);
create index if not exists canvas_conversations_user_recent_idx on public.canvas_conversations (user_id, last_message_at desc);

create table if not exists public.canvas_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  external_id bigint not null,
  item_type text not null,
  notification_category text,
  title text,
  excerpt text,
  html_url text,
  read_state boolean,
  canvas_created_at timestamptz,
  canvas_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  constraint canvas_activity_user_external_key unique (user_id, external_id)
);
create index if not exists canvas_activity_user_recent_idx on public.canvas_activity (user_id, canvas_updated_at desc);
create index if not exists canvas_activity_course_idx on public.canvas_activity (course_id);

alter table public.changes drop constraint if exists changes_entity_type_check;
alter table public.changes add constraint changes_entity_type_check
  check (entity_type in ('assignment', 'announcement', 'file', 'module', 'conversation'));
alter table public.changes drop constraint if exists changes_kind_check;
alter table public.changes add constraint changes_kind_check
  check (kind in ('new_assignment', 'due_date_changed', 'assignment_removed', 'graded', 'new_announcement', 'new_file', 'module_updated', 'new_message'));

alter table public.canvas_conversations enable row level security;
alter table public.canvas_activity enable row level security;
create policy "canvas_conversations_own" on public.canvas_conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "canvas_activity_own" on public.canvas_activity for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
