import type { NextConfig } from "next";

const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Postgres embebido del programa de escritorio: se carga tal cual desde node_modules (lleva .wasm).
  serverExternalPackages: ["@electric-sql/pglite"],
  // El programa de escritorio lleva dentro un servidor Node autónomo (.next/standalone).
  // En Vercel no hace falta: solo se activa al compilar el escritorio (desktop/scripts/prepare.mjs).
  ...(process.env.UNIHUB_DESKTOP_BUILD === "1" ? { output: "standalone" as const } : {}),
  // El programa lee y escribe archivos en rutas que solo se conocen al ejecutarse (carpeta de
  // UniHub, base de datos): Next no puede saber cuáles y metería el proyecto entero en el
  // servidor (¡incluido el propio programa y sus instaladores!). Nada de esto hace falta en él.
  outputFileTracingExcludes: {
    "*": [
      "desktop/**",
      "_to_delete/**",
      "src/**",
      "tests/**",
      "docs/**",
      "scripts/**",
      "supabase/**",
      ".git/**",
      ".vercel/**",
      "**/*.zip",
      "*.md",
      "*.tsbuildinfo",
      ".env*",
    ],
  },
  // Subida de transcripciones (.vtt/.docx). Vercel limita el cuerpo a 4,5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      // Nadie puede meter UniHub en un iframe…
      { source: "/((?!api/material/|api/local-file).*)", headers: [...baseHeaders, { key: "X-Frame-Options", value: "DENY" }] },
      // Archivos de la carpeta local del programa de escritorio (mismo trato que el visor).
      { source: "/api/local-file", headers: [...baseHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // …salvo el visor de archivos, y solo desde la propia UniHub.
      {
        source: "/api/material/:path*",
        // La CSP (sandbox para HTML, frame-ancestors) la pone la propia ruta.
        headers: [...baseHeaders, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
