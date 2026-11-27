import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openSecret, parseKey, sealSecret } from "@/lib/secrets/vault";
import { inlineHeaders, viewerKind } from "@/features/materials/file-kind";

describe("cifrado de la contraseña", () => {
  const key = randomBytes(32);
  it("cifra y descifra solo con la misma clave y el mismo usuario", () => {
    const sealed = sealSecret("Xk9#a!q2", key, "user-1");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("Xk9#a!q2");
    expect(openSecret(sealed, key, "user-1")).toBe("Xk9#a!q2");
    expect(openSecret(sealed, key, "user-2")).toBeNull();
    expect(openSecret(sealed, randomBytes(32), "user-1")).toBeNull();
    expect(openSecret(sealed.slice(0, -2) + "AA", key, "user-1")).toBeNull();
  });
  it("cada cifrado es distinto (IV aleatorio)", () => {
    expect(sealSecret("a", key, "u")).not.toBe(sealSecret("a", key, "u"));
  });
  it("valida la clave", () => {
    expect(parseKey(undefined)).toBeNull();
    expect(parseKey(Buffer.alloc(16).toString("base64"))).toBeNull();
    expect(parseKey(key.toString("base64"))?.length).toBe(32);
  });
});

describe("visor de archivos", () => {
  it("detecta el tipo", () => {
    expect(viewerKind("application/pdf")).toBe("pdf");
    expect(viewerKind(null, "tema1.PDF")).toBe("pdf");
    expect(viewerKind("text/html", "x.html")).toBe("html");
    expect(viewerKind("image/svg+xml")).toBe("none");
    expect(viewerKind("application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("office");
    expect(viewerKind("video/mp4")).toBe("video");
  });
  it("el HTML se sirve en sandbox", () => {
    expect(inlineHeaders("html")["Content-Security-Policy"]).toMatch(/^sandbox/);
    expect(inlineHeaders("pdf")["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
  });
});
