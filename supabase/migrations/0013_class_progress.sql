-- UniHub · Seguimiento de estudio por clase y aviso de clases sin importar

-- Estado de estudio de cada clase (lo marca el alumno).
alter table public.class_sessions
  add column if not exists watched_at timestamptz,
  add column if not exists understanding text check (understanding in ('low', 'mid', 'high')),
  add column if not exists review_state text check (review_state in ('reviewing', 'done')),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists review_count int not null default 0 check (review_count between 0 and 1000);

-- Días en los que una clase del horario no se dio o no se grabó (festivo, cancelada…):
-- así no vuelve a avisar de que falta importarla.
create table if not exists public.class_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  class_date date not null,
  created_at timestamptz not null default now(),
  constraint class_skips_key unique (user_id, course_id, class_date)
);
create index if not exists class_skips_course_idx on public.class_skips (course_id);
alter table public.class_skips enable row level security;
create policy "class_skips_own" on public.class_skips for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Avisos que no son de una tarea (p. ej. "falta importar la clase del jueves").
alter table public.notifications alter column assignment_id drop not null;
alter table public.notifications add column if not exists course_id uuid references public.courses (id) on delete cascade;
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_user_dedupe_idx on public.notifications (user_id, dedupe_key);
create index if not exists notifications_course_idx on public.notifications (course_id);
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('due_72h', 'due_24h', 'due_6h', 'class_missing'));
alter table public.notifications add constraint notifications_target_check
  check (assignment_id is not null or course_id is not null);
