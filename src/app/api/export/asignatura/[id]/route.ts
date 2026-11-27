import { strToU8, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { z } from "zod";
import { safeFilename } from "@/features/classes/markdown";
import { buildCourseBundle } from "@/features/notes/bundle";
import { requireUser } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "unauthenticated" ? 401 : 403 });
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const db = await createSupabaseServerClient();
  const { data: course } = await db.from("courses").select("name, course_code, term_name, html_url").eq("id", id).maybeSingle();
  if (!course) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [modules, items, assignments, announcements, sessions, notes] = await Promise.all([
    db.from("course_modules").select("id, name, position").eq("course_id", id).is("missing_since", null),
    db.from("course_module_items").select("module_id, title, item_type, position").eq("course_id", id).is("missing_since", null),
    db.from("assignments").select("name, due_at, submission_state, description_text, points_possible").eq("course_id", id).is("missing_since", null).order("due_at", { nullsFirst: false }),
    db.from("announcements").select("title, posted_at, author_name, message_excerpt").eq("course_id", id).order("posted_at", { ascending: false }).limit(30),
    db.from("class_sessions").select("id, title, session_at, duration_minutes, recording_url, topics, notes").eq("course_id", id).order("session_at"),
    db.from("study_notes").select("session_id, kind, content_md").eq("course_id", id),
  ]);
  if ([modules, items, assignments, announcements, sessions, notes].some((r) => r.error)) {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
  const sessionIds = (sessions.data ?? []).map((s) => s.id);
  const { data: transcripts } = sessionIds.length
    ? await db.from("transcripts").select("session_id, content_text, speakers").in("session_id", sessionIds)
    : { data: [] as { session_id: string; content_text: string; speakers: string[] }[] };
  const tMap = new Map((transcripts ?? []).map((t) => [t.session_id, t]));

  const files = buildCourseBundle({
    course,
    modules: modules.data ?? [],
    items: items.data ?? [],
    assignments: assignments.data ?? [],
    announcements: announcements.data ?? [],
    sessions: (sessions.data ?? []).map((s) => ({ ...s, transcript: tMap.get(s.id) ?? null })),
    notes: notes.data ?? [],
    generatedAt: new Date(),
  });
  const folder = safeFilename(course.course_code ?? course.name);
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([p, c]) => [`${folder}/${p}`, strToU8(c)])), { level: 6 });

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}_UniHub.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
