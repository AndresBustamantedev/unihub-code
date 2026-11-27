/** Puente que el programa de escritorio expone a las páginas (window.unihubDesktop). Solo tipos. */
export interface DesktopInfo {
  version: string;
  filesDir: string;
  autoStart: boolean;
  lastSync: string | null;
  lastBackup: string | null;
  hasCanvasToken: boolean;
  hasOpenAiKey: boolean;
  /** Caducidad del token de Canvas según Canvas (si la da). */
  canvasTokenExpiresAt: string | null;
}

export interface SuggestedFolder {
  label: string;
  path: string;
}

export interface DesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  /** Abre la pantalla de claves; con "token", directamente para pegar un token de Canvas nuevo. */
  openSetup(reason?: "token"): Promise<void>;
  syncNow(): Promise<{ ok: boolean; message: string }>;
  setAutoStart(on: boolean): Promise<boolean>;
  openFilesDir(): Promise<void>;
  /** Abre el Explorador con el archivo (ruta relativa a la carpeta de UniHub). */
  showInFolder(rel: string): Promise<void>;
  /** Carpetas de Google Drive / OneDrive detectadas en este ordenador. */
  suggestedFolders(): Promise<SuggestedFolder[]>;
  /** Pide una carpeta y mueve allí los archivos de UniHub. */
  chooseFilesDir(suggested?: string): Promise<{ ok: boolean; filesDir?: string; error?: string; cancelled?: boolean }>;
  /** Pide un vídeo y lo copia a la carpeta de la clase. Devuelve la ruta relativa. */
  importVideo(relFolder: string): Promise<{ ok: boolean; rel?: string; error?: string; cancelled?: boolean }>;
  backupNow(): Promise<{ ok: boolean; message: string }>;
  getUpdate(): Promise<UpdateStatus | null>;
  checkUpdates(): Promise<UpdateStatus | null>;
  /** Guarda todo, cierra e instala la versión descargada (UniHub se vuelve a abrir solo). */
  installUpdate(): Promise<boolean>;
}

export interface UpdateStatus {
  /** dev: el programa no está instalado (npm run dev), no hay actualizaciones. */
  state: "idle" | "checking" | "available" | "downloading" | "ready" | "none" | "error" | "dev" | "off";
  current: string;
  version: string | null;
  notes: string;
  percent: number;
  checkedAt: string | null;
  error: string | null;
}

declare global {
  interface Window {
    unihubDesktop?: DesktopBridge;
  }
}
