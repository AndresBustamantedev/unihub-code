/**
 * Copia las migraciones de supabase/migrations a un módulo TypeScript para que el programa de
 * escritorio cree la misma estructura en su base de datos local. Ejecutar tras añadir una migración:
 *   node scripts/gen-local-migrations.mjs
 * (Un test comprueba que el archivo generado está al día.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "supabase", "migrations");
// Las marcadas con «-- unihub:solo-web» son solo para Supabase (permisos de la web).
const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .filter((f) => !fs.readFileSync(path.join(dir, f), "utf8").startsWith("-- unihub:solo-web"))
  .sort();
const items = files.map((f) => `  { name: ${JSON.stringify(f)}, sql: ${JSON.stringify(fs.readFileSync(path.join(dir, f), "utf8"))} },`);
const out = `// Generado por scripts/gen-local-migrations.mjs. No editar a mano.\nexport const LOCAL_MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [\n${items.join("\n")}\n];\n`;
fs.writeFileSync(path.join(root, "src", "lib", "local-db", "migrations.generated.ts"), out);
console.log(`${files.length} migraciones → src/lib/local-db/migrations.generated.ts`);
