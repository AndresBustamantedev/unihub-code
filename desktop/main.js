"use strict";

/**
 * UniHub para Windows.
 * - Lleva dentro el servidor de UniHub (Next.js) y lo arranca en 127.0.0.1.
 * - La cuenta y los datos estructurados siguen en Supabase (los mismos que la web).
 * - El token de Canvas y la clave de OpenAI se guardan cifrados en este ordenador.
 * - Se queda en la bandeja, sincroniza cada 20 min y avisa con notificaciones de Windows.
 */
const path = require("node:path");
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell, session } = require("electron");
const store = require("./lib/store");
const { LocalServer } = require("./lib/server");
const { Scheduler } = require("./lib/sync");
const folders = require("./lib/folders");
const { Updater } = require("./lib/updater");
const fs = require("node:fs");

const APP_ID = "com.unihub.desktop";
// En Windows, .ico (con varios tamaños) para ventana y barra de tareas.
const ICON = path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png");
const NOTIFY_ICON = path.join(__dirname, "assets", "icon.png");
const TRAY_ICON = path.join(__dirname, "assets", "tray.png");
const startHidden = process.argv.includes("--hidden");

let mainWindow = null;
let setupWindow = null;
let tray = null;
let quitting = false;
const server = new LocalServer();
const updater = new Updater({
  icon: NOTIFY_ICON,
  open: (p) => showMain(p),
  // Antes de instalar: guardar la base de datos y parar el servidor (como al salir).
  beforeInstall: async () => {
    quitting = true;
    scheduler.stop();
    await server.stop();
    stopped = true;
  },
  log: (msg) => {
    try {
      const dir = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "actualizaciones.log"), `${new Date().toISOString()} ${msg}\n`);
    } catch {
      /* sin registro */
    }
  },
});
const scheduler = new Scheduler({ server, store, icon: NOTIFY_ICON, open: (p) => showMain(p), openSetup: (reason) => openSetup(reason) });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMain());
}

app.setAppUserModelId(APP_ID);

// ---------- Ventanas ----------

/**
 * Icono de la barra de tareas. Con un AppUserModelId propio, Windows usa el icono del ejecutable
 * (el de Electron mientras no está instalado), no el de la ventana: se le indica explícitamente.
 */
function taskbarIcon(win) {
  if (process.platform !== "win32" || !win || win.isDestroyed()) return;
  try {
    win.setAppDetails({ appId: APP_ID, appIconPath: path.join(__dirname, "assets", "icon.ico"), appIconIndex: 0 });
  } catch {
    /* no disponible */
  }
}

function isInternal(url) {
  return !!server.base && (url === server.base || url.startsWith(`${server.base}/`));
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function hardenWebContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON, webPreferences: { sandbox: true, contextIsolation: true } } };
    }
    openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (!isInternal(url) && !url.startsWith("file:")) {
      event.preventDefault();
      openExternal(url);
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: ICON,
    title: "UniHub",
    autoHideMenuBar: true,
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  taskbarIcon(mainWindow);
  hardenWebContents(mainWindow.webContents);
  mainWindow.on("close", (event) => {
    if (quitting) return;
    // Cerrar = minimizar a la bandeja, para seguir sincronizando y avisando.
    event.preventDefault();
    mainWindow.hide();
    void store.load().then(async (cfg) => {
      if (!cfg.trayHintShown && tray) {
        tray.displayBalloon?.({ title: "UniHub sigue abierto", content: "Seguirá sincronizando y avisándote. Para salir, usa el icono junto al reloj.", iconType: "info" });
        await store.save({ trayHintShown: true });
      }
    });
  });
  // Windows se apaga o se cierra la sesión: cerrar la base de datos antes de que maten el proceso.
  mainWindow.on("session-end", () => {
    quitting = true;
    void server.closeDatabases();
  });
  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });
  void mainWindow.loadURL(server.base);
}

