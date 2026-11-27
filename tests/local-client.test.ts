import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-local-"));
vi.stubEnv("UNIHUB_DB_DIR", dir);

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function fakeRemote(sub: string | null) {
  return {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub, email: "amiga@uem.es" } } : null, error: null }) },
    from: () => {
      throw new Error("no debe consultarse Supabase para datos");
    },
    rpc: () => {
      throw new Error("no debe consultarse Supabase para datos");
    },
  };
}

describe("programa de escritorio: Supabase solo para la sesión", () => {
  it("las consultas de datos van a la base de datos local de la cuenta", async () => {
    const { withLocalData } = await import("@/lib/local-db/client");
    const uid = "22222222-2222-4222-8222-222222222222";
    const db = await withLocalData(fakeRemote(uid) as never);
    const ins = await db
      .from("courses")
      .insert({ user_id: uid, provider: "canvas", external_id: 1, name: "Redes", category: "current" } as never)
      .select("name")
      .single();
    expect(ins.error).toBeNull();
    expect(ins.data).toEqual({ name: "Redes" });
    // Se guardó en disco, en la carpeta de esa cuenta.
    expect(fs.existsSync(path.join(dir, uid, "datos.tar.gz"))).toBe(true);
    // auth sigue siendo el de Supabase.
    expect(typeof db.auth.getClaims).toBe("function");
  }, 60_000);

  it("cada cuenta tiene su propia base de datos", async () => {
    const { withLocalData } = await import("@/lib/local-db/client");
    const other = await withLocalData(fakeRemote("33333333-3333-4333-8333-333333333333") as never);
    const { data } = await other.from("courses").select("id");
    expect(data).toEqual([]);
  }, 60_000);

  it("sin sesión no se puede leer nada", async () => {
    const { withLocalData } = await import("@/lib/local-db/client");
    const anon = await withLocalData(fakeRemote(null) as never);
    const r = await anon.from("courses").select("id").eq("followed", true).order("name");
    expect(r.data).toBeNull();
    expect(r.error?.code).toBe("PGRST301");
  });

  it("si otro proceso tiene abierta la base de datos, lleva a la pantalla que lo explica", async () => {
    const { spawn } = await import("node:child_process");
    const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"]);
    try {
      const uid = "44444444-4444-4444-8444-444444444444";
      fs.mkdirSync(path.join(dir, uid), { recursive: true });
      fs.writeFileSync(path.join(dir, uid, "en-uso.lock"), JSON.stringify({ pid: other.pid, at: Date.now() }));
      const { withLocalData } = await import("@/lib/local-db/client");
      await expect(withLocalData(fakeRemote(uid) as never)).rejects.toThrow(/NEXT_REDIRECT/);
    } finally {
      other.kill();
    }
  }, 60_000);
});
