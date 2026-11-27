"use strict";

/**
 * Sincronización periódica y notificaciones de Windows.
 * Las peticiones salen del proceso principal hacia el servidor local con las cookies de la
 * sesión del usuario (la misma que usa la ventana) y el secreto de este arranque.
 */
const { net, Notification } = require("electron");

const SYNC_EVERY_MS = 20 * 60 * 1000;
const FIRST_SYNC_DELAY_MS = 60 * 1000;
const MAX_NOTIFICATIONS_PER_ROUND = 5;
const MAX_REMEMBERED = 500;

function request(server, method, pathname) {
  return new Promise((resolve) => {
    if (!server.base) return resolve({ status: 0, body: null });
    const req = net.request({ method, url: `${server.base}${pathname}`, useSessionCookies: true });
    req.setHeader("x-unihub-desktop", server.secret);
    req.setHeader("accept", "application/json");
    let data = "";
    req.on("response", (res) => {
      res.on("data", (chunk) => (data += chunk.toString("utf8")));
      res.on("end", () => {
        let body = null;
        try {
          body = JSON.parse(data);
        } catch {
          /* respuesta no JSON */
        }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on("error", () => resolve({ status: 0, body: null }));
    req.end();
  });
}

class Scheduler {
  /**
   * @param {{ server: import("./server").LocalServer, store: typeof import("./store"), icon: string, open: (path: string) => void }} deps
   */
  constructor(deps) {
    this.deps = deps;
    this.timer = null;
    this.running = false;
  }

  start() {
    this.stop();
    this.timer = setTimeout(() => this.tick(), FIRST_SYNC_DELAY_MS);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async tick() {
    try {
      await this.syncNow();
    } finally {
      this.timer = setTimeout(() => this.tick(), SYNC_EVERY_MS);
    }
  }

  /** Sincroniza y muestra los avisos nuevos. Devuelve un mensaje para la interfaz. */
  async syncNow() {
    if (this.running) return { ok: false, message: "Ya hay una sincronización en marcha." };
    this.running = true;
    try {
      const { server, store } = this.deps;
      const sync = await request(server, "POST", "/api/desktop/sync");
      if (sync.status === 401) return { ok: false, message: "Inicia sesión en UniHub para sincronizar." };
      if (sync.status !== 200) return { ok: false, message: "No se pudo sincronizar (mira «Diagnóstico»)." };
      const token = await this.checkToken(sync.body && sync.body.canvasToken);
      if (token === "expired") {
        await this.dailyBackup();
        return { ok: false, message: "Tu token de Canvas ha caducado: crea uno nuevo en Canvas y pégalo en «Cambiar claves». Tus datos siguen aquí." };
      }
      await store.save({ lastSync: new Date().toISOString() });
      const shown = await this.notify();
      await this.dailyBackup();
      const files = sync.body && sync.body.files;
      const failed = ["courses", "content", "materials", "inbox"].filter((k) => sync.body && !["success", "skipped", "partial"].includes(sync.body[k]));
      return {
        ok: failed.length === 0,
        message: `${failed.length ? `Sincronizado con avisos (${failed.join(", ")}).` : "Sincronizado."}${files && files.downloaded ? ` ${files.downloaded} archivo${files.downloaded === 1 ? "" : "s"} de Canvas guardado${files.downloaded === 1 ? "" : "s"} en tu carpeta.` : ""}${shown ? ` ${shown} notificación${shown === 1 ? "" : "es"} nueva${shown === 1 ? "" : "s"}.` : ""}`,
      };
    } finally {
      this.running = false;
    }
  }

  /**
   * Caducidad del token de Canvas: se guarda la fecha y se avisa con una notificación de Windows
   * una vez cuando faltan pocos días y otra cuando caduca. Al pulsarla se abre la pantalla de claves.
   */
  async checkToken(status) {
    if (!status || typeof status.state !== "string") return null;
    const { store, icon, openSetup } = this.deps;
    const cfg = await store.load();
    const expiresAt = typeof status.expiresAt === "string" ? status.expiresAt : null;
    if (expiresAt !== cfg.canvasTokenExpiresAt) await store.save({ canvasTokenExpiresAt: expiresAt });
    if (status.state !== "expiring" && status.state !== "expired") return status.state;
    const key = `${status.state}:${expiresAt || "?"}`;
    if (cfg.tokenAlerts.includes(key)) return status.state;
    await store.save({ tokenAlerts: [...cfg.tokenAlerts, key].slice(-20) });
    if (Notification.isSupported()) {
      const days = Number(status.daysLeft);
      const n = new Notification({
        title: status.state === "expired" ? "Tu token de Canvas ha caducado" : `Tu token de Canvas caduca ${days === 1 ? "mañana" : `en ${days} días`}`,
        body:
          status.state === "expired"
            ? "UniHub ya no recibe novedades de Canvas. Pulsa aquí para pegar uno nuevo."
            : "Crea uno nuevo en Canvas y pégalo en UniHub para no dejar de sincronizar. Pulsa aquí.",
        icon,
      });
      n.on("click", () => openSetup("token"));
      n.show();
    }
    return status.state;
  }

  /** Copia de seguridad de la base de datos en la carpeta de UniHub, una vez al día. */
  async dailyBackup() {
    const cfg = await this.deps.store.load();
    if (cfg.lastBackup && Date.now() - new Date(cfg.lastBackup).getTime() < 22 * 3_600_000) return;
    await this.backupNow();
  }

  async backupNow() {
    const res = await request(this.deps.server, "POST", "/api/desktop/backup");
    if (res.status !== 200) return { ok: false, message: "No se pudo hacer la copia de seguridad." };
    await this.deps.store.save({ lastBackup: new Date().toISOString() });
    return { ok: true, message: "Copia de seguridad guardada en tu carpeta." };
  }

  async notify() {
    const { server, store, icon, open } = this.deps;
    const cfg = await store.load();
    const q = cfg.lastAlertCheck ? `?desde=${encodeURIComponent(cfg.lastAlertCheck)}` : "";
    const res = await request(server, "GET", `/api/desktop/alerts${q}`);
    if (res.status !== 200 || !res.body) return 0;
    const seen = new Set(cfg.shownAlerts);
    const fresh = (res.body.alerts || []).filter((a) => a && a.key && !seen.has(a.key));
    let shown = 0;
    if (Notification.isSupported()) {
      for (const a of fresh.slice(0, MAX_NOTIFICATIONS_PER_ROUND)) {
        const n = new Notification({ title: String(a.title).slice(0, 120), body: String(a.body || "").slice(0, 250), icon, silent: false });
        n.on("click", () => open(typeof a.path === "string" && a.path.startsWith("/") ? a.path : "/"));
        n.show();
        shown++;
      }
    }
    // Se marcan todas como vistas (también las que no cupieron) para no repetirlas.
    const remembered = [...cfg.shownAlerts, ...fresh.map((a) => a.key)].slice(-MAX_REMEMBERED);
    await store.save({ shownAlerts: remembered, lastAlertCheck: res.body.checkedAt || new Date().toISOString() });
    return shown;
  }
}

module.exports = { Scheduler };