function showMain(pathname) {
  if (!server.base) return;
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (pathname) void mainWindow.loadURL(`${server.base}${pathname}`);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Motivo con el que se abrió la pantalla de claves ("token": el de Canvas ha caducado o va a caducar). */
let setupReason = null;

function openSetup(reason = null) {
  if (reason) setupReason = reason;
  if (setupWindow && !setupWindow.isDestroyed()) {
    if (reason) setupWindow.reload();
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: "UniHub · Configuración",
    icon: ICON,
    autoHideMenuBar: true,
    parent: mainWindow && mainWindow.isVisible() ? mainWindow : undefined,
    modal: !!(mainWindow && mainWindow.isVisible()),
    webPreferences: { preload: path.join(__dirname, "setup-preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  taskbarIcon(setupWindow);
  hardenWebContents(setupWindow.webContents);
  void setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.on("closed", async () => {
    setupWindow = null;
    // Si se cierra sin configurar nada la primera vez, no hay nada que mostrar.
    if (!server.base && !(await store.load()).canvasToken) app.quit();
  });
}

// ---------- Bandeja ----------

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip("UniHub");
  const refresh = () => {
    const auto = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir UniHub", click: () => showMain() },
        { label: "Sincronizar ahora", click: async () => tray.setToolTip(`UniHub · ${(await scheduler.syncNow()).message}`) },
        { type: "separator" },
        { label: "Claves de Canvas y OpenAI…", click: () => openSetup() },
        { label: "Abrir al iniciar Windows", type: "checkbox", checked: auto, click: (item) => setAutoStart(item.checked) },
        { label: "Abrir carpeta de UniHub", click: async () => void shell.openPath((await store.load()).filesDir) },
        { type: "separator" },
        { label: "Salir", click: () => quit() },
      ]),
    );
  };
  refresh();
  tray.on("click", () => showMain());
  tray.on("right-click", refresh);
}

function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, args: ["--hidden"] });
  return app.getLoginItemSettings().openAtLogin;
}

// ---------- Servidor ----------

async function startServer() {
  const cfg = await store.load();
  // Versiones anteriores tenían la base de datos dentro de la carpeta de archivos.
  try {
    folders.migrateLegacyDb(cfg.filesDir, cfg.dbDir);
  } catch (err) {
    dialog.showErrorBox("UniHub", `No se pudo mover la base de datos a su nueva ubicación: ${err instanceof Error ? err.message : err}`);
  }
  try {
    await server.start(cfg);
  } catch (err) {
    dialog.showErrorBox("UniHub no pudo arrancar", err instanceof Error ? err.message : String(err));
    app.quit();
    return false;
  }
  return true;
}

async function restartServer() {
  scheduler.stop();
  await server.stop();
  if (!(await startServer())) return;
  if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(server.base);
  else createMainWindow();
  scheduler.start();
}

const crashes = [];
server.onCrash = async () => {
  // Un fallo puntual del servidor no debe dejar la ventana en blanco: se reinicia,
  // pero si falla 3 veces en 10 minutos se avisa en vez de entrar en bucle.
  const now = Date.now();
  crashes.push(now);
  while (crashes.length && now - crashes[0] > 10 * 60 * 1000) crashes.shift();
  if (crashes.length > 3) {
    dialog.showErrorBox("UniHub", "El servidor local se ha detenido varias veces. Revisa %APPDATA%\\UniHub\\logs\\server.log y vuelve a abrir el programa.");
    return;
  }
  await restartServer();
};

async function quit() {
  quitting = true;
  scheduler.stop();
  await server.stop();
  stopped = true;
  app.quit();
}

// ---------- Comunicación con las páginas ----------

function fromMainWindow(event) {
  return isInternal(event.senderFrame?.url ?? "");
}

function fromSetup(event) {
  return (event.senderFrame?.url ?? "").startsWith("file:") && setupWindow && event.sender === setupWindow.webContents;
}

