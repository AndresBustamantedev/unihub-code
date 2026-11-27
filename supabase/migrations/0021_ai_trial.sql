-- unihub:solo-web (no se aplica en la base de datos local del programa de escritorio)
-- UniHub · Prueba gratuita de IA
--
-- Quien no tiene clave propia de OpenAI usa la de UniHub a través de la web (/api/ai/trial),
-- siempre con el modelo más económico y con un límite de gasto al mes por usuario. Aquí solo se
-- guarda el CONSUMO (tokens y coste por mes), nunca el contenido de lo que se pregunta.

create table if not exists public.ai_trial_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.ai_trial_usage enable row level security;
-- Sin políticas: solo se accede mediante las funciones de abajo.

-- Quién puede usar la prueba (lo activa un administrador) y con qué límite (null = el general).
create table if not exists public.ai_trial_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  limit_usd numeric(8, 2) check (limit_usd is null or limit_usd >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ai_trial_access enable row level security;

-- Suma consumo de forma atómica. Solo la llama el servidor de la web (clave secreta).
create or replace function public.trial_add_usage(uid uuid, m text, tokens_in bigint, tokens_out bigint, cost numeric)
returns numeric
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.ai_trial_usage (user_id, month, requests, input_tokens, output_tokens, cost_usd, updated_at)
  values (uid, m, 1, greatest(tokens_in, 0), greatest(tokens_out, 0), greatest(cost, 0), now())
  on conflict (user_id, month) do update set
    requests = public.ai_trial_usage.requests + 1,
    input_tokens = public.ai_trial_usage.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_trial_usage.output_tokens + excluded.output_tokens,
    cost_usd = public.ai_trial_usage.cost_usd + excluded.cost_usd,
    updated_at = now()
  returning cost_usd;
$$;
revoke execute on function public.trial_add_usage(uuid, text, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.trial_add_usage(uuid, text, bigint, bigint, numeric) to service_role;

-- Gasto del mes de quien pregunta, si tiene la prueba activada y su límite propio.
create or replace function public.my_trial_usage(m text)
returns table (enabled boolean, limit_usd numeric, requests int, cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.enabled from public.ai_trial_access a where a.user_id = (select auth.uid())), false),
         (select a.limit_usd from public.ai_trial_access a where a.user_id = (select auth.uid())),
         coalesce((select u.requests from public.ai_trial_usage u where u.user_id = (select auth.uid()) and u.month = m), 0),
         coalesce((select u.cost_usd from public.ai_trial_usage u where u.user_id = (select auth.uid()) and u.month = m), 0);
$$;
revoke execute on function public.my_trial_usage(text) from public, anon;
grant execute on function public.my_trial_usage(text) to authenticated;

-- Lo mismo para el servidor de la web (clave secreta), para un usuario concreto.
create or replace function public.trial_access_for(uid uuid, m text)
returns table (enabled boolean, limit_usd numeric, cost_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.enabled from public.ai_trial_access a where a.user_id = uid), false),
         (select a.limit_usd from public.ai_trial_access a where a.user_id = uid),
         coalesce((select u.cost_usd from public.ai_trial_usage u where u.user_id = uid and u.month = m), 0);
$$;
revoke execute on function public.trial_access_for(uuid, text) from public, anon, authenticated;
grant execute on function public.trial_access_for(uuid, text) to service_role;

-- Solo administradores: prueba de cada cuenta (activada, límite y gasto del mes).
create or replace function public.admin_trial_usage(m text)
returns table (user_id uuid, enabled boolean, limit_usd numeric, requests int, cost_usd numeric)
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
    select u.id,
           coalesce(a.enabled, false),
           a.limit_usd,
           coalesce(x.requests, 0),
           coalesce(x.cost_usd, 0)
    from auth.users u
    left join public.ai_trial_access a on a.user_id = u.id
    left join public.ai_trial_usage x on x.user_id = u.id and x.month = m;
end;
$$;
revoke execute on function public.admin_trial_usage(text) from public, anon;
grant execute on function public.admin_trial_usage(text) to authenticated;

-- Solo administradores: activar/desactivar la prueba de una cuenta y su límite (null = el general).
create or replace function public.admin_set_trial_access(target uuid, enable boolean, limit_usd numeric default null)
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
  insert into public.ai_trial_access (user_id, enabled, limit_usd, updated_at)
  values (target, enable, limit_usd, now())
  on conflict (user_id) do update set enabled = excluded.enabled, limit_usd = excluded.limit_usd, updated_at = now();
end;
$$;
revoke execute on function public.admin_set_trial_access(uuid, boolean, numeric) from public, anon;
grant execute on function public.admin_set_trial_access(uuid, boolean, numeric) to authenticated;
