// Compila el instalador de Windows y, con --publicar, lo sube a GitHub Releases para que los
// programas ya instalados se actualicen solos.
//
//   npm run dist      → solo compila (desktop/dist/UniHub-Setup-<versión>.exe)
//   npm run release   → compila y publica (necesita GH_TOKEN; ver LEEME.md)
//
// Dónde se publica: desktop/release.config.json ({ owner, repo }). El instalador lleva esa
// dirección dentro, así que hasta uno compilado con «dist» sabe dónde buscar actualizaciones.
//
// Publicación en tres pasos (para evitar que electron-builder cree la versión dos veces a la vez,
// que GitHub rechaza): 1) este script crea la versión como BORRADOR, 2) electron-builder solo sube
// los archivos a ese borrador, 3) el script comprueba que estén todos y la publica.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publish = process.argv.includes("--publicar");
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const cfg = JSON.parse(readFileSync(path.join(root, "release.config.json"), "utf8"));
const owner = String(cfg.owner || "").trim();
const repo = String(cfg.repo || "").trim();
// Sin «owner»: se puede compilar el instalador, pero sin actualizaciones automáticas.
const updates = !!owner && !!repo;
if (publish && !updates) fail("Para publicar falta tu usuario de GitHub en desktop/release.config.json («owner»). Mira LEEME.md → Actualizaciones automáticas.");
if (updates && (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo))) fail("«owner» o «repo» no son válidos en desktop/release.config.json.");
if (!updates) console.log("Aviso: sin «owner» en release.config.json → el instalador no buscará actualizaciones automáticas.");

const version = pkg.version;
const tag = `v${version}`;
const token = process.env.GH_TOKEN;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch con reintentos: si la conexión se corta (pasa tras una subida larga), se repite. */
async function fetchRetry(url, init, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i >= tries) throw err;
      console.log(`  (la conexión con GitHub se cortó; reintento ${i}/${tries - 1}…)`);
      await sleep(2000 * i);
    }
  }
}

/** Petición a la API de GitHub del repositorio de instaladores. */
async function gh(p, method = "GET", body) {
  const res = await fetchRetry(`https://api.github.com/repos/${owner}/${repo}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "unihub-release",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/** Todas las versiones (también borradores, que solo ve quien tiene el token). */
async function listReleases() {
  const r = await gh("/releases?per_page=100");
  return Array.isArray(r.data) ? r.data : [];
}

let draftId = null;

const distDir = path.join(root, "dist");
const exeName = `UniHub-Setup-${version}.exe`;
const needed = [exeName, `${exeName}.blockmap`, "latest.yml"];

/** ¿El programa empaquetado lleva el servidor con sus dependencias? */
function serverPacked() {
  const srv = path.join(distDir, "win-unpacked", "resources", "server");
  return existsSync(path.join(srv, "server.js")) && existsSync(path.join(srv, "node_modules", "next", "package.json"));
}

/** ¿Está compilada en dist/ exactamente esta versión (y completa)? (latest.yml dice la versión). */
function builtLocally() {
  try {
    return serverPacked() && needed.every((n) => existsSync(path.join(distDir, n))) && /^version:\s*['"]?([^'"\s]+)/m.exec(readFileSync(path.join(distDir, "latest.yml"), "utf8"))?.[1] === version;
  } catch {
    return false;
  }
}

/** Sube a la versión (borrador) los archivos que le falten, desde dist/. */
async function uploadMissing(rel) {
  const assets = rel.assets ?? [];
  for (const name of needed) {
    const have = assets.find((a) => a.name === name);
    if (have && have.state === "uploaded") continue;
    if (have) await gh(`/releases/assets/${have.id}`, "DELETE");
    console.log(`  subiendo ${name}…`);
    const data = readFileSync(path.join(distDir, name));
    const res = await fetchRetry(`https://uploads.github.com/repos/${owner}/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "unihub-release", "Content-Type": "application/octet-stream" },
      body: data,
    });
    if (res.status !== 201) fail(`GitHub no aceptó ${name} (${res.status}). Vuelve a ejecutar npm run release.`);
  }
}

/** Comprueba que el borrador tiene todo y lo publica. */
async function finish(id) {
  const rel = await gh(`/releases/${id}`);
  const names = (rel.data?.assets ?? []).filter((a) => a.state === "uploaded").map((a) => a.name);
  const missing = needed.filter((n) => !names.includes(n));
  if (missing.length) {
    if (builtLocally()) {
      await uploadMissing(rel.data);
      return finish(id);
    }
    await gh(`/releases/${id}`, "DELETE");
    fail(`Faltan archivos en GitHub (${missing.join(", ")}): no se publica. Vuelve a ejecutar npm run release.`);
  }
  const pub = await gh(`/releases/${id}`, "PATCH", { draft: false, make_latest: "true" });
  if (pub.status !== 200) fail(`Los archivos están subidos pero no se pudo publicar (${pub.status}). Vuelve a ejecutar npm run release (o publícala a mano: ${rel.data?.html_url}).`);
  console.log(`\n✓ UniHub ${version} publicada: ${pub.data.html_url}`);
  console.log("  Los programas instalados la descargarán en las próximas horas (o al momento con «Buscar actualizaciones» en Ajustes).");
  console.log(`  Para instalarla desde cero: https://github.com/${owner}/${repo}/releases/latest`);
  process.exit(0);
}

