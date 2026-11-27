-- UniHub · Búsqueda en todo (transcripciones, apuntes, notas, material y enlaces) y preguntas a la IA
--
-- El texto de cada fuente se trocea en fragmentos de ~1200 caracteres con su índice de búsqueda
-- en español (sin distinguir tildes). La aplicación mantiene el índice al día comparando la
-- huella (md5) de cada fuente con la que se indexó.

-- Minúsculas y sin tildes (inmutable: se usa en el índice). En la base de datos del programa no
-- existe la extensión «unaccent», así que se hace con translate().
create or replace function public.unihub_norm(t text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(coalesce(t, ''),
    'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuunncc'));
$$;

create table if not exists public.search_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  source_type text not null check (source_type in ('transcript', 'class_note', 'study_note', 'material', 'material_note', 'resource')),
  source_id uuid not null,
  chunk_index int not null default 0,
  title text not null check (char_length(title) <= 400),
  location text check (location is null or char_length(location) <= 100),
  href text not null check (char_length(href) <= 300),
  content text not null check (char_length(content) <= 4000),
  tsv tsvector generated always as (to_tsvector('spanish'::regconfig, public.unihub_norm(title || ' ' || content))) stored,
  created_at timestamptz not null default now()
);
create index if not exists search_chunks_tsv_idx on public.search_chunks using gin (tsv);
create index if not exists search_chunks_source_idx on public.search_chunks (user_id, source_type, source_id);
create index if not exists search_chunks_course_idx on public.search_chunks (course_id);

-- Qué se indexó y con qué huella (para reindexar solo lo que cambió).
create table if not exists public.search_sources (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  hash text not null,
  chunks int not null default 0,
  indexed_at timestamptz not null default now(),
  primary key (user_id, source_type, source_id)
);

alter table public.search_chunks enable row level security;
alter table public.search_sources enable row level security;
drop policy if exists "search_chunks_own" on public.search_chunks;
create policy "search_chunks_own" on public.search_chunks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "search_sources_own" on public.search_sources;
create policy "search_sources_own" on public.search_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- En la web, como el resto de datos: solo cuentas con la copia en la web activada (0018).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'can_use_cloud') then
    execute 'drop policy if exists search_chunks_cloud_access on public.search_chunks';
    execute 'create policy search_chunks_cloud_access on public.search_chunks as restrictive for all to authenticated using ((select public.can_use_cloud())) with check ((select public.can_use_cloud()))';
    execute 'drop policy if exists search_sources_cloud_access on public.search_sources';
    execute 'create policy search_sources_cloud_access on public.search_sources as restrictive for all to authenticated using ((select public.can_use_cloud())) with check ((select public.can_use_cloud()))';
  end if;
end;
$$;

-- Huella actual de cada fuente de texto del usuario.
create or replace function public.search_index_state()
returns table (source_type text, source_id uuid, course_id uuid, hash text)
language sql
stable
set search_path = public
as $$
  select 'transcript', t.session_id, s.course_id, md5(s.course_id::text || s.title || s.session_at::text || t.content_text)
    from transcripts t join class_sessions s on s.id = t.session_id
    where t.user_id = auth.uid()
  union all
  select 'class_note', s.id, s.course_id, md5(s.course_id::text || s.title || s.notes)
    from class_sessions s
    where s.user_id = auth.uid() and coalesce(s.notes, '') <> ''
  union all
  select 'study_note', n.id, n.course_id, md5(n.course_id::text || coalesce(s.title, '') || n.kind || n.content_md)
    from study_notes n left join class_sessions s on s.id = n.session_id
    where n.user_id = auth.uid()
  union all
  select 'material', m.module_item_id, i.course_id, md5(i.course_id::text || i.title || m.content_text)
    from material_texts m join course_module_items i on i.id = m.module_item_id
    where m.user_id = auth.uid()
  union all
  select 'material_note', n.module_item_id, n.course_id, md5(n.course_id::text || i.title || n.content_md)
    from material_notes n join course_module_items i on i.id = n.module_item_id
    where n.user_id = auth.uid() and n.content_md <> ''
  union all
  select 'resource', r.id, r.course_id, md5(r.course_id::text || r.title || r.url || coalesce(r.note, ''))
    from class_resources r
    where r.user_id = auth.uid();
$$;

-- Búsqueda. match_any=false: todas las palabras (buscador). match_any=true: cualquiera, ordenadas
-- por relevancia (para preguntas en lenguaje natural).
create or replace function public.search_chunks_find(q text, course uuid default null, match_any boolean default false, lim int default 30)
returns table (id uuid, course_id uuid, source_type text, source_id uuid, chunk_index int, title text, location text, href text, content text, rank real)
language plpgsql
stable
set search_path = public
as $$
declare
  tq tsquery;
begin
  if match_any then
    tq := nullif(replace(plainto_tsquery('spanish', unihub_norm(q))::text, ' & ', ' | '), '')::tsquery;
  else
    tq := websearch_to_tsquery('spanish', unihub_norm(q));
  end if;
  if tq is null or numnode(tq) = 0 then
    return;
  end if;
  return query
    select c.id, c.course_id, c.source_type, c.source_id, c.chunk_index, c.title, c.location, c.href, c.content,
           ts_rank_cd(c.tsv, tq, 1)::real
    from search_chunks c
    where c.user_id = auth.uid() and c.tsv @@ tq and (course is null or c.course_id = course)
    order by 10 desc, c.chunk_index
    limit least(greatest(coalesce(lim, 30), 1), 100);
end;
$$;

revoke execute on function public.search_index_state() from public, anon;
revoke execute on function public.search_chunks_find(text, uuid, boolean, int) from public, anon;
grant execute on function public.search_index_state() to authenticated;
grant execute on function public.search_chunks_find(text, uuid, boolean, int) to authenticated;
