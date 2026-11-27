import "server-only";
import { readdirSync, rmSync } from "node:fs";
import { getLocalDb } from "@/lib/local-db/pg";
import { relPath, resolveInRoot, writeStreamFile } from "@/lib/local-files";

const BACKUP_DIR = "_copia de seguridad";
const KEEP = 5;

/**
 * Copia de seguridad de la base de datos local en la carpeta de UniHub (si está dentro de Drive o
 * OneDrive, se sube sola). Se guardan las 5 últimas. Para restaurar: ver desktop/LEEME.md.
 */
export async function backupLocalDb(uid: string, email: string | null): Promise<{ rel: string; bytes: number }> {
  const pg = await getLocalDb(uid, email);
  const dump = await pg.dumpDataDir("gzip");
  const who = relPath((email ?? uid).split("@")[0] ?? uid);
  const day = new Date().toISOString().slice(0, 10);
  const rel = `${BACKUP_DIR}/unihub-${who}-${day}.tar.gz`;
  const bytes = await writeStreamFile(rel, dump.stream());
  // Solo las últimas copias de esta cuenta.
  const dir = resolveInRoot(BACKUP_DIR);
  if (dir) {
    const mine = readdirSync(dir)
      .filter((f) => f.startsWith(`unihub-${who}-`) && f.endsWith(".tar.gz"))
      .sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - KEEP))) rmSync(`${dir}/${old}`, { force: true });
  }
  return { rel, bytes };
}
