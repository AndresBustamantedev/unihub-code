/**
 * Prueba segura de conexión desde terminal, sin Supabase ni navegador:
 *   npm run canvas:check
 * Lee .env.local, ejecuta el mismo diagnóstico que el endpoint y muestra
 * el resultado redactado. Nunca imprime el token.
 */
import { runCanvasDiagnostics } from "../src/integrations/canvas/diagnostics";
import { redact } from "../src/lib/redact";

const ICON = { pass: "✔", fail: "✘", warn: "!", skip: "–" } as const;

const report = await runCanvasDiagnostics();
const lines = [
  `\nCanvas · ${report.overall.toUpperCase()} — ${report.summary}\n`,
  ...report.checks.map((c) => `  ${ICON[c.status]} ${c.label}${c.httpStatus ? ` [HTTP ${c.httpStatus}]` : ""}\n      ${c.detail}`),
  ...(report.nextSteps.length ? ["\nSiguientes pasos:", ...report.nextSteps.map((s, i) => `  ${i + 1}. ${s}`)] : []),
  "",
];
console.log(redact(lines.join("\n"), [process.env.CANVAS_ACCESS_TOKEN]));
process.exit(report.overall === "authenticated" ? 0 : 1);
