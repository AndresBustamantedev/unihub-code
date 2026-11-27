-- UniHub · Color fijo y distinto por asignatura seguida
alter table public.courses add column if not exists color_hue smallint check (color_hue is null or color_hue between 0 and 359);
with palette(idx, hue) as (values (0,221),(1,162),(2,27),(3,271),(4,345),(5,190),(6,45),(7,120),(8,300),(9,0)),
ranked as (select id, user_id, (row_number() over (partition by user_id order by name) - 1) % 10 as idx from public.courses where followed)
update public.courses c set color_hue = p.hue from ranked r join palette p on p.idx = r.idx where c.id = r.id and c.color_hue is null;
