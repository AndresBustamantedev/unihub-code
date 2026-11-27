export type ThemePref = "light" | "dark" | "system";
export const THEME_COOKIE = "unihub-theme";

export function parseTheme(v: string | undefined | null): ThemePref {
  return v === "dark" || v === "system" ? v : "light";
}

/**
 * Script en <head> para el modo automático: aplica .dark según el sistema antes de pintar
 * (sin parpadeo) y sigue los cambios. Es estático: no interpola datos del usuario.
 */
export const SYSTEM_THEME_SCRIPT = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.classList.toggle('dark',m.matches)};a();m.addEventListener('change',a)}catch(e){}})();`;
