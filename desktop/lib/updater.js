"use strict";

/**
 * Actualizaciones automáticas desde GitHub Releases (repositorio público solo con instaladores).
 *
 * - Al arrancar (a los 30 s) y cada 4 horas mira si hay una versión nueva.
 * - Si la hay, la descarga en segundo plano y avisa con una notificación de Windows.
 * - Se instala sola al salir del programa, o al momento con «Reiniciar y actualizar».
 * - Los datos (base de datos, claves, carpeta de UniHub) viven fuera del programa: no se tocan.
 *
 * Solo funciona en el programa instalado (no con `npm run dev`).
 */

const fs = require("node:fs");
const path = require("node:path");
const { app, Notification } = require("electron");

const FIRST_CHECK_MS = 30_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/** Notas de la versión en texto plano (GitHub las da en HTML). */
function plainNotes(notes) {
  const raw = Array.isArray(notes) ? notes.map((n) => n && n.note).filter(Boolean).join("\n\n") : notes;
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

class Updater {
  /**
   * @param {{ icon: string, beforeInstall: () => Promise<void>, open: (path: string) => void, log?: (msg: string) => void }} deps
   */
  constructor(deps) {
    this.deps = deps;
    // Compilado sin dirección de publicación (release.config.json sin «owner»): sin actualizaciones.
    const configured = app.isPackaged && fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
    this.enabled = configured;
    /** @type {{ state: "idle"|"checking"|"available"|"downloading"|"ready"|"none"|"error"|"dev"|"off", version: string|null, notes: string, percent: number, checkedAt: string|null, error: string|null }} */
    this.status = { state: !app.isPackaged ? "dev" : configured ? "idle" : "off", version: null, notes: "", percent: 0, checkedAt: null, error: null };
    this.timer = null;
    this.notifiedVersion = null;
    this.au = null;
  }

  start() {
    if (!this.enabled) return;
    const { autoUpdater } = require("electron-updater");
    this.au = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = { info: () => {}, warn: (m) => this.log(m), error: (m) => this.log(m), debug: () => {} };

    autoUpdater.on("checking-for-update", () => this.set({ state: "checking", error: null }));
    autoUpdater.on("update-not-available", () => this.set({ state: "none", checkedAt: new Date().toISOString() }));
    autoUpdater.on("update-available", (info) =>
      this.set({ state: "downloading", version: info.version, notes: plainNotes(info.releaseNotes), percent: 0, checkedAt: new Date().toISOString() }),
    );
    autoUpdater.on("download-progress", (p) => this.set({ state: "downloading", percent: Math.round(p.percent || 0) }));
    autoUpdater.on("update-downloaded", (info) => {
      this.set({ state: "ready", version: info.version, notes: plainNotes(info.releaseNotes) || this.status.notes, percent: 100 });
      this.notifyReady(info.version);
    });
    autoUpdater.on("error", (err) => {
      this.log(`actualización: ${err && err.message}`);
      // Sin conexión o GitHub no responde: se reintentará en la próxima comprobación.
      if (this.status.state !== "ready") this.set({ state: "error", error: "No se pudo comprobar si hay actualizaciones (¿sin conexión?)." });
    });

    setTimeout(() => void this.check(), FIRST_CHECK_MS).unref?.();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
    this.timer.unref?.();
  }

  set(patch) {
    this.status = { ...this.status, ...patch };
  }

  log(msg) {
    if (this.deps.log) this.deps.log(String(msg));
  }

  async check() {
    if (!this.au || this.status.state === "ready" || this.status.state === "downloading") return this.status;
    try {
      await this.au.checkForUpdates();
    } catch {
      /* lo recoge el evento «error» */
    }
    return this.status;
  }

  notifyReady(version) {
    if (this.notifiedVersion === version || !Notification.isSupported()) return;
    this.notifiedVersion = version;
    const n = new Notification({
      title: `UniHub ${version} está lista`,
      body: "Se instalará al cerrar el programa. Pulsa aquí para ver las novedades o actualizar ya.",
      icon: this.deps.icon,
    });
    n.on("click", () => this.deps.open("/ajustes#actualizaciones"));
    n.show();
  }

  /** Cierra el servidor de forma ordenada (guarda la base de datos) e instala la actualización. */
  async installNow() {
    if (!this.au || this.status.state !== "ready") return false;
    await this.deps.beforeInstall();
    // isSilent=true (sin asistente), isForceRunAfter=true (vuelve a abrir UniHub al terminar).
    setImmediate(() => this.au.quitAndInstall(true, true));
    return true;
  }
}

module.exports = { Updater, plainNotes };
