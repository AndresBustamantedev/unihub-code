/**
 * Muestra cómo se clasificarían TODOS tus cursos de Canvas, sin guardar nada:
 *   npm run canvas:courses
 */
import { CanvasClient } from "../src/integrations/canvas/client";
import { readCanvasConfig } from "../src/integrations/canvas/config";
import { CanvasApiError, describeCanvasError } from "../src/integrations/canvas/errors";
import { classifyCourse } from "../src/features/courses/classify";
import { fetchAllCanvasCourses } from "../src/features/courses/fetch";

const config = readCanvasConfig();
if (!config.ok) {
  console.error("Canvas no configurado: ejecuta npm run canvas:check");
  process.exit(1);
}
const client = new CanvasClient({ baseUrl: config.baseUrl, token: config.token });

try {
  const fetched = await fetchAllCanvasCourses(client);
  const order = ["current", "future", "auxiliary", "past"] as const;
  const titles = { current: "ACTUALES", future: "PRÓXIMAS", auxiliary: "AUXILIARES", past: "ANTERIORES" };
  const rows = fetched.map(({ course, seenAs }) => ({ course, seenAs, ...classifyCourse(course) }));
  console.log(`\n${rows.length} cursos visibles en Canvas\n`);
  for (const cat of order) {
    const group = rows.filter((r) => r.category === cat).sort((a, b) => (a.course.name ?? "").localeCompare(b.course.name ?? ""));
    if (!group.length) continue;
    console.log(`── ${titles[cat]} (${group.length})`);
    for (const r of group) {
      const roles = [...new Set((r.course.enrollments ?? []).map((e) => e.type))].join("/");
      console.log(`  [${r.course.id}] ${r.course.name ?? "(sin nombre)"}`);
      console.log(`      ${r.course.course_code ?? ""} · periodo: ${r.course.term?.name ?? "—"} · rol: ${roles || "—"} · ${r.reason}`);
    }
    console.log("");
  }
} catch (err) {
  console.error(err instanceof CanvasApiError ? describeCanvasError(err) : "Error inesperado");
  process.exit(1);
}