ipcMain.handle("desktop:getInfo", async (event) => {
  if (!fromMainWindow(event)) return null;
  const cfg = await store.load();
  return {
    version: app.getVersion(),
    filesDir: cfg.filesDir,
    autoStart: app.getLoginItemSettings().openAtLogin,
    lastSync: cfg.lastSync,
    lastBackup: cfg.lastBackup,
    hasCanvasToken: !!cfg.canvasToken,
    hasOpenAiKey: !!cfg.openaiKey,
    canvasTokenExpiresAt: cfg.canvasTokenExpiresAt,
  };
});
ipcMain.handle("desktop:openSetup", (event, reason) => {
  if (fromMainWindow(event)) openSetup(reason === "token" ? "token" : null);
});
ipcMain.handle("desktop:syncNow", async (event) => (fromMainWindow(event) ? scheduler.syncNow() : { ok: false, message: "" }));
ipcMain.handle("desktop:setAutoStart", (event, on) => (fromMainWindow(event) ? setAutoStart(!!on) : false));
ipcMain.handle("desktop:openFilesDir", async (event) => {
  if (!fromMainWindow(event)) return;
  const { filesDir } = await store.load();
  fs.mkdirSync(filesDir, { recursive: true });
  await shell.openPath(filesDir);
});
ipcMain.handle("desktop:showInFolder", async (event, rel) => {
  if (!fromMainWindow(event)) return;
  const abs = folders.inside((await store.load()).filesDir, rel);
  if (abs && fs.existsSync(abs)) shell.showItemInFolder(abs);
});
ipcMain.handle("desktop:suggestedFolders", (event) => (fromMainWindow(event) ? folders.suggestedFolders() : []));
ipcMain.handle("desktop:chooseFilesDir", async (event, suggested) => {
  if (!fromMainWindow(event)) return { ok: false, error: "No permitido." };
  const cfg = await store.load();
  let chosen = typeof suggested === "string" && suggested ? suggested : null;
  if (!chosen) {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Elige dónde guardar la carpeta de UniHub",
      buttonLabel: "Usar esta carpeta",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: path.dirname(cfg.filesDir),
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true };
    chosen = r.filePaths[0];
  }
  if (!path.isAbsolute(chosen) || !fs.existsSync(chosen)) return { ok: false, error: "Esa carpeta no existe." };
  const target = folders.targetFor(chosen);
  if (path.resolve(target).toLowerCase() === path.resolve(cfg.filesDir).toLowerCase()) return { ok: true, filesDir: target };
  try {
    folders.moveContents(cfg.filesDir, target);
  } catch (err) {
    return { ok: false, error: `No se pudieron mover los archivos: ${err instanceof Error ? err.message : err}` };
  }
  await store.save({ filesDir: target });
  await restartServer();
  return { ok: true, filesDir: target };
});
ipcMain.handle("desktop:importVideo", async (event, relFolder) => {
  if (!fromMainWindow(event)) return { ok: false, error: "No permitido." };
  const { filesDir } = await store.load();
  const folderAbs = folders.inside(filesDir, relFolder);
  if (!folderAbs) return { ok: false, error: "Carpeta de clase no válida." };
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "Elige el vídeo de la clase",
    buttonLabel: "Añadir a UniHub",
    properties: ["openFile"],
    filters: [{ name: "Vídeos", extensions: ["mp4", "m4v", "webm", "mov", "mkv"] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true };
  const src = r.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  fs.mkdirSync(folderAbs, { recursive: true });
  let name = `video${ext}`;
  for (let n = 2; fs.existsSync(path.join(folderAbs, name)); n++) name = `video (${n})${ext}`;
  try {
    await fs.promises.copyFile(src, path.join(folderAbs, name));
  } catch (err) {
    return { ok: false, error: `No se pudo copiar: ${err instanceof Error ? err.message : err}` };
  }
  return { ok: true, rel: `${relFolder}/${name}` };
});
ipcMain.handle("desktop:getUpdate", (event) => (fromMainWindow(event) ? { ...updater.status, current: app.getVersion() } : null));
ipcMain.handle("desktop:checkUpdates", async (event) => (fromMainWindow(event) ? { ...(await updater.check()), current: app.getVersion() } : null));
ipcMain.handle("desktop:installUpdate", async (event) => (fromMainWindow(event) ? updater.installNow() : false));
ipcMain.handle("desktop:backupNow", async (event) => (fromMainWindow(event) ? scheduler.backupNow() : { ok: false, message: "" }));

ipcMain.handle("setup:get", async (event) => (fromSetup(event) ? { ...store.publicView(await store.load()), reason: setupReason } : null));
ipcMain.handle("setup:openExternal", (event, url) => {
  if (fromSetup(event)) openExternal(String(url));
});
ipcMain.handle("setup:save", async (event, input) => {
  if (!fromSetup(event)) return { ok: false, error: "No permitido." };
  const cfg = await store.load();
  const canvasBaseUrl = String(input?.canvasBaseUrl || "").trim().replace(/\/+$/, "");
  const canvasToken = String(input?.canvasToken || "").trim();
  const openaiKey = String(input?.openaiKey || "").trim();
  const openaiModel = ["gpt-6.1-sol", "gpt-6-luna"].includes(input?.openaiModel) ? input.openaiModel : "gpt-6.1-sol";
  if (!/^https:\/\/[^/]+\/api\/v1$/.test(canvasBaseUrl)) return { ok: false, error: "La dirección de Canvas debe ser https://…/api/v1" };
  const token = canvasToken || cfg.canvasToken;
  if (!token) return { ok: false, error: "Falta el token de Canvas." };
  // Se comprueba el token contra Canvas antes de guardarlo.
  try {
    const res = await fetch(`${canvasBaseUrl}/users/self`, { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" });
    if (res.status === 401) return { ok: false, error: "Canvas rechaza el token: revisa que esté bien copiado y no haya caducado." };
    if (!res.ok) return { ok: false, error: `Canvas respondió ${res.status}. Revisa la dirección.` };
  } catch {
    return { ok: false, error: "No se pudo conectar con Canvas. Revisa la dirección y tu conexión." };
  }
  if (openaiKey && !/^sk-[A-Za-z0-9_-]{20,}$/.test(openaiKey)) return { ok: false, error: "La clave de OpenAI debe empezar por «sk-»." };
  await store.save({
    canvasBaseUrl,
    openaiModel,
    canvasToken: canvasToken || undefined,
    openaiKey: input?.removeOpenAi ? null : openaiKey || undefined,
    // Token nuevo: se olvida la caducidad del anterior (la próxima sincronización trae la nueva).
    ...(canvasToken ? { canvasTokenExpiresAt: null, tokenAlerts: [] } : {}),
  });
  setupReason = null;
  await restartServer();
  setupWindow?.close();
  showMain();
  return { ok: true };
});

// ---------- Arranque ----------

app.on("window-all-closed", () => {
  // No se cierra: sigue en la bandeja.
});

let stopped = false;
app.on("before-quit", (event) => {
  quitting = true;
  // Salida por cualquier vía (menú, Windows, actualización): esperar al cierre ordenado del servidor.
  if (!stopped && server.child) {
    event.preventDefault();
    scheduler.stop();
    void server.stop().finally(() => {
      stopped = true;
      app.quit();
    });
  }
});

async function boot() {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  // Solo se conceden permisos de portapapeles (copiar usuario/contraseña) y notificaciones.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["clipboard-sanitized-write", "notifications", "fullscreen"].includes(permission));
  });
  buildTray();
  updater.start();
  const cfg = await store.load();
  if (!cfg.canvasToken) {
    // Primera vez: pedir las claves antes de arrancar.
    openSetup();
    return;
  }
  if (!(await startServer())) return;
  createMainWindow();
  scheduler.start();
}

void app.whenReady().then(() =>
  boot().catch((err) => {
    dialog.showErrorBox("UniHub no pudo arrancar", err instanceof Error ? err.message : String(err));
    app.quit();
  }),
);
