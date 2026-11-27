"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("unihubSetup", {
  get: () => ipcRenderer.invoke("setup:get"),
  save: (data) => ipcRenderer.invoke("setup:save", data),
  openExternal: (url) => ipcRenderer.invoke("setup:openExternal", url),
});
