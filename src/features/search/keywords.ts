/**
 * De una pregunta en lenguaje natural, las palabras que sirven para buscar: se quitan las de
 * la propia pregunta («en qué clase explicó…», «resúmeme…»), que aparecen en casi todo.
 */
const META = new Set(
  [
    "clase", "clases", "explico", "explicó", "explicaron", "explicar", "explicacion", "explicación", "explica", "explicame", "explícame",
    "vimos", "vio", "vemos", "dimos", "dio", "dijo", "hablo", "habló", "hablamos", "profesor", "profesora", "profe",
    "tema", "temas", "resumen", "resume", "resumeme", "resúmeme", "resumir", "dime", "cuentame", "cuéntame", "sobre",
    "todo", "toda", "todos", "todas", "examen", "examenes", "exámenes", "entra", "entran", "para", "necesito", "quiero",
    "que", "qué", "cual", "cuál", "cuales", "cuáles", "como", "cómo", "donde", "dónde", "cuando", "cuándo", "quien", "quién",
    "por", "porque", "hay", "algo", "alguna", "algun", "algún", "sabes", "puedes", "podrias", "podrías", "ayudame", "ayúdame",
    "asignatura", "material", "apuntes", "documento", "pdf", "transcripcion", "transcripción",
  ].map((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "")),
);

export function questionKeywords(question: string): string {
  const words = question
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 2 && !META.has(w));
  return words.length ? words.join(" ") : question;
}
