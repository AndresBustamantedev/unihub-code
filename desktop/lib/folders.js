"use strict";

/**
 * Carpeta de archivos de UniHub: detección de Google Drive / OneDrive, cambio de carpeta
 * (moviendo lo que haya) y operaciones seguras dentro de ella.
 */
const fs = require("node:fs");
const path = require("node:path");

/** Ruta absoluta dentro de la carpeta, o null si se sale (evita "../"). */
function inside(root, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  if (!r || r.startsWith("..") || path.isAbsolute(r)) return null;
  return abs;
}

/** Google Drive para escritorio (unidad virtual, normalmente G:) y OneDrive. */
function suggestedFolders() {
  const out = [];
  const seen = new Set();
  const add = (label, p) => {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isDirectory() && !seen.has(p.toLowerCase())) {
        seen.add(p.toLowerCase());
        out.push({ label, path: p });
      }
    } catch {
      /* sin acceso */
    }
  };
  if (process.platform === "win32") {
    for (const letter of "DEFGHIJKLMNOPQRSTUVWXYZ") {
      add("Google Drive (Mi unidad)", `${letter}:\\Mi unidad`);
      add("Google Drive (My Drive)", `${letter}:\\My Drive`);
    }
  }
  const home = process.env.USERPROFILE || process.env.HOME || "";
  add("Google Drive", path.join(home, "Google Drive"));
  add("Google Drive (Mi unidad)", path.join(home, "Google Drive", "Mi unidad"));
  add("OneDrive", process.env.OneDrive);
  add("OneDrive (personal)", process.env.OneDriveConsumer);
  add("OneDrive (universidad)", process.env.OneDriveCommercial);
  return out;
}

/** Al elegir una carpeta se usa una subcarpeta "UniHub" dentro (salvo que ya se llame así). */
function targetFor(chosen) {
  return path.basename(chosen).toLowerCase() === "unihub" ? chosen : path.join(chosen, "UniHub");
}

function isEmptyDir(p) {
  try {
    return fs.readdirSync(p).length === 0;
  } catch {
    return true;
  }
}

/** Mueve el contenido de la carpeta antigua a la nueva (renombrar si se puede; si no, copiar y borrar). */
function moveContents(from, to) {
  if (!fs.existsSync(from) || isEmptyDir(from)) {
    fs.mkdirSync(to, { recursive: true });
    return;
  }
  const rel = path.relative(from, to);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new Error("La carpeta nueva no puede estar dentro de la actual.");
  if (!fs.existsSync(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try {
      fs.renameSync(from, to);
      return;
    } catch {
      /* otra unidad: copiar */
    }
  }
  fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
  fs.rmSync(from, { recursive: true, force: true });
}

/** Versiones anteriores guardaban la base de datos en <carpeta de archivos>\datos: se pasa a %APPDATA%. */
function migrateLegacyDb(filesDir, dbDir) {
  const legacy = path.join(filesDir, "datos");
  if (!fs.existsSync(legacy) || isEmptyDir(legacy)) return false;
  fs.mkdirSync(dbDir, { recursive: true });
  for (const uid of fs.readdirSync(legacy)) {
    const src = path.join(legacy, uid);
    const dst = path.join(dbDir, uid);
    if (fs.existsSync(dst)) continue;
    try {
      fs.renameSync(src, dst);
    } catch {
      fs.cpSync(src, dst, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    }
  }
  if (isEmptyDir(legacy)) fs.rmSync(legacy, { recursive: true, force: true });
  return true;
}

module.exports = { inside, suggestedFolders, targetFor, moveContents, migrateLegacyDb };
