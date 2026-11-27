/**
 * Nombres de carpeta/archivo válidos en Windows, macOS y en Google Drive/OneDrive:
 * sin caracteres prohibidos, sin nombres reservados (CON, NUL…), sin punto ni espacio al final
 * y con longitud limitada (las rutas de Windows tienen límite).
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function safeSegment(name: string, max = 80): string {
  let s = name
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (!s) s = "sin nombre";
  if (RESERVED.test(s)) s = `_${s}`;
  if (s.length > max) {
    const ext = /\.[a-z0-9]{1,6}$/i.exec(s)?.[0] ?? "";
    s = `${s.slice(0, max - ext.length).trim()}${ext}`;
  }
  return s;
}
