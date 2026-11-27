-- UniHub · FASE 7 · Apuntes generados con IA
create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid references public.class_sessions (id) on delete cascade,
  kind text not null check (kind in ('summary', 'questions', 'exercises')),
  content_md text not null check (char_length(content_md) <= 100000),
  provider text not null,
  model text not null,
  -- Hash del texto enviado: permite saber si la transcripción cambió desde que se generó.
  input_hash text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  constraint study_notes_session_kind_key unique (session_id, kind)
);
create index if not exists study_notes_course_idx on public.study_notes (course_id, created_at desc);
create index if not exists study_notes_user_idx on public.study_notes (user_id, created_at desc);

alter table public.study_notes enable row level security;
create policy "study_notes_own" on public.study_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
