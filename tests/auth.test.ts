import { describe, expect, it } from "vitest";
import { clearFails, isLocked, recordFail } from "@/lib/auth/attempts";

describe("límite de intentos de login", () => {
  it("bloquea tras 5 fallos en 15 min y se libera después", () => {
    const k = "a@b.c";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) recordFail(k, t0 + i);
    expect(isLocked(k, t0 + 10)).toBe(true);
    expect(isLocked(k, t0 + 16 * 60 * 1000)).toBe(false);
  });
  it("un acierto limpia el contador", () => {
    const k = "x@y.z";
    for (let i = 0; i < 5; i++) recordFail(k);
    clearFails(k);
    expect(isLocked(k)).toBe(false);
  });
});
