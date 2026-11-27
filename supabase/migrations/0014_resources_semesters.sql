-- UniHub · Recursos externos, semestres de toda la carrera, fin de clases y usuario de la universidad

-- Enlaces de refuerzo (vídeos, artículos, ejercicios…). session_id nulo = recurso de la asignatura.
create table if not exists public.class_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid references public.class_sessions (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  title text not null check (char_length(title) between 1 and 200),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists class_resources_course_idx on public.class_resources (course_id, created_at desc);
create index if not exists class_resources_session_idx on public.class_resources (session_id);
create index if not exists class_resources_user_idx on public.class_resources (user_id);
alter table public.class_resources enable row level security;
create policy "class_resources_own" on public.class_resources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Semestre dentro de la carrera (1–10), no solo 1.º/2.º del curso.
alter table public.courses drop constraint if exists courses_semester_check;
alter table public.courses add constraint courses_semester_check check (semester is null or semester between 1 and 12);

-- Último día de clases de la asignatura: a partir de ahí no se muestran en el calendario
-- ni se avisa de clases sin importar.
alter table public.courses add column if not exists classes_end_on date;

-- Usuario de la universidad para copiarlo rápido al iniciar sesión en Teams/Stream.
-- (La contraseña no se guarda nunca.)
alter table public.profiles add column if not exists university_login text check (university_login is null or char_length(university_login) <= 200);
