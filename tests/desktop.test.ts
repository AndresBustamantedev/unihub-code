import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("modo escritorio", () => {
  it("las rutas /api/desktop exigen el secreto del arranque", async () => {
    vi.stubEnv("UNIHUB_DESKTOP", "1");
    vi.stubEnv("DESKTOP_SECRET", "a".repeat(64));
    const { desktopAuthorized } = await import("@/lib/desktop");
    expect(desktopAuthorized("a".repeat(64))).toBe(true);
    expect(desktopAuthorized("b".repeat(64))).toBe(false);
    expect(desktopAuthorized(null)).toBe(false);
    expect(desktopAuthorized("a")).toBe(false);
  });

  it("fuera del escritorio nunca se autorizan", async () => {
    vi.stubEnv("UNIHUB_DESKTOP", "");
    vi.stubEnv("DESKTOP_SECRET", "a".repeat(64));
    const { desktopAuthorized } = await import("@/lib/desktop");
    expect(desktopAuthorized("a".repeat(64))).toBe(false);
  });

  it("ALLOWED_EMAILS=* solo vale en el programa de escritorio", async () => {
    vi.stubEnv("APP_URL", "http://127.0.0.1:4000");
    vi.stubEnv("ALLOWED_EMAILS", "*");
    vi.stubEnv("UNIHUB_DESKTOP", "1");
    let env = await import("@/lib/env/server");
    expect(env.isEmailAllowed("cualquiera@uem.es")).toBe(true);
    vi.resetModules();
    vi.stubEnv("UNIHUB_DESKTOP", "");
    env = await import("@/lib/env/server");
    expect(env.appEnvProblems()).toContain("ALLOWED_EMAILS");
  });

  it("en la web se sigue usando la lista de correos", async () => {
    vi.stubEnv("APP_URL", "https://unihub.example");
    vi.stubEnv("ALLOWED_EMAILS", "yo@uem.es");
    vi.stubEnv("UNIHUB_DESKTOP", "");
    const env = await import("@/lib/env/server");
    expect(env.isEmailAllowed("yo@uem.es")).toBe(true);
    expect(env.isEmailAllowed("otra@uem.es")).toBe(false);
  });
});
