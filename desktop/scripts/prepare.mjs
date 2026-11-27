/**
 * Prepara el servidor de UniHub que va dentro del programa de escritorio:
 *  1. Compila la app (Next.js) en modo "standalone".
 *  2. Copia el resultado, los estáticos y /public a desktop/server.
 *  3. Quita cualquier .env y comprueba que NINGÚN secreto del .env.local del que compila
 *     (token de Canvas, claves de OpenAI/Supabase…) ha acabado dentro: si aparece, se aborta.
 *     El programa recibe las claves de cada usuario al arrancar, nunca de la compilación.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, "..");
const root = path.resolve(desktop, "..");
const out = path.join(desktop, "server");

const SECRET_VARS = ["CANVAS_ACCESS_TOKEN", "OPENAI_API_KEY", "GOOGLE_API_KEY", "SUPABASE_SECRET_KEY", "CRON_SECRET", "VAPID_PRIVATE_KEY", "CREDENTIALS_ENCRYPTION_KEY"];

function step(msg) {
  console.log(`\n▸ ${msg}`);
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function findServerJs(dir, depth = 0) {
  if (depth > 4) return null;
  const direct = path.join(dir, "server.js");
  if (fs.existsSync(direct)) return direct;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name !== "node_modules" && !e.name.startsWith(".")) {
      const found = findServerJs(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

// 1. Compilar
step("Compilando UniHub para el escritorio (next build, standalone)…");
const build = spawnSync("npx", ["next", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, UNIHUB_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" },
});
if (build.status !== 0) {
  console.error("\n✗ La compilación ha fallado.");
  process.exit(1);
}

// 2. Copiar
const standalone = path.join(root, ".next", "standalone");
const serverJs = fs.existsSync(standalone) ? findServerJs(standalone) : null;
if (!serverJs) {
  console.error("\n✗ No se generó .next/standalone/server.js. ¿Está activado output: 'standalone' con UNIHUB_DESKTOP_BUILD=1 en next.config.ts?");
  process.exit(1);
}
const appDir = path.dirname(serverJs);
step(`Copiando el servidor a ${path.relative(root, out)}…`);
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(appDir, out, { recursive: true, dereference: true });
// Si la app estaba anidada (monorepo), los node_modules quedan en la raíz del standalone.
if (appDir !== standalone && fs.existsSync(path.join(standalone, "node_modules")) && !fs.existsSync(path.join(out, "node_modules"))) {
  fs.cpSync(path.join(standalone, "node_modules"), path.join(out, "node_modules"), { recursive: true, dereference: true });
}
fs.cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });

// Seguro: el servidor no puede llevar dentro el proyecto (ni el propio programa o sus instaladores).
{
  const intruders = ["desktop", "_to_delete", "src", "tests", "supabase", ".git"].filter((d) => fs.existsSync(path.join(out, d)));
  const sizeOf = (dir) => {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) n += sizeOf(p);
      else if (e.isFile()) n += fs.statSync(p).size;
    }
    return n;
  };
  const mb = Math.round(sizeOf(out) / 1048576);
  if (intruders.length || mb > 600) {
    console.error(`\n✗ El servidor compilado ocupa ${mb} MB y lleva carpetas del proyecto (${intruders.join(", ") || "—"}). Revisa outputFileTracingExcludes en next.config.ts.`);
    process.exit(1);
  }
  console.log(`  servidor: ${mb} MB`);
}
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });

// 3. Sin .env y sin secretos
step("Quitando archivos .env y buscando secretos…");
for (const f of fs.readdirSync(out)) if (f.startsWith(".env")) fs.rmSync(path.join(out, f), { force: true });
const env = { ...readEnvFile(path.join(root, ".env")), ...readEnvFile(path.join(root, ".env.local")) };
const secrets = SECRET_VARS.map((k) => [k, env[k]]).filter(([, v]) => v && v.length >= 16);
const leaks = [];
for (const file of walk(out)) {
  const name = path.basename(file);
  if (name.startsWith(".env")) leaks.push(`${path.relative(out, file)} (archivo .env)`);
  const stat = fs.statSync(file);
  if (stat.size > 15 * 1024 * 1024 || !/\.(m?js|cjs|json|html|txt|map|rsc|body|meta)$/i.test(name)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const [k, v] of secrets) if (text.includes(v)) leaks.push(`${path.relative(out, file)} contiene ${k}`);
}
if (leaks.length) {
  fs.rmSync(out, { recursive: true, force: true });
  console.error("\n✗ ABORTADO: se han encontrado secretos en la compilación. No distribuyas este programa.\n" + leaks.map((l) => `  - ${l}`).join("\n"));
  process.exit(1);
}

const pub = env.NEXT_PUBLIC_SUPABASE_URL ? new URL(env.NEXT_PUBLIC_SUPABASE_URL).host : "(sin configurar)";
console.log(`\n✓ Servidor listo en desktop/server (Supabase: ${pub}). Secretos comprobados: ${secrets.length}, ninguno incluido.`);
