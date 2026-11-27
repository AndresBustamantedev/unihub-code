import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { listCourses } from "@/features/courses/queries";
import { readAiConfigFromCookies } from "@/integrations/ai/prefs";
import { AI_LABEL, MODEL_OPTIONS } from "@/integrations/ai/shared";
import { requirePageUser } from "@/lib/auth/page-guard";
import { displayCourseName } from "@/lib/course-color";
import { isDesktop } from "@/lib/desktop";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SearchView } from "./search-view";

export const metadata: Metadata = { title: "Buscar" };
export const dynamic = "force-dynamic";

export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string; curso?: string; preguntar?: string }> }) {
  await requirePageUser("/buscar");
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [courses, ai] = await Promise.all([listCourses(supabase), readAiConfigFromCookies()]);
  const all = courses.ok ? courses.data : [];
  // Primero las que sigues; después el resto (semestres anteriores).
  const options = [...all.filter((c) => c.followed), ...all.filter((c) => !c.followed && c.semester !== null)].map((c) => ({
    id: c.id,
    name: displayCourseName(c.name),
    followed: c.followed,
  }));
  const courseId = sp.curso && options.some((o) => o.id === sp.curso) ? sp.curso : null;
  const aiLabel = ai.ok ? `${AI_LABEL[ai.config.provider]} · ${MODEL_OPTIONS[ai.config.provider].find((m) => m.id === ai.config.model)?.label ?? ai.config.model}` : null;

  return (
    <AppShell active="/buscar">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Buscar</h1>
          <p className="text-sm text-muted-foreground">En tus clases, transcripciones, apuntes, notas, material y enlaces. Sin importar tildes ni mayúsculas.</p>
        </div>
        <SearchView
          courses={options}
          initialQuery={(sp.q ?? "").slice(0, 200)}
          initialCourse={courseId}
          initialAsk={sp.preguntar === "1"}
          aiReady={ai.ok}
          aiLabel={aiLabel}
          desktop={isDesktop()}
        />
      </div>
    </AppShell>
  );
}
