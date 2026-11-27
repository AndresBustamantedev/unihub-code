import { NextResponse } from "next/server";
import { z } from "zod";
import { safeFilename, sessionToMarkdown } from "@/features/classes/markdown";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "unauthenticated" ? 401 : 403 });
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase.from("class_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [{ data: course }, { data: t }] = await Promise.all([
    supabase.from("courses").select("name").eq("id", s.course_id).maybeSingle(),
    supabase.from("transcripts").select("content_text, speakers").eq("session_id", id).maybeSingle(),
  ]);

  const md = sessionToMarkdown(s, course?.name ?? "", t ?? null);
  const name = `${safeFilename(s.session_at.slice(0, 10) + "_" + s.title)}.md`;
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
