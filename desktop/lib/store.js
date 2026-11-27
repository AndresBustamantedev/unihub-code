"use strict";

/**
 * Configuración local del programa (en %APPDATA%\UniHub\config.json).
 * Las claves (token de Canvas, OpenAI, clave de cifrado) se cifran con safeStorage:
 * en Windows usa DPAPI, así que solo el mismo usuario de Windows en este ordenador
 * puede descifrarlas. Nunca se suben a internet.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, safeStorage } = require("electron");

const SECRET_FIELDS = ["canvasToken", "openaiKey", "credentialsKey"];
// Sin valor por defecto: la universidad se elige en la configuración inicial.
const DEFAULT_CANVAS_URL = "";

function file() {
  return path.join(app.getPath("userData"), "config.json");
}

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, file());
}

async function encrypt(value) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error("El cifrado del sistema no está disponible en este ordenador.");
  return (await safeStorage.encryptStringAsync(value)).toString("base64");
}

async function decrypt(value) {
  if (!value) return { value: null, reEncrypt: false };
  try {
    const r = await safeStorage.decryptStringAsync(Buffer.from(value, "base64"));
    return { value: r.result, reEncrypt: !!r.shouldReEncrypt };
  } catch {
    return { value: null, reEncrypt: false };
  }
}

/** Configuración completa con las claves descifradas (solo para el proceso principal). */
async function load() {
  const raw = readRaw();
  const cfg = {
    canvasBaseUrl: raw.canvasBaseUrl || DEFAULT_CANVAS_URL,
    openaiModel: raw.openaiModel || "gpt-6.1-sol",
    // Carpeta de archivos (material, clases, vídeos, copias): la elige el usuario (p. ej. dentro de Google Drive).
    filesDir: raw.filesDir || raw.dataDir || path.join(app.getPath("documents"), "UniHub"),
    // Bases de datos: siempre en %APPDATA% (una carpeta sincronizada podría corromperlas).
    dbDir: path.join(app.getPath("userData"), "datos"),
    lastBackup: raw.lastBackup || null,
    lastSync: raw.lastSync || null,
    lastAlertCheck: raw.lastAlertCheck || null,
    shownAlerts: Array.isArray(raw.shownAlerts) ? raw.shownAlerts : [],
    trayHintShown: !!raw.trayHintShown,
    // Caducidad del token de Canvas (la da Canvas) y avisos ya mostrados sobre ella.
    canvasTokenExpiresAt: raw.canvasTokenExpiresAt || null,
    tokenAlerts: Array.isArray(raw.tokenAlerts) ? raw.tokenAlerts : [],
    // Modo demo: datos de ejemplo, sin Canvas ni cuenta.
    demo: raw.demo === true,
  };
  const rotate = {};
  for (const k of SECRET_FIELDS) {
    const d = await decrypt(raw[k]);
    cfg[k] = d.value;
    // Windows puede rotar su clave: se vuelve a cifrar con la nueva.
    if (d.value && d.reEncrypt) rotate[k] = d.value;
  }
  // Clave propia de este ordenador para cifrar la contraseña de la universidad guardada en UniHub.
  if (!cfg.credentialsKey) {
    cfg.credentialsKey = crypto.randomBytes(32).toString("base64");
    rotate.credentialsKey = cfg.credentialsKey;
  }
  if (Object.keys(rotate).length) await save(rotate);
  return cfg;
}

/** Guarda solo los campos indicados; las claves se cifran. `null` borra una clave, `undefined` la deja igual. */
async function save(patch) {
  const raw = readRaw();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (SECRET_FIELDS.includes(k)) {
      if (v === null || v === "") delete raw[k];
      else raw[k] = await encrypt(String(v));
    } else {
      raw[k] = v;
    }
  }
  writeRaw(raw);
}

/** Lo que puede ver la pantalla de configuración: nunca las claves en sí. */
function publicView(cfg) {
  return {
    canvasBaseUrl: cfg.canvasBaseUrl,
    openaiModel: cfg.openaiModel,
    filesDir: cfg.filesDir,
    hasCanvasToken: !!cfg.canvasToken,
    hasOpenAiKey: !!cfg.openaiKey,
    demo: cfg.demo,
  };
}

module.exports = { load, save, publicView, DEFAULT_CANVAS_URL };
