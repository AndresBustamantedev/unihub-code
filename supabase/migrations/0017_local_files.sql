-- UniHub · Archivos en la carpeta local del programa de escritorio (rutas relativas a esa carpeta).
-- En la web estas columnas quedan vacías.
alter table public.class_sessions add column if not exists local_video text check (local_video is null or char_length(local_video) <= 1000);
alter table public.course_module_items add column if not exists local_path text check (local_path is null or char_length(local_path) <= 1000);
