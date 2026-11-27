-- UniHub · Portadas de asignatura y agrupación por semestre
-- canvas_image_url: imagen de la tarjeta de Canvas (si la universidad la puso).
-- cover_url: portada elegida por el alumno (URL https de una imagen). semester: 1 o 2.
alter table public.courses add column if not exists canvas_image_url text;
alter table public.courses add column if not exists cover_url text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 2000));
alter table public.courses add column if not exists semester smallint check (semester is null or semester between 1 and 2);
