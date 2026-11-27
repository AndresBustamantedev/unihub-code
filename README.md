# UniHub · beta

Tu actividad universitaria de **Canvas**, tus **clases** y tus **apuntes** en un solo sitio.

UniHub se conecta a Canvas con tu propio token, ordena tus asignaturas, tareas, anuncios y material, te avisa de lo que se acerca y te ayuda a estudiar con IA: resúmenes de clase, búsqueda en todo lo que tienes, preguntas con fuentes y tarjetas de repaso.

Es un proyecto personal de código abierto pensado para que **cada persona lo instale con sus propias claves**. Funciona como web (en tu ordenador o en Vercel) o como **programa de Windows** con todos los datos en tu ordenador.

> **Beta.** Funciona y se usa a diario, pero puede tener fallos. Haz copias de seguridad (el programa las hace solo) y abre un *issue* si algo no va.
>
> **No es oficial.** No tiene relación con Instructure (Canvas) ni con ninguna universidad. Usa la API de Canvas con tu token personal, como cualquier integración propia: revisa las normas de uso de tu universidad.

---

## Qué puedes hacer

**Canvas, ordenado y al día**
- Asignaturas con portada, color, profesores y horario; agrupadas por semestre (hasta 10).
- Tareas pendientes con fechas, entregadas y calificaciones; anuncios, mensajes y cambios recientes.
- Calendario semanal en Inicio con clases y entregas.
- Material de cada asignatura con visor integrado (PDF, texto, HTML…), notas y enlaces por documento.
- Sincronización automática y avisos antes de cada entrega (notificaciones del navegador o de Windows).
- Aviso cuando tu token de Canvas está a punto de caducar.

**Clases**
- Importa la transcripción de una clase (Teams `.vtt` o `.docx`, o texto) y guarda el enlace a la grabación.
- Marca si la has visto, si la entendiste y cuándo la repasaste; aviso si se te olvidó importar alguna.
- En el programa: guarda el vídeo de la clase y míralo dentro de UniHub.

**Estudiar con IA** (con tu clave de OpenAI)
- Por cada clase: resumen, preguntas de repaso y ejercicios.
- Pregunta a la IA sobre cualquier PDF del material: responde con las páginas de donde sale.
- **Buscar** en todas tus transcripciones, apuntes, notas y material (sin importar tildes) y **preguntar a una asignatura entera**, con las fuentes citadas.
- **Tarjetas de repaso** creadas con IA a partir de tus clases y PDF, con repetición espaciada (como Anki).
- **Exámenes**: pones la fecha y qué entra, y el repaso se organiza para que llegues con todo visto.

**Programa de Windows**
- Todos tus datos en tu ordenador (Postgres embebido). Supabase solo se usa para iniciar sesión.
- Carpeta de UniHub con todo ordenado por asignatura (material, transcripciones, apuntes en Markdown y vídeos), que puedes poner dentro de Google Drive u OneDrive.
- Copia de seguridad diaria, recuperación automática si algo se daña y actualizaciones automáticas (opcional).

---

## Elige cómo usarlo

| | Programa de Windows | Web en tu ordenador | Web en Vercel |
|---|---|---|---|
| Dónde están tus datos | En tu ordenador | En tu proyecto de Supabase | En tu proyecto de Supabase |
| Desde el móvil | No | No | Sí |
| Material y vídeos guardados en local | Sí | No | No |
| Sincronización automática | Sí (cada 20 min con el programa abierto) | Mientras esté abierta | Sí (cron) |
| Coste | Gratis | Gratis | Gratis (plan Hobby, uso personal) |
| Dificultad | Media (hay que compilar el instalador) | Baja | Media |

En los tres casos necesitas un **proyecto de Supabase** (gratis) para iniciar sesión. Las claves de Canvas y OpenAI son **las tuyas**: nadie más las ve.

---

## Requisitos

- **Node.js 20.9 o superior** (recomendado 22 LTS) y **Git**.
- Una cuenta gratuita de **Supabase**: https://supabase.com
- Tu **token de Canvas** (te explico cómo sacarlo abajo).
- Opcional: una **clave de OpenAI** para las funciones de IA: https://platform.openai.com
- Para el programa: **Windows 10/11**.

Descarga el código:

```bash
git clone https://github.com/AndresBustamantedev/unihub-code.git
cd unihub-code
npm install
```

