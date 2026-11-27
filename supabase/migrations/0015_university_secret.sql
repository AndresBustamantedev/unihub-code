-- UniHub · Contraseña de la universidad CIFRADA (AES-256-GCM) con una clave que solo existe en el servidor
-- (CREDENTIALS_ENCRYPTION_KEY). En la base de datos nunca hay texto plano.
alter table public.profiles add column if not exists university_secret text check (university_secret is null or (university_secret like 'v1:%' and char_length(university_secret) <= 1000));
