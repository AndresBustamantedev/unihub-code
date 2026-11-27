import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { NextResponse } from "next/server";
import { z } from "zod";
import { safeFilename } from "@/features/classes/markdown";
import { fetchFileBody, fetchFileInfo } from "@/features/materials/files";
import { requireUser } from "@/lib/auth/guard";
import { logger } from "@/lib/redact";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Puede tardar: descarga cada archivo de Canvas y lo va metiendo en el ZIP sobre la marcha. */
export const maxDuration = 300;

/**
 * ZIP con TODOS los archivos de los módulos de una asignatura, en carpetas por módulo.
 * Se genera en streaming: no se guarda nada en UniHub ni en Supabase.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "unauthenticated" ? 401 : 403 });
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const db = await createSupabaseServerClient();
  const [{ data: course }, { data: modules }, { data: items }] = await Promise.all([
    db.from("courses").select("name, course_code").eq("id", id).maybeSingle(),
    db.from("course_modules").select("id, name, position").eq("course_id", id).is("missing_since", null).order("position"),
    db.from("course_module_items").select("module_id, title, content_id, position").eq("course_id", id).eq("item_type", "File").is("missing_since", null).order("position"),
  ]);
  if (!course) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const modName = new Map((modules ?? []).map((m, i) => [m.id, `${String(i + 1).padStart(2, "0")} ${safeFilename(m.name)}`]));
  const files = (items ?? []).filter((i) => i.content_id);
  const root = safeFilename(course.course_code ?? course.name);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const used = new Set<string>();
      const errors: string[] = [];
      for (const f of files) {
        try {
          const info = await fetchFileInfo(Number(f.content_id));
          if (info.locked || !info.url) {
            errors.push(`${info.name}: bloqueado en Canvas`);
            continue;
          }
          const res = await fetchFileBody(info.url);
          if (!res.ok || !res.body) {
            errors.push(`${info.name}: Canvas respondió ${res.status}`);
            continue;
          }
          let path = `${root}/${modName.get(f.module_id) ?? "Otros"}/${safeFilename(info.name)}`;
          for (let n = 2; used.has(path); n++) path = path.replace(/(\.[^./]+)?$/, ` (${n})$1`);
          used.add(path);
          // Sin recomprimir: PDF, vídeo e imágenes ya van comprimidos.
          const entry = new ZipPassThrough(path);
          zip.add(entry);
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            entry.push(value);
          }
          entry.push(new Uint8Array(0), true);
        } catch (err) {
          errors.push(`${f.title}: ${err instanceof Error ? err.message : "error"}`);
        }
      }
      const readme = [
        `Material de ${course.name}`,
        `Descargado de Canvas con UniHub el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}.`,
        `${files.length - errors.length} de ${files.length} archivos.`,
        ...(errors.length ? ["", "No se pudieron descargar:", ...errors.map((e) => `- ${e}`)] : []),
      ].join("\n");
      const info = new ZipPassThrough(`${root}/LEEME.txt`);
      zip.add(info);
      info.push(strToU8(readme), true);
      if (errors.length) logger.warn("material_zip_partial", { failed: errors.length, total: files.length });
      zip.end();
    },
  });

  const name = `${root}-material.zip`;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
