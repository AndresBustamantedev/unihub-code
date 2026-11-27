import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "@fontsource-variable/onest";
import "./globals.css";
import { parseTheme, SYSTEM_THEME_SCRIPT, THEME_COOKIE } from "@/lib/theme/theme";

export const metadata: Metadata = {
  title: { default: "UniHub", template: "%s · UniHub" },
  description: "Tu curso en un vistazo: entregas, clases y novedades de Canvas",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#12151b" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="es" className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>{theme === "system" && <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />}</head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