---

## Paso 1 · Tus claves

### Canvas

1. Entra en tu campus Canvas → **Cuenta → Configuración**.
2. En **Integraciones aprobadas**, pulsa **+ Nuevo token de acceso**.
3. Ponle un propósito («UniHub») y la fecha de caducidad más lejana que te deje. Algunas universidades limitan los tokens a 30 días: UniHub te avisará antes de que caduque.
4. Copia el token; solo se muestra una vez.

Necesitas también la **dirección de tu campus** terminada en `/api/v1`, por ejemplo `https://tu-universidad.instructure.com/api/v1`.

### OpenAI (opcional)

En https://platform.openai.com → **API keys → Create new secret key**. OpenAI cobra por uso a tu cuenta. Con el modelo económico (Luna), un mes de uso intenso cuesta del orden de 1 $. Recomendado: en **Settings → Limits**, pon un **tope mensual de gasto** y activa *Enforce a hard limit*.

---

## Paso 2 · Supabase

1. Crea un proyecto en https://supabase.com (gratis).
2. **Project Settings → API**: apunta la **Project URL** y la **publishable key** (`sb_publishable_…`).
3. **Authentication → Users → Add user**: crea tu usuario con tu correo y una contraseña (marca *Auto Confirm User*).
4. Recomendado: en **Authentication → Sign In / Providers**, desactiva **Allow new users to sign up**. Así solo entra quien tú crees.

### Solo para la web: la base de datos

Si vas a usar **solo el programa de Windows**, sáltate esto: el programa crea su propia base de datos en tu ordenador.

Para la web, ejecuta las migraciones de `supabase/migrations/` **en orden** (de `0001` a la última). Dos formas:

- **Con la terminal** (Supabase CLI): `npx supabase login`, `npx supabase link --project-ref TU_REF` y `npx supabase db push`.
- **A mano**: en Supabase → **SQL Editor**, abre cada archivo en orden, pega su contenido y pulsa **Run**. Si avisa de *destructive operations*, es por líneas `drop policy if exists`, que se pueden ejecutar sin problema.

Después, **hazte administrador** (sin esto la web no te deja guardar datos). En el SQL Editor, con tu correo:

```sql
insert into public.app_admins (user_id)
select id from auth.users where lower(email) = lower('tu-correo@ejemplo.com')
on conflict (user_id) do nothing;
```

---

## Paso 3A · Web en tu ordenador

1. Copia `.env.example` como `.env.local` y rellena al menos:
   - `APP_URL=http://localhost:3000`
   - `ALLOWED_EMAILS=` tu correo
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `CANVAS_BASE_URL` y `CANVAS_ACCESS_TOKEN`
   - `OPENAI_API_KEY` si quieres IA
2. Arranca:
   ```bash
   npm run dev
   ```
3. Abre http://localhost:3000, inicia sesión y ve a **Diagnóstico** para comprobar que Canvas responde. Después pulsa **Sincronizar ahora** en Inicio.

Para tenerla siempre lista sin modo desarrollo: `npm run build` y `npm start`.

## Paso 3B · Web en Vercel (accesible desde el móvil)

1. Sube tu copia del código a un repositorio de GitHub (puede ser privado) e impórtalo en https://vercel.com → **Add New → Project**. También puedes desplegar desde la terminal con `npx vercel --prod`.
2. En **Settings → Environment Variables**, añade las de `.env.example` que uses:
   - Obligatorias: `APP_URL` (tu dirección de Vercel), `ALLOWED_EMAILS`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CANVAS_BASE_URL`, `CANVAS_ACCESS_TOKEN`.
   - Para la sincronización automática: `SUPABASE_SECRET_KEY` y `CRON_SECRET`.
   - Para IA: `OPENAI_API_KEY`.
   - Opcionales: avisos push (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) y `CREDENTIALS_ENCRYPTION_KEY`.
3. En Supabase → **Authentication → URL Configuration**, pon tu dirección de Vercel como *Site URL*.
4. Despliega. Las variables solo se aplican en el siguiente despliegue.

**Sincronización automática.** `vercel.json` programa una sincronización al día (el máximo del plan gratuito). Para más frecuencia, llama a `https://TU-APP.vercel.app/api/cron/sync` con la cabecera `Authorization: Bearer <CRON_SECRET>` desde un cron externo (por ejemplo cron-job.org, o el de tu hosting con `docs/cron-unihub.php`).

