-- unihub:solo-web (no se aplica en la base de datos local del programa de escritorio)
-- UniHub · Administradores y «Copia en la web»
--
-- Solo los administradores y las cuentas a las que un administrador active la copia en la web
-- pueden guardar o leer datos en Supabase. El resto de cuentas (p. ej. quien usa solo el
-- programa de escritorio) usan Supabase únicamente para iniciar sesión: aunque lo intentaran
-- directamente con la clave pública, la base de datos rechaza cualquier lectura o escritura.
-- Las tareas del servidor con la clave secreta (cron) no se ven afectadas.

-- Por si no se aplicó la 0017 (columnas del programa de escritorio).
alter table public.class_sessions add column if not exists local_video text check (local_video is null or char_length(local_video) <= 1000);
alter table public.course_module_items add column if not exists local_path text check (local_path is null or char_length(local_path) <= 1000);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

create table if not exists public.cloud_sync_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.cloud_sync_access enable row level security;
-- Sin políticas: solo se accede a estas tablas mediante las funciones de abajo.

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

create or replace function public.can_use_cloud()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()))
      or exists (select 1 from public.cloud_sync_access c where c.user_id = (select auth.uid()) and c.enabled);
$$;

-- Lo que puede ver cada usuario de sí mismo.
create or replace function public.my_cloud_access()
returns table (is_admin boolean, cloud_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_app_admin(), public.can_use_cloud();
$$;

-- Solo administradores: lista de cuentas y si tienen la copia en la web activada.
create or replace function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, is_admin boolean, cloud_enabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'solo administradores' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           exists (select 1 from public.app_admins a where a.user_id = u.id),
           coalesce((select c.enabled from public.cloud_sync_access c where c.user_id = u.id), false)
    from auth.users u
    order by u.created_at;
end;
$$;

-- Solo administradores: activar o desactivar la copia en la web de una cuenta.
create or replace function public.admin_set_cloud_access(target uuid, enable boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'solo administradores' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = target) then
    raise exception 'usuario no encontrado' using errcode = 'P0002';
  end if;
  insert into public.cloud_sync_access (user_id, enabled, updated_at, updated_by)
  values (target, enable, now(), (select auth.uid()))
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.is_app_admin() from public, anon;
revoke execute on function public.can_use_cloud() from public, anon;
revoke execute on function public.my_cloud_access() from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_cloud_access(uuid, boolean) from public, anon;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.can_use_cloud() to authenticated;
grant execute on function public.my_cloud_access() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_cloud_access(uuid, boolean) to authenticated;

-- Política restrictiva en todas las tablas de datos: se suma a las de «solo lo tuyo».
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'courses', 'assignments', 'announcements', 'course_modules', 'course_module_items',
    'course_files', 'course_pages', 'calendar_events', 'course_people', 'class_schedule', 'class_skips',
    'class_sessions', 'transcripts', 'study_notes', 'class_resources', 'material_notes', 'material_texts',
    'changes', 'canvas_conversations', 'canvas_activity', 'notifications', 'sync_runs', 'push_subscriptions'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_cloud_access', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.can_use_cloud())) with check ((select public.can_use_cloud()))',
      t || '_cloud_access', t
    );
  end loop;
end;
$$;

-- Primer administrador: tras crear tu usuario en Authentication → Users, ejecuta una vez
-- (cambiando el correo por el tuyo):
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where lower(email) = lower('tu-correo@ejemplo.com')
--   on conflict (user_id) do nothing;
