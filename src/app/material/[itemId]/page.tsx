import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, Maximize2 } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/app/app-shell";
import { buttonClass } from "@/components/ui/button";
import { fetchFileInfo, getFileSiblings, getModuleFile, type FileInfo } from "@/features/materials/files";
import { neighborsOf } from "@/features/materials/neighbors";
import { viewerKind } from "@/features/materials/file-kind";
import { Sk } from "@/components/app/skeletons";
import { Suspense } from "react";
import { isDesktop } from "@/lib/desktop";
import { localFileInfo } from "@/lib/local-files";
import { ShowInFolderButton } from "@/components/app/show-in-folder";
import { listResources } from "@/features/resources/queries";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { AI_LABEL, MODEL_OPTIONS } from "@/integrations/ai/shared";
import { FileNav } from "./file-nav";
import { MaterialWorkspace } from "./workspace";
import { FlashcardsPanel } from "@/components/app/flashcards-panel";
import { CanvasApiError, describeCanvasError } from "@/integrations/canvas/errors";
import { requirePageUser } from "@/lib/auth/page-guard";
import { displayCourseName } from "@/lib/course-color";
import { formatBytes } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Material" };
/** Las preguntas a la IA (server action) se ejecutan en esta ruta: margen para documentos largos. */
export const maxDuration = 60;

function modelLabel(provider: keyof typeof AI_LABEL, model: string) {
  return `${AI_LABEL[provider]} · ${MODEL_OPTIONS[provider].find((m) => m.id === model)?.label ?? model}`;
}

function Viewer({ src, info }: { src: string; info: FileInfo }) {
  const frame = "h-[75dvh] w-full rounded-lg border border-border bg-white lg:h-full";
  switch (info.kind) {
    case "pdf":
      return <iframe src={src} title={info.name} className={frame} />;
    case "html":
    case "text":
      // sandbox vacío: sin scripts, formularios ni acceso a la sesión de UniHub.
      return <iframe src={src} title={info.name} sandbox="" className={frame} />;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={info.name} className="mx-auto max-h-full rounded-lg border border-border" />;
    case "video":
      return <video src={src} controls preload="metadata" className="max-h-[75dvh] w-full rounded-lg bg-black" />;
    case "audio":
      return <audio src={src} controls className="w-full" />;
    case "office":
      return (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Los documentos de Word, PowerPoint o Excel no se pueden previsualizar aquí sin subirlos a otro servicio. Descárgalo para abrirlo.
        </p>
      );
    default:
      return <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Este tipo de archivo no tiene vista previa. Descárgalo para abrirlo.</p>;
  }
}

/** Pide a Canvas los datos del archivo y muestra el visor (se carga aparte, con Suspense). */
async function ViewerSection({ contentId, src }: { contentId: number; src: string }) {
  let info: FileInfo | null = null;
  let error: string | null = null;
  try {
    info = await fetchFileInfo(contentId);
    if (info.locked || !info.url) error = "Canvas tiene este archivo bloqueado o no permite descargarlo.";
  } catch (err) {
    error = err instanceof CanvasApiError ? describeCanvasError(err) : "No se pudo consultar el archivo en Canvas.";
  }
  if (error || !info) return <p className="rounded-lg border border-urgent/30 bg-card p-4 text-sm text-urgent">{error}</p>;
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <Viewer src={src} info={info} />
      </div>
      <p className="text-right text-[11px] text-muted-foreground">{[info.contentType, formatBytes(info.size)].filter(Boolean).join(" · ")}</p>
    </div>
  );
}

/** Archivo ya guardado en la carpeta de UniHub. */
function LocalViewer({ src, name, size, contentType }: { src: string; name: string; size: number; contentType: string | null }) {
  const info: FileInfo = { name, size, contentType, kind: viewerKind(contentType, name), url: null, locked: false };
  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <Viewer src={src} info={info} />
      </div>
      <p className="text-right text-[11px] text-muted-foreground">{[contentType, formatBytes(size), "guardado en tu carpeta"].filter(Boolean).join(" · ")}</p>
    </div>
  );
}

