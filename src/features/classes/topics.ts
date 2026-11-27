/**
 * Temas probables de una clase por frecuencia de términos (sin IA).
 * Determinista y barato; la FASE 7 añade el resumen con IA.
 */
const STOP = new Set(
  (
    "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien bueno cada casi como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entonces entre era eramos eran eres es esa esas ese eso esos esta estaba estado estais estamos estan estar estas este esto estos estoy fue fueron fui ha hace hacer hacia han has hasta hay he la las le les lo los mas me mi mis mismo mucho muy nada ni no nos nosotros o os otra otras otro otros para pero poco por porque pues que quien se sea sean ser si sido sin sobre solo son su sus tambien tan tanto te tenemos tener tengo ti tiene tienen todo todos tu tus un una unas uno unos usted ustedes va vais vale vamos van vez y ya yo " +
    "ahora aqui alli bueno claro digamos dice dicho decir eh ehm em mm vale okay ok perfecto entonces pues osea o sea cosa cosas vale vamos veis ver vemos tema temas parte gracias hola minuto minutos segundo momento dia hoy manana semana clase pregunta preguntas igual verdad cierto mira mirad fijaos fijate creo puede pueden podemos puedo quiero quieren quiere tenia tenido hecho hacemos hago hacen sabe sabeis saber sabemos dar dame poner pone pongo luego despues primero segunda tercera vez veces caso casos forma manera tipo the and that this you for are with have not but what was can will just like know yeah right so " +
    "esto eso aquello alguien nadie cualquier mientras aunque segun sino tal tales cual"
  ).split(/\s+/),
);

function norm(w: string): string {
  return w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function extractTopics(text: string, k = 8): string[] {
  // Quitamos los prefijos "Hablante: " para no contar nombres propios.
  const body = text.replace(/^[^:\n]{2,80}:\s/gm, " ");
  const tokens = body.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+/g) ?? [];
  const surface = new Map<string, Map<string, number>>();
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  let prev: string | null = null;

  for (const raw of tokens) {
    const n = norm(raw);
    if (n.length < 4 || STOP.has(n)) {
      prev = null;
      continue;
    }
    uni.set(n, (uni.get(n) ?? 0) + 1);
    const forms = surface.get(n) ?? new Map<string, number>();
    const lower = raw.toLowerCase();
    forms.set(lower, (forms.get(lower) ?? 0) + 1);
    surface.set(n, forms);
    if (prev) bi.set(`${prev} ${n}`, (bi.get(`${prev} ${n}`) ?? 0) + 1);
    prev = n;
  }

  const display = (n: string) =>
    n
      .split(" ")
      .map((p) => [...(surface.get(p)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? p)
      .join(" ");

  const candidates = [
    ...[...bi.entries()].filter(([, c]) => c >= 3).map(([t, c]) => ({ t, score: c * 2.5 })),
    ...[...uni.entries()].filter(([, c]) => c >= 3).map(([t, c]) => ({ t, score: c })),
  ].sort((a, b) => b.score - a.score);

  const chosen: string[] = [];
  for (const c of candidates) {
    if (chosen.length >= k) break;
    const parts = c.t.split(" ");
    if (chosen.some((x) => x.split(" ").some((p) => parts.includes(p)))) continue;
    chosen.push(c.t);
  }
  return chosen.map(display);
}
