"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("unihubSetup", {
  get: () => ipcRenderer.invoke("setup:get"),
  save: (data) => ipcRenderer.invoke("setup:save", data),
  openExternal: (url) => ipcRenderer.invoke("setup:openExternal", url),
  searchSchools: (term) => ipcRenderer.invoke("setup:searchSchools", term),
  knownSchools: () => ipcRenderer.invoke("setup:knownSchools"),
  startDemo: () => ipcRenderer.invoke("setup:demo"),
});