> Nunca pongas un secreto en una variable que empiece por `NEXT_PUBLIC_`: esas se ven en el navegador.

## Paso 3C · Programa de Windows (datos en tu ordenador)

En Windows, con Node.js instalado:

1. En la carpeta del proyecto, crea `.env.local` solo con:
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   ```
   El programa solo toma de aquí estas dos, que son públicas. Antes de empaquetar comprueba que ningún secreto acaba dentro del programa, y si encuentra alguno, se para.
2. Prueba el programa sin instalarlo:
   ```bash
   cd desktop
   npm install
   npm run dev
   ```
3. Compila el instalador:
   ```bash
   npm run dist
   ```
   Lo encontrarás en `desktop/dist/UniHub-Setup-X.Y.Z.exe`.
4. Al abrirlo por primera vez te pide la dirección de tu Canvas, tu token y, si quieres, tu clave de OpenAI. Se guardan **cifradas por Windows** en tu ordenador y nunca se suben a ningún sitio.

El instalador no está firmado (un certificado de firma cuesta dinero). La primera vez Windows mostrará «Windows protegió tu PC»: pulsa **Más información → Ejecutar de todas formas**.

Más detalles del programa (carpeta de UniHub, Google Drive, copias de seguridad, restaurar, actualizaciones automáticas con GitHub Releases, compartirlo con otra persona) en [`desktop/LEEME.md`](desktop/LEEME.md).

---

## Opcional · Compartir UniHub con amigos

- **Programa:** pásales tu instalador y créales un usuario en Supabase (Authentication → Add user). Cada uno pone **su** token de Canvas y **su** clave de OpenAI; sus datos quedan en su ordenador.
- **Copia en la web:** desde Ajustes → Usuarios (administrador) puedes permitir que alguien guarde una copia de sus datos en tu Supabase. Si no lo activas, Supabase rechaza cualquier dato suyo.
- **Prueba gratuita de IA:** si quieres que prueben la IA sin poner su clave, tu web puede hacer de intermediaria con **tu** clave, siempre con el modelo económico y con un límite al mes por persona. La clave nunca sale de tu web. Para activarla:
  1. En Vercel: `UNIHUB_TRIAL_ENABLED=1`, `SUPABASE_SECRET_KEY` y, recomendado, `TRIAL_OPENAI_API_KEY` (de un proyecto de OpenAI con tope de gasto). El límite por persona se cambia con `TRIAL_MONTHLY_USD` (por defecto 0,50 $).
  2. Al compilar el programa, en `.env.local`: `NEXT_PUBLIC_UNIHUB_TRIAL_URL=https://TU-APP.vercel.app`.
  3. En Ajustes → Usuarios (administrador), activa «IA de prueba» a cada persona.

---

## Seguridad y privacidad

- Tus claves solo viven en el servidor (o cifradas en tu ordenador): nunca llegan al navegador, a las URLs ni a los registros.
- Todas las tablas de Supabase tienen seguridad por filas (RLS): cada usuario solo ve lo suyo.
- La contraseña de la universidad (opcional, para copiarla con un clic) se guarda cifrada con AES-256-GCM y nunca se muestra.
- No hay *scraping* ni automatización del inicio de sesión de la universidad: solo la API oficial de Canvas con tu token.
- Lo que se manda a la IA es el texto de tus clases y documentos, directamente a OpenAI con tu clave.

---

## Desarrollo

```bash
npm run dev          # web en http://localhost:3000
npm test             # tests (Vitest)
npm run typecheck    # TypeScript
npm run canvas:check # comprueba la conexión con Canvas usando .env.local
```

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase (Auth + Postgres con RLS); programa de escritorio con Electron y PGlite (Postgres en WebAssembly).
- **Migraciones:** en `supabase/migrations/`. Si añades una, ejecuta `npm run db:local-migrations` para que el programa de escritorio también la aplique. Las que empiezan por `-- unihub:solo-web` solo se aplican en Supabase.
- **Estructura:** `src/app` (páginas y rutas), `src/features` (lógica por funcionalidad), `src/integrations` (Canvas e IA), `src/lib` (base de datos, autenticación, utilidades), `desktop/` (programa de Windows), `tests/`.

## Licencia

[MIT](LICENSE). Úsalo, modifícalo y compártelo libremente.
