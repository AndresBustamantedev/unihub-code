"use strict";

/**
 * Elegir la universidad: lista corta de campus conocidos + el buscador público de Canvas
 * («Encuentra tu centro», el mismo que usa la app oficial de Canvas). Nunca envía el token:
 * solo el texto que escribe el usuario.
 */

/** Campus Canvas conocidos (dirección comprobada). Se muestran primero al buscar. */
const KNOWN = [
  { name: "Universidad Europea", domain: "campus.europaeducationgroup.es", country: "España" },
  { name: "UCAM · Universidad Católica de Murcia", domain: "cv.ucam.edu", country: "España" },
  { name: "ENAE Business School", domain: "enae.instructure.com", country: "España" },
  { name: "Pontificia Universidad Católica de Chile", domain: "cursos.canvas.uc.cl", country: "Chile" },
  { name: "Universidad de los Andes (Chile)", domain: "canvas.uandes.cl", country: "Chile" },
];

const SEARCH_URL = "https://canvas.instructure.com/api/v1/accounts/search";

/** Quita tildes y pasa a minúsculas para comparar nombres. */
function fold(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Acepta lo que el usuario pegue («campus.uni.es», «https://campus.uni.es/courses/12», «…/api/v1»)
 * y devuelve la dirección de la API: https://<dominio>/api/v1. null si no parece una dirección.
 */
function normalizeCanvasUrl(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const port = u.port && u.port !== "443" ? `:${u.port}` : "";
  return `https://${host}${port}/api/v1`;
}

function knownMatches(term) {
  const t = fold(term);
  return KNOWN.filter((k) => fold(`${k.name} ${k.domain}`).includes(t));
}

/**
 * Busca universidades por nombre. Devuelve hasta 8 resultados: primero los conocidos y después
 * los del buscador de Canvas (si responde; sin conexión solo salen los conocidos).
 */
async function searchSchools(term, fetchImpl = fetch) {
  const q = String(term || "").trim().slice(0, 80);
  if (q.length < 3) return [];
  const results = knownMatches(q).map((k) => ({ name: k.name, domain: k.domain, known: true }));
  try {
    const url = `${SEARCH_URL}?name=${encodeURIComponent(q)}&per_page=10`;
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        for (const it of list) {
          const domain = typeof it?.domain === "string" ? it.domain.trim().toLowerCase() : "";
          const name = typeof it?.name === "string" ? it.name.trim() : "";
          if (!domain || !name || !normalizeCanvasUrl(domain)) continue;
          if (results.some((r) => r.domain === domain)) continue;
          results.push({ name: name.slice(0, 120), domain, known: false });
        }
      }
    }
  } catch {
    /* sin conexión o el buscador no responde: quedan los conocidos y escribir la dirección a mano */
  }
  return results.slice(0, 8);
}

module.exports = { KNOWN, normalizeCanvasUrl, searchSchools };
