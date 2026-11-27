-- UniHub · Profesores/tutor, horario semanal y programa del curso

-- Profesores y tutores de cada asignatura (solo nombre, rol y correo si Canvas lo muestra).
create table if not exists public.course_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  external_id bigint not null,
  name text not null,
  role text not null check (role in ('teacher', 'ta', 'designer', 'other')),
  role_label text,
  email text,
  missing_since timestamptz,
  last_synced_at timestamptz not null default now(),
  constraint course_people_key unique (user_id, course_id, external_id, role)
);
create index if not exists course_people_course_idx on public.course_people (course_id);

-- Horario semanal que introduce el alumno (Canvas no lo tiene).
create table if not exists public.class_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = lunes … 7 = domingo
  start_time time not null,
  end_time time not null,
  location text check (location is null or char_length(location) <= 200),
  meeting_url text check (meeting_url is null or meeting_url ~ '^https://'),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  constraint class_schedule_times check (end_time > start_time)
);
create index if not exists class_schedule_user_idx on public.class_schedule (user_id, weekday, start_time);

-- Programa del curso (texto plano del "Programa del curso" de Canvas).
alter table public.courses add column if not exists syllabus_text text check (syllabus_text is null or char_length(syllabus_text) <= 60000);

alter table public.course_people enable row level security;
alter table public.class_schedule enable row level security;
create policy "course_people_own" on public.course_people for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "class_schedule_own" on public.class_schedule for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
