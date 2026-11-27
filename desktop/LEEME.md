# UniHub para Windows

Programa de escritorio que lleva dentro la app de UniHub.

- **Supabase solo para iniciar sesión, y es opcional.** Ningún dato se guarda allí desde el programa. Si compilas sin `NEXT_PUBLIC_SUPABASE_URL`, el programa funciona sin cuenta: se abre directamente y nada sale de tu ordenador.
- **Base de datos** (asignaturas, tareas, clases, transcripciones, apuntes, notas, progreso): Postgres embebido (PGlite) que funciona en memoria y se guarda entero en `%APPDATA%\UniHub\datos\<cuenta>\datos.tar.gz` (unos segundos después de cada cambio, y siempre al salir). Cada guardado escribe un archivo nuevo y lo cambia por el anterior de golpe, así que un corte nunca lo deja a medias; el guardado previo queda en `datos.anterior.tar.gz`. Una por cuenta. Está fuera de la carpeta sincronizada a propósito: una base de datos dentro de Drive/OneDrive se puede corromper.
- **Carpeta de UniHub** (por defecto `Documentos\UniHub`; se cambia en Ajustes, p. ej. a Google Drive):

```
UniHub\
  Análisis matemático\
    Material\
      01 Tema 1. Funciones\        ← PDF y archivos de Canvas (se descargan solos al sincronizar)
        UA1.pdf
        UA1 - notas.md              ← tus notas y enlaces de ese archivo
    Clases\
      2026-11-12\
        transcripcion.md
        apuntes - resumen.md        ← lo generado con IA
        apuntes - preguntas de repaso.md
        enlaces.md
        video.mp4                   ← si lo añades desde la clase
  _copia de seguridad\
    unihub-tucorreo-2026-11-26.tar.gz   ← copia diaria de la base de datos (se guardan 5)
```

  Los `.md` se regeneran desde la base de datos: si los editas a mano, UniHub los sobrescribirá la próxima vez.
- **Google Drive / OneDrive**: instala Google Drive para escritorio (o usa OneDrive) y en Ajustes → Programa de escritorio pulsa la carpeta que te propone. Todo se mueve allí y se sube solo.
- **Token de Canvas y clave de OpenAI**: cifrados por Windows en `%APPDATA%\UniHub\config.json`. Nunca se suben.
- **Bandeja del sistema**: sincroniza cada 20 min, descarga el material nuevo, hace la copia diaria y avisa con notificaciones de Windows.
- **Datos de la web**: en Ajustes → «Traer mis datos de la web» se copian una vez al programa (y a la carpeta como .md). La web no se modifica.

## Restaurar una copia de seguridad

Si el guardado no se puede leer, UniHub lo aparta (nunca lo borra) y restaura solo la copia de seguridad más reciente. Para restaurar a mano una copia concreta:

1. Cierra UniHub (icono de la bandeja → Salir).
2. En `%APPDATA%\UniHub\datos\<cuenta>\`, renombra `datos.tar.gz` a `datos-antiguo.tar.gz`.
3. Copia ahí la copia de seguridad (`_copia de seguridad\unihub-….tar.gz`) con el nombre `datos.tar.gz`.
4. Abre UniHub.

Si añades una migración en `supabase/migrations`, ejecuta `npm run db:local-migrations` en la carpeta del proyecto para que el programa también la aplique (un test avisa si se te olvida).

## Compilar el instalador (en Windows)

Una vez:

```powershell
cd ruta\al\proyecto\desktop
npm install
```

Para compilar el instalador sin publicarlo:

```powershell
cd ruta\al\proyecto\desktop
npm run dist
```

Genera `desktop\dist\UniHub-Setup-X.Y.Z.exe`. Ese archivo es lo que le pasas a tu amiga **la primera vez**; después se actualiza solo.

- Compila la app con el `.env.local` de la carpeta del proyecto, pero **solo** toma de ahí la URL y la clave publishable de Supabase, que son públicas (y opcionales: sin ellas, modo sin cuenta).
- Antes de empaquetar busca en el resultado todos tus secretos (token de Canvas, OpenAI, Supabase, CRON…). Si encuentra alguno, **aborta**.

Para probar sin instalar: `npm run dev` (compila y abre el programa; ahí no hay actualizaciones automáticas).

## Actualizaciones automáticas

Los programas instalados buscan una versión nueva al abrirse y cada 4 horas. Si la hay, la descargan en segundo plano y avisan con una notificación de Windows. En Ajustes → Actualizaciones aparecen las novedades y el botón «Reiniciar y actualizar»; si no lo pulsan, se instala sola al salir del programa. Los datos (base de datos, claves, carpeta de UniHub) no se tocan.

Los instaladores se publican en **GitHub Releases**, en un repositorio **público que solo contiene instaladores** (tu código no se sube a ningún sitio).

### Preparación (una vez)

1. En GitHub, crea un repositorio **público** y vacío llamado `unihub-releases`.
2. Crea un token: GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
   - Repository access: **Only select repositories** → `unihub-releases`.
   - Permissions → Repository permissions → **Contents: Read and write**.
   - Guárdalo en un sitio seguro (gestor de contraseñas). No lo pegues en ningún archivo del proyecto.
3. En `desktop\release.config.json`, pon tu usuario de GitHub en `"owner"`.

### Publicar una versión nueva

```powershell
cd ruta\al\proyecto\desktop
npm run nueva-version                # 0.1.0 → 0.1.1
notepad NOVEDADES.md                 # qué cambia (lo verán al actualizar)
$env:GH_TOKEN = "github_pat_…"       # solo en esta ventana de PowerShell
npm run release
```

`npm run release` comprueba el token y que la versión no esté ya publicada, compila, revisa que no haya secretos y sube el instalador. Los programas instalados lo descargan en las próximas horas (o al momento con «Buscar actualizaciones»).

## Dar acceso a otra persona

Si compilaste **sin Supabase**, basta con pasarle el `.exe`: no necesita cuenta. Si lo compilaste con Supabase:

1. En Supabase → **Authentication → Users → Add user**: su correo y una contraseña temporal (marca «Auto Confirm User»).
2. **Recomendado**: en Authentication → Sign In / Providers, desactiva **«Allow new users to sign up»**. Así solo entra quien tú crees.
3. Pásale el `.exe` (o el enlace de la última versión en `github.com/<tu-usuario>/unihub-releases/releases/latest`). La primera vez le pedirá su token de Canvas y, si quiere IA, su clave de OpenAI.
4. Que cambie la contraseña en **Ajustes → Contraseña**.

**No** añadas su correo a `ALLOWED_EMAILS` en Vercel. La web y su sincronización usan **tu** token de Canvas: ella usa el programa, que sincroniza con el suyo.

## Al instalar

El instalador no está firmado (un certificado de firma de código es de pago). La primera vez, Windows mostrará «Windows protegió tu PC»: hay que pulsar **Más información → Ejecutar de todas formas**. Las actualizaciones posteriores se instalan sin preguntar.

## Si algo falla

- Registro del servidor interno: `%APPDATA%\UniHub\logs\server.log`.
- Cambiar claves: icono de la bandeja → **Claves de Canvas y OpenAI…**, o **Ajustes → Programa de escritorio**.
