-- UniHub · FASE 6 · Clases (grabaciones) y transcripciones
-- Microsoft Graph no permite a un asistente (no organizador) leer grabaciones ni transcripciones
-- sin consentimiento de administrador, así que la fuente principal es la importación manual.
-- `source` deja la puerta abierta a una integración futura con Graph sin cambiar el esquema.

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  session_at timestamptz not null,
  duration_minutes int check (duration_minutes is null or duration_minutes between 0 and 1440),
  recording_url text check (recording_url is null or recording_url ~ '^https://'),
  source text not null default 'manual' check (source in ('manual', 'graph')),
  external_id text,
  topics text[] not null default '{}',
  notes text check (notes is null or char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_external_key unique (user_id, source, external_id)
);
create index if not exists class_sessions_user_date_idx on public.class_sessions (user_id, session_at desc);
create index if not exists class_sessions_course_idx on public.class_sessions (course_id, session_at desc);

-- Texto limpio de la transcripción (necesario para buscar, resumir y exportar).
-- No se guarda el archivo original.
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null unique references public.class_sessions (id) on delete cascade,
  source_format text not null check (source_format in ('vtt', 'docx', 'txt', 'paste')),
  content_text text not null check (char_length(content_text) <= 600000),
  word_count int not null default 0,
  speakers text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists transcripts_user_idx on public.transcripts (user_id);

alter table public.class_sessions enable row level security;
alter table public.transcripts enable row level security;

create policy "class_sessions_own" on public.class_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transcripts_own" on public.transcripts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
