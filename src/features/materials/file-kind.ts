/** Qué se puede ver dentro de UniHub y cómo (sin descargar). */
export type ViewerKind = "pdf" | "image" | "video" | "audio" | "text" | "html" | "office" | "none";

const OFFICE = /^application\/(vnd\.openxmlformats-officedocument|vnd\.ms-|msword)/;

export function viewerKind(contentType: string | null | undefined, name = ""): ViewerKind {
  const ct = (contentType ?? "").toLowerCase().split(";")[0]!.trim();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (ct.startsWith("image/") && ct !== "image/svg+xml") return "image";
  if (ct.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (ct.startsWith("audio/") || ["mp3", "m4a", "wav", "ogg"].includes(ext)) return "audio";
  if (ct === "text/html" || ext === "html" || ext === "htm") return "html";
  if (ct.startsWith("text/") || ["txt", "md", "csv", "c", "cpp", "h", "java", "py", "js", "ts", "json"].includes(ext)) return "text";
  if (OFFICE.test(ct) || ["docx", "doc", "pptx", "ppt", "xlsx", "xls"].includes(ext)) return "office";
  return "none";
}

/** Tipos que se sirven "inline" desde nuestro dominio. HTML y texto van en sandbox (sin scripts ni cookies). */
export function inlineHeaders(kind: ViewerKind): Record<string, string> {
  const base: Record<string, string> = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (kind === "html" || kind === "text") return { ...base, "Content-Security-Policy": "sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; media-src https:; frame-ancestors 'self'" };
  return { ...base, "Content-Security-Policy": "frame-ancestors 'self'" };
}
