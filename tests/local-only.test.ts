import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }) }));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unihub-solo-local-"));

function soloLocal() {
  vi.stubEnv("UNIHUB_DESKTOP", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("UNIHUB_DB_DIR", dir);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("programa sin Supabase (modo solo local)", () => {
  it("solo se activa en el escritorio y sin las variables de Supabase", async () => {
    const { isLocalOnly } = await import("@/lib/local-only");
    soloLocal();
    expect(isLocalOnly()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(isLocalOnly()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("UNIHUB_DESKTOP", "");
    expect(isLocalOnly()).toBe(false);
  });

  it("no pide iniciar sesión: el usuario es el local", async () => {
    soloLocal();
    const { requireUser } = await import("@/lib/auth/guard");
    const { LOCAL_USER } = await import("@/lib/local-only");
    expect(await requireUser()).toEqual({ ok: true, user: { id: LOCAL_USER.id, email: LOCAL_USER.email } });
  });

  it("el proxy deja pasar sin sesión y lleva /login al inicio", async () => {
    soloLocal();
    const { proxy } = await import("@/proxy");
    const home = await proxy(new NextRequest("http://127.0.0.1:3000/clases"));
    expect(home.status).toBe(200);
    const login = await proxy(new NextRequest("http://127.0.0.1:3000/login"));
    expect(login.status).toBe(307);
    expect(new URL(login.headers.get("location")!).pathname).toBe("/");
  });

  it("los datos van a la base de datos local y la nube responde con un error claro", async () => {
    soloLocal();
    const { createSupabaseServerClient, createRemoteSupabaseClient } = await import("@/lib/supabase/server");
    const { LOCAL_USER } = await import("@/lib/local-only");
    const db = await createSupabaseServerClient();
    const ins = await db
      .from("courses")
      .insert({ user_id: LOCAL_USER.id, provider: "canvas", external_id: 7, name: "Sistemas", category: "current" } as never)
      .select("name")
      .single();
    expect(ins.error).toBeNull();
    expect(fs.existsSync(path.join(dir, LOCAL_USER.id, "datos.tar.gz"))).toBe(true);

    const remote = await createRemoteSupabaseClient();
    const r = await remote.rpc("my_cloud_access");
    expect(r.error?.code).toBe("UNIHUB_LOCAL_ONLY");
    const q = await remote.from("courses").select("id").eq("followed", true);
    expect(q.error?.code).toBe("UNIHUB_LOCAL_ONLY");
    expect((await remote.auth.getSession()).data.session).toBeNull();
  }, 60_000);

  it("sin nube, Ajustes no ofrece copia ni administración", async () => {
    soloLocal();
    const { loadCloudAccess } = await import("@/features/admin/queries");
    expect(await loadCloudAccess()).toEqual({ isAdmin: false, enabled: false, users: null });
  });
});