if (publish) {
  if (!token) fail('Falta el token de GitHub. En PowerShell:  $env:GH_TOKEN = "github_pat_…"  y vuelve a ejecutar npm run release.');
  const repoRes = await gh("");
  if (repoRes.status === 401) fail("GitHub rechaza el token (¿caducado o mal copiado?).");
  if (repoRes.status === 404) fail(`No encuentro el repositorio ${owner}/${repo} (o el token no tiene acceso a él).`);
  if (repoRes.data?.private) fail(`${owner}/${repo} es privado: los programas instalados no podrían descargar las actualizaciones. Hazlo público (solo contiene instaladores).`);
  const commits = await gh("/commits?per_page=1");
  if (commits.status === 409) fail(`El repositorio ${owner}/${repo} está vacío. En GitHub, añade un README (Add a README → Commit changes) y vuelve a ejecutar npm run release.`);

  // ¿Ya existe esta versión? Completa → no se toca. Las que quedaron a medias (subidas fallidas, de
  // esta u otra versión) no sirven a nadie: se borran, con su etiqueta.
  for (const rel of await listReleases()) {
    const complete = !rel.draft && (rel.assets ?? []).some((a) => a.name === "latest.yml");
    if (complete) {
      if (rel.tag_name === tag) fail(`La versión ${version} ya está publicada. Sube la versión con:  npm run nueva-version`);
      continue;
    }
    if (rel.tag_name === tag && rel.draft && builtLocally()) {
      // Una subida anterior de esta versión se cortó: se termina sin volver a compilar.
      console.log(`La versión ${version} quedó a medias en GitHub y ya está compilada: la termino sin volver a compilar.`);
      await finish(rel.id);
    }
    console.log(`La versión ${rel.tag_name} quedó a medias en GitHub: la borro.`);
    const del = await gh(`/releases/${rel.id}`, "DELETE");
    if (del.status !== 204) fail(`No pude borrar la versión a medias ${rel.tag_name} (${del.status}). Bórrala a mano en GitHub y vuelve a intentarlo.`);
    if (rel.tag_name && (await gh(`/git/refs/tags/${rel.tag_name}`)).status === 200) await gh(`/git/refs/tags/${rel.tag_name}`, "DELETE");
  }
  if ((await gh(`/git/refs/tags/${tag}`)).status === 200) await gh(`/git/refs/tags/${tag}`, "DELETE");

  // 1) Borrador (no necesita etiqueta todavía).
  let notes = "";
  try {
    notes = readFileSync(path.join(root, "NOVEDADES.md"), "utf8").trim();
  } catch {
    /* sin novedades */
  }
  const draft = await gh("/releases", "POST", { tag_name: tag, name: `UniHub ${version}`, body: notes || `UniHub ${version}`, draft: true });
  if (draft.status !== 201) fail(`GitHub no dejó crear la versión (${draft.status}): ${JSON.stringify(draft.data?.errors ?? draft.data?.message ?? "")}`);
  draftId = draft.data.id;
  console.log(`Publicando UniHub ${version} en github.com/${owner}/${repo}…`);
}

// Node se lanza directamente (sin consola: «C:\Program Files» tiene un espacio). npx en Windows es
// un .cmd y necesita la consola; sus argumentos no llevan espacios.
const run = (cmd, args, shell = false) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell });
try {
  run(process.execPath, [path.join(here, "prepare.mjs")]);
  // 2) electron-builder compila y sube los archivos al borrador (no crea versiones).
  run(
    "npx",
    [
      "electron-builder",
      "--win",
      "--publish",
      publish ? "always" : "never",
      ...(updates
        ? ["-c.publish.provider=github", `-c.publish.owner=${owner}`, `-c.publish.repo=${repo}`, "-c.publish.releaseType=draft"]
        : ["-c.publish=null"]),
    ],
    process.platform === "win32",
  );
} catch {
  // Si ya está compilada, el borrador se conserva: la próxima vez se termina sin recompilar.
  if (draftId && !builtLocally()) await gh(`/releases/${draftId}`, "DELETE");
  fail("La compilación o la subida falló (mira el error de arriba). No se ha publicado nada: vuelve a ejecutar npm run release (si ya estaba compilada, solo terminará la subida).");
}

// El programa empaquetado tiene que llevar el servidor con sus dependencias (Next.js…): sin ellas
// se instala pero no arranca («Cannot find module 'next'»).
if (!serverPacked()) {
  if (draftId) await gh(`/releases/${draftId}`, "DELETE");
  fail("El instalador no lleva el servidor completo (falta node_modules en resources/server). Revisa «extraResources» en desktop/package.json. No se ha publicado nada.");
}

if (publish) {
  // 3) Comprobar que están todos los archivos (si falta alguno, se sube desde dist/) y publicar.
  await finish(draftId);
} else {
  console.log(`\n✓ Instalador listo: desktop/dist/UniHub-Setup-${version}.exe`);
}
