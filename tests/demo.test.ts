import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const DEMO = "00000000-0000-4000-8000-00000000de30";

describe("modo demo (datos de ejemplo)", () => {
  it("carga asignaturas, tareas, clases, apuntes, tarjetas y un examen, solo una vez", async () => {
    const { prepareDatabase } = await import("@/lib/local-db/pg");
    const { seedDemoIfEmpty } = await import("@/lib/local-db/demo");
    const pg = new PGlite();
    await prepareDatabase(pg, DEMO, "demo@unihub.app");
    expect(await seedDemoIfEmpty(pg, DEMO)).toBe(true);
    const count = async (t: string) => (await pg.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0]!.n;
    expect(await count("courses")).toBe(4);
    expect(await count("assignments")).toBe(6);
    expect(await count("class_sessions")).toBe(5);
    expect(await count("transcripts")).toBe(5);
    expect(await count("study_notes")).toBe(3);
    expect(await count("flashcards")).toBe(10);
    expect(await count("exams")).toBe(1);
    // Una segunda apertura no duplica nada.
    expect(await seedDemoIfEmpty(pg, DEMO)).toBe(false);
    expect(await count("courses")).toBe(4);
  }, 60_000);

  it("solo se activa en el programa con la demo elegida, y usa su propio usuario", async () => {
    const { isDemo, isLocalOnly, localUser, DEMO_USER, LOCAL_USER } = await import("@/lib/local-only");
    const env = { ...process.env };
    try {
      process.env.UNIHUB_DESKTOP = "1";
      process.env.UNIHUB_DEMO = "1";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
      expect(isDemo() && isLocalOnly()).toBe(true);
      expect(localUser()).toEqual(DEMO_USER);
      process.env.UNIHUB_DEMO = "";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "";
      expect(isDemo()).toBe(false);
      expect(localUser()).toEqual(LOCAL_USER);
      process.env.UNIHUB_DESKTOP = "";
      process.env.UNIHUB_DEMO = "1";
      expect(isDemo()).toBe(false);
    } finally {
      process.env = env;
    }
  });
});
