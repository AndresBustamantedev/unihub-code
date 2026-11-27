-- UniHub · Control de espacio
-- storage_usage(): tamaño de la base y de cada tabla de la app. SECURITY INVOKER (sin privilegios extra).
create or replace function public.storage_usage()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'database_bytes', pg_catalog.pg_database_size(current_database()),
    'tables', (
      select coalesce(json_agg(json_build_object('name', c.relname, 'bytes', pg_catalog.pg_total_relation_size(c.oid))
                               order by pg_catalog.pg_total_relation_size(c.oid) desc), '[]'::json)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    )
  );
$$;
revoke execute on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;

-- Para podar el registro técnico de sincronizaciones por fecha.
create index if not exists sync_runs_started_idx on public.sync_runs (started_at);
