// Abre UniHub en el navegador con datos de ejemplo: sin Canvas, sin Supabase y sin claves.
// Los datos de la demo se guardan en una carpeta temporal y no tocan nada más.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const dir = path.join(os.tmpdir(), "unihub-demo");
const port = process.env.PORT || "3000";
const env = {
  ...process.env,
  UNIHUB_DESKTOP: "1",
  UNIHUB_DEMO: "1",
  UNIHUB_DB_DIR: path.join(dir, "datos"),
  UNIHUB_FILES_DIR: path.join(dir, "archivos"),
  APP_URL: `http://localhost:${port}`,
};
// Sin claves de Canvas ni de IA en la demo, aunque existan en .env.local.
for (const k of ["CANVAS_ACCESS_TOKEN", "OPENAI_API_KEY", "GOOGLE_API_KEY"]) env[k] = "";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
console.log(`\nUniHub · demo con datos de ejemplo → http://localhost:${port}\n`);
const child = spawn(process.execPath, [next, "dev", "-p", port], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
