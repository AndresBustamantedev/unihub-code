"use strict";

// Puente mínimo entre las páginas de UniHub y el programa (sin acceso a Node ni a las claves).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("unihubDesktop", {
  getInfo: () => ipcRenderer.invoke("desktop:getInfo"),
  openSetup: (reason) => ipcRenderer.invoke("desktop:openSetup", reason === "token" ? "token" : null),
  syncNow: () => ipcRenderer.invoke("desktop:syncNow"),
  setAutoStart: (on) => ipcRenderer.invoke("desktop:setAutoStart", !!on),
  openFilesDir: () => ipcRenderer.invoke("desktop:openFilesDir"),
  showInFolder: (rel) => ipcRenderer.invoke("desktop:showInFolder", String(rel)),
  suggestedFolders: () => ipcRenderer.invoke("desktop:suggestedFolders"),
  chooseFilesDir: (suggested) => ipcRenderer.invoke("desktop:chooseFilesDir", suggested ? String(suggested) : null),
  importVideo: (relFolder) => ipcRenderer.invoke("desktop:importVideo", String(relFolder)),
  backupNow: () => ipcRenderer.invoke("desktop:backupNow"),
  getUpdate: () => ipcRenderer.invoke("desktop:getUpdate"),
  checkUpdates: () => ipcRenderer.invoke("desktop:checkUpdates"),
  installUpdate: () => ipcRenderer.invoke("desktop:installUpdate"),
});
