import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasApiError, CanvasClient } from "@/integrations/canvas";

vi.mock("server-only", () => ({}));

const TOKEN = "16843~AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghij";
const DAY = 86_400_000;

function fakeClient(list: () => unknown, self: () => unknown = () => ({ id: 1 })) {
  return {
    getAll: vi.fn(async () => list()),
    get: vi.fn(async () => ({ data: self() })),
  } as unknown as CanvasClient;
}
const unauthorized = () => {
  throw new CanvasApiError("unauthorized", "401", 401);
};

beforeEach(async () => {
  vi.stubEnv("CANVAS_BASE_URL", "https://campus.europaeducationgroup.es/api/v1");
  vi.stubEnv("CANVAS_ACCESS_TOKEN", TOKEN);
  (await import("@/features/canvas-token/status")).resetCanvasTokenCache();
});
afterEach(() => vi.unstubAllEnvs());

describe("token de Canvas", () => {
  it("encuentra el token en uso por su principio y avisa 5 días antes", async () => {
    const { pickCurrentToken, classify } = await import("@/features/canvas-token/status");
    const now = Date.now();
    const tokens = [
      { token_hint: "99999", expires_at: new Date(now + 2 * DAY).toISOString() },
      { token_hint: "16843", expires_at: new Date(now + 20 * DAY).toISOString(), last_used_at: "2026-11-26T20:00:00Z" },
    ];
    expect(pickCurrentToken(tokens, TOKEN)?.token_hint).toBe("16843");
    expect(classify(new Date(now + 20 * DAY).toISOString(), now)).toEqual({ state: "ok", daysLeft: 20 });
    expect(classify(new Date(now + 3 * DAY).toISOString(), now)).toEqual({ state: "expiring", daysLeft: 3 });
    expect(classify(new Date(now - 1000).toISOString(), now).state).toBe("expired");
    expect(classify(null, now)).toEqual({ state: "ok", daysLeft: null });
  });

  it("lee la caducidad de Canvas", async () => {
    const { getCanvasTokenStatus } = await import("@/features/canvas-token/status");
    const exp = new Date(Date.now() + 2 * DAY + 3600_000).toISOString();
    const s = await getCanvasTokenStatus({ client: fakeClient(() => [{ token_hint: "16843", expires_at: exp }]) });
    expect(s).toMatchObject({ state: "expiring", expiresAt: exp, daysLeft: 3, settingsUrl: "https://campus.europaeducationgroup.es/profile/settings" });
  });

  it("si Canvas rechaza el token, está caducado", async () => {
    const { getCanvasTokenStatus } = await import("@/features/canvas-token/status");
    expect((await getCanvasTokenStatus({ client: fakeClient(unauthorized) }))?.state).toBe("expired");
  });

  it("si la universidad no deja ver los tokens pero funciona, no avisa", async () => {
    const { getCanvasTokenStatus } = await import("@/features/canvas-token/status");
    const forbidden = () => {
      throw new CanvasApiError("forbidden", "403", 403);
    };
    expect(await getCanvasTokenStatus({ client: fakeClient(forbidden) })).toMatchObject({ state: "ok", expiresAt: null });
  });

  it("sin conexión no dice nada", async () => {
    const { getCanvasTokenStatus } = await import("@/features/canvas-token/status");
    const offline = () => {
      throw new CanvasApiError("network", "net");
    };
    expect(await getCanvasTokenStatus({ client: fakeClient(offline, offline) })).toBeNull();
  });
});
