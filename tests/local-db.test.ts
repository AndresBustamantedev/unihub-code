import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalDataClient, parseOr } from "@/lib/local-db/builder";
import { localParsers, prepareDatabase } from "@/lib/local-db/pg";
import { LOCAL_MIGRATIONS } from "@/lib/local-db/migrations.generated";

const UID = "11111111-1111-4111-8111-111111111111";
let db: ReturnType<typeof createLocalDataClient>;
let courseId = "";

beforeAll(async () => {
  const pg = await PGlite.create({ parsers: await localParsers() });
  await prepareDatabase(pg, UID, "yo@uem.es");
  db = createLocalDataClient(pg);
  const { data } = await db
    .from("courses")
    .insert({ user_id: UID, provider: "canvas", external_id: 178524, name: "ANÁLISIS MATEMÁTICO (M11-PAGO)", course_code: "AM", category: "current", followed: true })
    .select("id")
    .single();
  courseId = (data as { id: string }).id;
}, 60_000);

describe("migraciones embebidas", () => {
  it("están al día con supabase/migrations", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .filter((f) => !fs.readFileSync(path.join(dir, f), "utf8").startsWith("-- unihub:solo-web"))
      .sort();
    expect(LOCAL_MIGRATIONS.map((m) => m.name)).toEqual(files);
    for (const m of LOCAL_MIGRATIONS) expect(m.sql).toBe(fs.readFileSync(path.join(dir, m.name), "utf8"));
  });
});

describe("base de datos local con la forma de supabase-js", () => {
  it("el perfil se crea solo y las fechas vienen como texto ISO", async () => {
    const { data } = await db.from("profiles").select("id, created_at").maybeSingle();
    const p = data as { id: string; created_at: string };
    expect(p.id).toBe(UID);
    expect(typeof p.created_at).toBe("string");
    expect(p.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$/);
    expect(Number.isNaN(new Date(p.created_at).getTime())).toBe(false);
  });

  it("select con filtros, orden, límite y maybeSingle", async () => {
    const { data, error } = await db.from("courses").select("id, name, followed, external_id").eq("followed", true).order("name").limit(5);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: courseId, name: "ANÁLISIS MATEMÁTICO (M11-PAGO)", followed: true, external_id: 178524 }]);
    const none = await db.from("courses").select("id").eq("external_id", 1).maybeSingle();
    expect(none).toMatchObject({ data: null, error: null });
    const single = await db.from("courses").select("id").eq("external_id", 1).single();
    expect(single.error?.code).toBe("PGRST116");
  });

  it("upsert con onConflict actualiza y con ignoreDuplicates no", async () => {
    const row = { user_id: UID, course_id: courseId, provider: "canvas", external_id: 55, name: "Actividad 1", submission_state: "pending" };
    await db.from("assignments").upsert(row, { onConflict: "user_id,provider,external_id" });
    await db.from("assignments").upsert({ ...row, name: "Actividad 1 (v2)" }, { onConflict: "user_id,provider,external_id" });
    await db.from("assignments").upsert({ ...row, name: "no debe cambiar" }, { onConflict: "user_id,provider,external_id", ignoreDuplicates: true });
    const { data } = await db.from("assignments").select("name").eq("external_id", 55).single();
    expect(data).toEqual({ name: "Actividad 1 (v2)" });
  });

  it("arrays, jsonb, in / not in, is, or e ilike", async () => {
    await db.from("changes").insert({ user_id: UID, course_id: courseId, entity_type: "assignment", external_id: 9, kind: "new_assignment", title: "Nueva tarea", detail: { due: "2026-12-01" }, dedupe_key: "a" });
    const { data: ch } = await db.from("changes").select("detail").eq("dedupe_key", "a").single();
    expect(ch).toEqual({ detail: { due: "2026-12-01" } });

    const s = await db
      .from("class_sessions")
      .insert({ user_id: UID, course_id: courseId, title: "Clase 1", session_at: "2026-11-12T18:44:00Z", topics: ["derivada", "límite"], source: "manual" })
      .select("id, topics, session_at")
      .single();
    expect(s.error).toBeNull();
    expect(s.data).toMatchObject({ topics: ["derivada", "límite"], session_at: "2026-11-12T18:44:00+00:00" });

    const notIn = await db.from("courses").select("id").not("external_id", "in", "(178524)");
    expect(notIn.data).toEqual([]);
    const inList = await db.from("courses").select("id").in("id", [courseId]);
    expect(inList.data).toHaveLength(1);
    const or = await db.from("courses").select("id").or("name.ilike.%análisis%,name.ilike.%(TUT_%");
    expect(or.data).toHaveLength(1);
    const notNull = await db.from("courses").select("id").not("color_hue", "is", null);
    expect(notNull.data).toEqual([]);
  });

  it("update y delete con returning y count, y count con head", async () => {
    const up = await db.from("courses").update({ color_hue: 221 }).eq("id", courseId).select("color_hue");
    expect(up.data).toEqual([{ color_hue: 221 }]);
    const head = await db.from("courses").select("id", { count: "exact", head: true }).eq("followed", true);
    expect(head).toMatchObject({ data: null, count: 1 });
    await db.from("sync_runs").insert({ user_id: UID, provider: "canvas", resource: "courses", status: "success", started_at: "2020-01-01T00:00:00Z" });
    const del = await db.from("sync_runs").delete({ count: "exact" }).lt("started_at", "2021-01-01T00:00:00Z").neq("status", "running");
    expect(del).toMatchObject({ error: null, count: 1 });
  });

  it("los errores de la base de datos vuelven como en Supabase (sin lanzar)", async () => {
    const r = await db.from("courses").insert({ user_id: UID, provider: "canvas", external_id: 178524, name: "duplicada", category: "current" });
    expect(r.error?.code).toBe("23505");
    const bad = await db.from("courses").select("id; drop table courses");
    expect(bad.error?.code).toBe("42602");
  });

  it("rpc de la función de espacio usado", async () => {
    const r = await db.rpc("storage_usage");
    expect(r.error).toBeNull();
    expect((r.data as { database_bytes: number }).database_bytes).toBeGreaterThan(0);
  });

  it("separa bien las condiciones de .or aunque el valor tenga paréntesis", () => {
    expect(parseOr("name.ilike.%aula tutor%,name.ilike.%(TUT_%")).toHaveLength(2);
    expect(parseOr("followed.eq.true,id.eq.abc")).toHaveLength(2);
  });
});
