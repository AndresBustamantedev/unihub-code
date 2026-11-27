"use strict";

/**
 * Arranca el servidor de UniHub (Next.js "standalone") dentro del programa, solo en 127.0.0.1
 * y en un puerto libre. Las claves del usuario se le pasan como variables de entorno del proceso:
 * nunca se escriben en disco en claro.
 */
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, utilityProcess } = require("electron");

const LOG_MAX_BYTES = 2 * 1024 * 1024;

function serverDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", "server");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function logStream() {
  const dir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "server.log");
  try {
    if (fs.statSync(file).size > LOG_MAX_BYTES) fs.renameSync(file, `${file}.old`);
  } catch {
    /* no existe todavía */
  }
  return fs.createWriteStream(file, { flags: "a" });
}

async function waitUntilReady(base, timeoutMs = 45_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${base}/login`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* todavía arrancando */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

class LocalServer {
  constructor() {
    this.child = null;
    this.port = null;
    this.secret = null;
    this.stopping = false;
    this.onCrash = null;
  }

  get base() {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }

  async start(cfg) {
    const dir = serverDir();
    const entry = path.join(dir, "server.js");
    if (!fs.existsSync(entry)) throw new Error(`No se encuentra el servidor (${entry}). Ejecuta "npm run build:server" en la carpeta desktop.`);
    fs.mkdirSync(cfg.filesDir, { recursive: true });
    fs.mkdirSync(cfg.dbDir, { recursive: true });

    this.port = await freePort();
    this.secret = crypto.randomBytes(32).toString("hex");
    const env = {
      // Solo lo imprescindible del entorno del sistema.
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(this.port),
      HOSTNAME: "127.0.0.1",
      UNIHUB_DESKTOP: "1",
      DESKTOP_SECRET: this.secret,
      UNIHUB_DB_DIR: cfg.dbDir,
      UNIHUB_FILES_DIR: cfg.filesDir,
      APP_URL: `http://127.0.0.1:${this.port}`,
      // Cualquier cuenta del proyecto de Supabase: las cuentas las crea el administrador.
      ALLOWED_EMAILS: "*",
      CANVAS_BASE_URL: cfg.canvasBaseUrl,
      CREDENTIALS_ENCRYPTION_KEY: cfg.credentialsKey,
      AI_DEFAULT_PROVIDER: "openai",
      OPENAI_MODEL: cfg.openaiModel,
    };
    if (cfg.canvasToken) env.CANVAS_ACCESS_TOKEN = cfg.canvasToken;
    if (cfg.openaiKey) env.OPENAI_API_KEY = cfg.openaiKey;
    // utilityProcess no admite variables sin valor (p. ej. HOME no existe en Windows).
    for (const k of Object.keys(env)) if (typeof env[k] !== "string" || env[k] === "") delete env[k];

    const log = logStream();
    log.write(`\n--- ${new Date().toISOString()} arranque (puerto ${this.port})\n`);
    this.stopping = false;
    this.child = utilityProcess.fork(entry, [], { cwd: dir, env, stdio: "pipe", serviceName: "UniHub (servidor local)" });
    this.child.stdout?.pipe(log, { end: false });
    this.child.stderr?.pipe(log, { end: false });
    this.child.on("exit", (code) => {
      log.write(`--- servidor terminado (código ${code})\n`);
      const crashed = !this.stopping;
      this.child = null;
      if (crashed && this.onCrash) this.onCrash(code);
    });

    const ok = await waitUntilReady(this.base);
    if (!ok) throw new Error("El servidor local no respondió a tiempo. Revisa el registro en %APPDATA%\\UniHub\\logs\\server.log");
    return this.base;
  }

  /** Pide al servidor que cierre la base de datos de forma ordenada (máx. 8 s). */
  async closeDatabases() {
    if (!this.child || !this.base) return;
    try {
      await fetch(`${this.base}/api/desktop/shutdown`, {
        method: "POST",
        headers: { "x-unihub-desktop": this.secret },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      /* el servidor ya no responde */
    }
  }

  async stop() {
    if (!this.child) return;
    this.stopping = true;
    // Primero se cierra la base de datos; si se mata el proceso a mitad, Postgres puede quedar dañado.
    await this.closeDatabases();
    const child = this.child;
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 3000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
      child.kill();
    });
    this.child = null;
  }
}

module.exports = { LocalServer };
