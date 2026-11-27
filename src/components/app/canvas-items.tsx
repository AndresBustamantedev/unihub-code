import { Bell, ExternalLink, FileCheck2, Megaphone, MessagesSquare, Video, Users, type LucideIcon } from "lucide-react";
import type { ActivityRow, ConversationRow, CourseRow } from "@/lib/supabase/database.types";
import { timeAgo } from "@/lib/format";
import { CourseTag } from "./course-tag";

type CourseLite = Pick<CourseRow, "id" | "name" | "course_code"> | null;

export function ConversationItem({ c, inboxUrl }: { c: ConversationRow & { course: CourseLite }; inboxUrl: string | null }) {
  const unread = c.workflow_state === "unread";
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} aria-label={unread ? "sin leer" : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {c.course && <CourseTag id={c.course.id} name={c.course.name} code={c.course.course_code} />}
            <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>{c.subject ?? "(sin asunto)"}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.last_message_at)}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {c.participants.slice(0, 3).join(", ") || "—"}
          {c.message_count > 1 ? ` · ${c.message_count} mensajes` : ""}
          {!c.course && c.context_name ? ` · ${c.context_name}` : ""}
        </p>
        {c.last_message_excerpt && <p className="truncate text-xs text-muted-foreground/80">{c.last_message_excerpt}</p>}
      </div>
      {inboxUrl && (
        <a href={inboxUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir bandeja de Canvas">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}

const TYPE: Record<string, { label: string; Icon: LucideIcon }> = {
  Message: { label: "Notificación", Icon: Bell },
  Announcement: { label: "Anuncio", Icon: Megaphone },
  DiscussionTopic: { label: "Debate", Icon: MessagesSquare },
  Submission: { label: "Entrega", Icon: FileCheck2 },
  Conference: { label: "Conferencia", Icon: Video },
  Collaboration: { label: "Colaboración", Icon: Users },
  AssessmentRequest: { label: "Revisión entre pares", Icon: Users },
};

export function ActivityItem({ a, showCourse = true }: { a: ActivityRow & { course: CourseLite }; showCourse?: boolean }) {
  const { label, Icon } = TYPE[a.item_type] ?? { label: a.item_type, Icon: Bell };
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            {showCourse && a.course && <CourseTag id={a.course.id} name={a.course.name} code={a.course.course_code} />}
            <span className={`truncate text-sm ${a.read_state === false ? "font-semibold" : "font-medium"}`}>{a.title ?? label}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.canvas_updated_at)}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {label}
          {a.notification_category ? ` · ${a.notification_category}` : ""}

        </p>
        {a.excerpt && <p className="line-clamp-2 text-xs text-muted-foreground/80">{a.excerpt}</p>}
      </div>
      {a.html_url && (
        <a href={a.html_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Abrir en Canvas">
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}
