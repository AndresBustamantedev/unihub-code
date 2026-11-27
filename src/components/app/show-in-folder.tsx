"use client";

import { FolderOpen } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import type {} from "@/lib/desktop-bridge";

/** Programa de escritorio: abre el Explorador de Windows con el archivo seleccionado. */
export function ShowInFolderButton({ rel, label = "Mostrar en la carpeta" }: { rel: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void window.unihubDesktop?.showInFolder(rel)}
      className={buttonClass({ size: "sm", variant: "outline" })}
    >
      <FolderOpen /> {label}
    </button>
  );
}
