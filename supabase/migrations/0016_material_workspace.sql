-- UniHub · Espacio de estudio de cada material: notas, enlaces y texto para preguntar a la IA

-- Una nota por material (archivo de un módulo).
create table if not exists public.material_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  module_item_id uuid not null references public.course_module_items (id) on delete cascade,
  content_md text not null default '' check (char_length(content_md) <= 50000),
  updated_at timestamptz not null default now(),
  constraint material_notes_key unique (user_id, module_item_id)
);
create index if not exists material_notes_course_idx on public.material_notes (course_id);
create index if not exists material_notes_item_idx on public.material_notes (module_item_id);

-- Texto extraído del PDF (solo el texto, nunca el archivo) para no descargarlo en cada pregunta.
create table if not exists public.material_texts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_item_id uuid not null references public.course_module_items (id) on delete cascade,
  pages int not null default 0,
  content_text text not null check (char_length(content_text) <= 400000),
  extracted_at timestamptz not null default now(),
  constraint material_texts_key unique (user_id, module_item_id)
);
create index if not exists material_texts_item_idx on public.material_texts (module_item_id);

-- Enlaces de refuerzo también por material.
alter table public.class_resources add column if not exists module_item_id uuid references public.course_module_items (id) on delete cascade;
create index if not exists class_resources_item_idx on public.class_resources (module_item_id);

alter table public.material_notes enable row level security;
alter table public.material_texts enable row level security;
create policy "material_notes_own" on public.material_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "material_texts_own" on public.material_texts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