export default async function MaterialPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  await requirePageUser(`/material/${itemId}`);
  if (!z.uuid().safeParse(itemId).success) notFound();
  const supabase = await createSupabaseServerClient();
  const item = await getModuleFile(supabase, itemId);
  if (!item) notFound();

  // Lo que viene de Supabase se carga ya; lo que hay que pedir a Canvas (el archivo) va aparte
  // con Suspense, para que la página no espere a Canvas para mostrarse.
  const [{ data: course }, siblings, { data: note }, resources, ai, { data: cards }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("id", item.course_id).maybeSingle(),
    getFileSiblings(supabase, item.course_id),
    supabase.from("material_notes").select("content_md").eq("module_item_id", item.id).maybeSingle(),
    listResources(supabase, { courseId: item.course_id, itemId: item.id }),
    readAiConfigFromCookies(),
    supabase.from("flashcards").select("id, front, back").eq("module_item_id", item.id).order("created_at"),
  ]);
  const nav = neighborsOf(siblings.files, item.id);
  const current = siblings.files.find((f) => f.id === item.id);
  // Programa de escritorio: si el archivo ya está en la carpeta de UniHub, se abre desde ahí
  // (sin Canvas: funciona sin conexión y aunque el curso se cierre).
  const local = isDesktop() && item.local_path ? localFileInfo(item.local_path) : null;
  const src = local ? `/api/local-file?ruta=${encodeURIComponent(item.local_path!)}` : `/api/material/${item.id}`;
  const downloadHref = local ? `${src}&descargar=1` : `${src}?descargar=1`;
  // Por el nombre: los títulos de Canvas sin extensión suelen ser PDF. Si no se puede leer, la IA lo dirá.
  const guessed = viewerKind(null, item.title);
  const canAsk = ["pdf", "text", "html", "none"].includes(guessed);

  return (
    <AppShell active="/asignaturas" wide>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {course && (
              <Link href={`/asignaturas/${course.id}?tab=material`} className="text-xs text-muted-foreground hover:text-foreground">
                ← {displayCourseName(course.name)}
              </Link>
            )}
            <h1 className="break-words text-xl font-bold leading-snug tracking-tight">{item.title}</h1>
            {current && <p className="text-xs text-muted-foreground">{siblings.moduleNames.get(current.module_id)}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <a href={src} target="_blank" rel="noopener" className={buttonClass({ size: "sm", variant: "outline" })}>
              <Maximize2 /> Pantalla completa
            </a>
            {local && <ShowInFolderButton rel={item.local_path!} />}
            <a href={downloadHref} className={buttonClass({ size: "sm" })}>
              <Download /> Descargar
            </a>
            {item.html_url && (
              <a href={item.html_url} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm", variant: "outline" })}>
                Canvas <ExternalLink />
              </a>
            )}
          </div>
        </div>

        {nav && nav.total > 1 && (
          <FileNav
            prev={nav.prev}
            next={nav.next}
            index={nav.index}
            total={nav.total}
            moduleName={current ? siblings.moduleNames.get(current.module_id) ?? null : null}
            inModule={nav.inModule}
          />
        )}

        <div className="grid gap-3 lg:h-[calc(100dvh-14rem)] lg:min-h-[32rem] lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-h-0">
            <Suspense fallback={<Sk className="h-[75dvh] rounded-lg lg:h-full" />}>
              {local ? (
                <LocalViewer src={src} name={local.name} size={local.size} contentType={local.contentType} />
              ) : (
                <ViewerSection contentId={item.content_id} src={src} />
              )}
            </Suspense>
          </div>
          <MaterialWorkspace
            itemId={item.id}
            courseId={item.course_id}
            note={note?.content_md ?? ""}
            resources={resources}
            aiReady={ai.ok}
            aiReason={ai.ok ? null : ai.reason}
            aiLabel={ai.ok ? modelLabel(ai.config.provider, ai.config.model) : null}
            canAsk={canAsk}
          />
        </div>
        <FlashcardsPanel target="material" id={item.id} courseId={item.course_id} cards={cards ?? []} aiReady={ai.ok} hasSource={canAsk} />
      </div>
    </AppShell>
  );
}
