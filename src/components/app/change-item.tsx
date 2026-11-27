import { CalendarClock, CheckCircle2, ExternalLink, FilePlus2, FileText, FolderOpen, Mail, Megaphone, Trash2 } from "lucide-react";
import type { ChangeWithCourse } from "@/features/content/queries";
import type { ChangeKind } from "@/lib/supabase/database.types";
import { formatDue, timeAgo } from "@/lib/format";
import { CourseTag } from "./course-tag";

const KIND: Record<ChangeKind, { label: string; Icon: typeof Megaphone }> = {
  new_assignment: { label: "Nueva tarea", Icon: FilePlus2 },
  due_date_changed: { label: "Fecha límite modificada", Icon: CalendarClock },
  assignment_removed: { label: "Tarea retirada", Icon: Trash2 },
  graded: { label: "Calificada", Icon: CheckCircle2 },
  new_announcement: { label: "Nuevo anuncio", Icon: Megaphone },
  new_file: { label: "Archivo añadido", Icon: FileText },
  module_updated: { label: "Módulo actualizado", Icon: FolderOpen },
  new_message: { label: "Mensaje en Canvas", Icon: Mail },
};

function detailText(c: ChangeWithCourse): string | null {
  const d = (c.detail ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  switch (c.kind) {
    case "due_date_changed":
      return `${formatDue(str(d.from)) ?? "sin fecha"} → ${formatDue(str(d.to)) ?? "sin fecha"}`;
    case "new_assignment":
      return str(d.due_at) ? `Entrega: ${formatDue(str(d.due_at))}` : "Sin fecha de entrega";
    case "graded": {
      const score = d.score ?? d.grade;
      return score !== null && score !== undefined ? `Nota: ${String(score)}${d.points_possible ? `/${String(d.points_possible)}` : ""}` : null;
    }
    case "new_announcement":
      return str(d.author);
    case "new_message": {
      const from = str(d.from);
      const excerpt = str(d.excerpt);
      return [from && `De ${from}`, excerpt].filter(Boolean).join(": ") || null;
    }
    case "module_updated": {
      if (d.new_module === true) return "Módulo nuevo";
      const added = Array.isArray(d.added) ? d.added.filter((x): x is string => typeof x === "string") : [];
      const count = typeof d.added_count === "number" ? d.added_count : added.length;
      return added.length ? `+${count}: ${added.slice(0, 3).join(", ")}${count > 3 ? "…" : ""}` : null;
    }
    default:
      return null;
  }
}

export function ChangeItem({ c }: { c: ChangeWithCourse }) {
  const { label, Icon } = KIND[c.kind];
  const detail = detailText(c);
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          {!c.read_at && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="sin leer" />}
          {c.course && <CourseTag id={c.course.id} name={c.course.name} code={c.course.course_code} />}
          <span className="truncate font-medium">{c.title}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {label} · {timeAgo(c.detected_at)}
          {detail && ` · ${detail}`}
        </p>
      </div>
      {c.html_url && (
        <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir en Canvas">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}
