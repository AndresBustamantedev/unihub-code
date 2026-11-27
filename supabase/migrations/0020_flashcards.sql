-- UniHub · Tarjetas de repaso (repetición espaciada) y exámenes
--
-- Cada tarjeta guarda su propio estado de repaso (estilo Anki): cuándo toca, el intervalo en
-- días y la «facilidad». Cada repaso se apunta en flashcard_reviews (para el progreso y para
-- saber cuántas nuevas se han visto hoy). Un examen marca una fecha y qué clases/material entran.

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  session_id uuid references public.class_sessions (id) on delete cascade,
  module_item_id uuid references public.course_module_items (id) on delete cascade,
  front text not null check (char_length(front) between 1 and 1000),
  back text not null check (char_length(back) between 1 and 4000),
  source_label text check (source_label is null or char_length(source_label) <= 200),
  origin text not null default 'ai' check (origin in ('ai', 'manual')),
  state text not null default 'new' check (state in ('new', 'learning', 'review')),
  due_at timestamptz not null default now(),
  interval_days real not null default 0 check (interval_days >= 0),
  ease real not null default 2.5 check (ease between 1.3 and 5),
  reps int not null default 0,
  lapses int not null default 0,
  step int not null default 0,
  last_reviewed_at timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcards_due_idx on public.flashcards (user_id, suspended, due_at);
create index if not exists flashcards_course_idx on public.flashcards (course_id);
create index if not exists flashcards_session_idx on public.flashcards (session_id);
create index if not exists flashcards_item_idx on public.flashcards (module_item_id);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  was_new boolean not null default false,
  reviewed_at timestamptz not null default now()
);
create index if not exists flashcard_reviews_day_idx on public.flashcard_reviews (user_id, reviewed_at);
create index if not exists flashcard_reviews_card_idx on public.flashcard_reviews (card_id);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  exam_at date not null,
  -- Qué entra: listas de ids (vacías = toda la asignatura).
  session_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(session_ids) = 'array'),
  module_item_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(module_item_ids) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists exams_course_idx on public.exams (user_id, exam_at);

alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.exams enable row level security;

drop policy if exists "flashcards_own" on public.flashcards;
create policy "flashcards_own" on public.flashcards for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "flashcard_reviews_own" on public.flashcard_reviews;
create policy "flashcard_reviews_own" on public.flashcard_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "exams_own" on public.exams;
create policy "exams_own" on public.exams for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- En la web, como el resto de datos: solo cuentas con la copia en la web activada (0018).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'can_use_cloud') then
    foreach t in array array['flashcards', 'flashcard_reviews', 'exams'] loop
      execute format('drop policy if exists %I on public.%I', t || '_cloud_access', t);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using ((select public.can_use_cloud())) with check ((select public.can_use_cloud()))',
        t || '_cloud_access', t
      );
    end loop;
  end if;
end;
$$;
