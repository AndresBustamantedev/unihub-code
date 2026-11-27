import { courseHue } from "./course-color";

export type Motif = "network" | "math" | "code" | "circuit" | "waves";

export function motifFor(name: string): Motif {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/redes|network|comunicacion|internet|protocol/.test(n)) return "network";
  if (/matemat|algebra|calculo|analisis|estadistic|fisica|optimiz|discret/.test(n)) return "math";
  if (/program|software|algoritm|estructuras|codigo|datos|web/.test(n)) return "code";
  if (/computador|informatica|hardware|sistemas|arquitectura|electron/.test(n)) return "circuit";
  return "waves";
}

/** PRNG determinista: la misma asignatura genera siempre la misma portada. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const W = 600;
const H = 200;

function network(r: () => number): string {
  const pts = Array.from({ length: 16 }, () => [r() * W, r() * H] as const);
  let s = "";
  pts.forEach(([x, y], i) => {
    pts.slice(i + 1).forEach(([x2, y2]) => {
      if (Math.hypot(x - x2, y - y2) < 150) s += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/>`;
    });
  });
  pts.forEach(([x, y]) => (s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(3 + r() * 4).toFixed(1)}" fill="#fff" fill-opacity=".7"/>`));
  return s;
}

function math(r: () => number): string {
  const sym = ["∑", "∫", "π", "√", "∞", "Δ", "λ", "∂", "≈", "θ", "ƒ(x)", "dx"];
  let s = "";
  for (let i = 0; i < 22; i++) {
    const size = 18 + r() * 42;
    s += `<text x="${(r() * W).toFixed(0)}" y="${(r() * H + 20).toFixed(0)}" font-size="${size.toFixed(0)}" font-family="Georgia, serif" fill="#fff" fill-opacity="${(0.12 + r() * 0.3).toFixed(2)}" transform="rotate(${((r() - 0.5) * 30).toFixed(0)} ${(r() * W).toFixed(0)} ${(r() * H).toFixed(0)})">${sym[Math.floor(r() * sym.length)]}</text>`;
  }
  return s;
}

function code(r: () => number): string {
  let s = "";
  for (let row = 0; row < 11; row++) {
    let x = 30 + Math.floor(r() * 4) * 22;
    const y = 18 + row * 17;
    const n = 2 + Math.floor(r() * 5);
    for (let k = 0; k < n && x < W - 20; k++) {
      const w = 20 + r() * 90;
      s += `<rect x="${x.toFixed(0)}" y="${y}" width="${w.toFixed(0)}" height="7" rx="3.5" fill="#fff" fill-opacity="${(0.15 + r() * 0.35).toFixed(2)}"/>`;
      x += w + 10;
    }
  }
  s += `<text x="${W - 150}" y="${H - 28}" font-size="64" font-family="ui-monospace, monospace" fill="#fff" fill-opacity=".22">{ }</text>`;
  return s;
}

function circuit(r: () => number): string {
  let s = "";
  for (let i = 0; i < 14; i++) {
    let x = Math.round((r() * W) / 20) * 20;
    let y = Math.round((r() * H) / 20) * 20;
    let d = `M${x} ${y}`;
    for (let k = 0; k < 4; k++) {
      if (r() > 0.5) x += (r() > 0.5 ? 1 : -1) * 40 * (1 + Math.floor(r() * 3));
      else y += (r() > 0.5 ? 1 : -1) * 20 * (1 + Math.floor(r() * 2));
      d += ` L${x} ${y}`;
    }
    s += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>`;
  }
  return s;
}

function waves(r: () => number): string {
  let s = "";
  for (let i = 0; i < 7; i++) {
    const y = 30 + i * 25;
    const a = 10 + r() * 20;
    s += `<path d="M0 ${y} C ${W * 0.25} ${y - a}, ${W * 0.5} ${y + a}, ${W} ${y - a / 2}" fill="none" stroke="#fff" stroke-opacity="${(0.15 + i * 0.04).toFixed(2)}" stroke-width="2"/>`;
  }
  return s;
}

/** SVG de portada como data URI (sin descargas externas). */
export function generatedCover(courseId: string, name: string): string {
  const h = courseHue(courseId);
  const r = rng(courseId);
  const motif = motifFor(name);
  const art = { network, math, code, circuit, waves }[motif](r);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 62% 46%)"/><stop offset="1" stop-color="hsl(${(h + 35) % 360} 58% 30%)"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${art}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
