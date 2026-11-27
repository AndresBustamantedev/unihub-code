// Tipos escritos a mano según supabase/migrations/0001_courses.sql.
// Cuando el proyecto exista se pueden regenerar con `supabase gen types`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type CourseCategory = "current" | "future" | "past" | "auxiliary";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; university_login: string | null; university_secret: string | null; created_at: string };
        Insert: { id: string; display_name?: string | null; university_login?: string | null; university_secret?: string | null; created_at?: string };
        Update: { display_name?: string | null; university_login?: string | null; university_secret?: string | null };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          user_id: string;
          provider: "canvas";
          external_id: number;
          name: string;
          course_code: string | null;
          workflow_state: string | null;
          enrollment_types: string[];
          enrollment_states: string[];
          term_name: string | null;
          term_start_at: string | null;
          term_end_at: string | null;
          start_at: string | null;
          end_at: string | null;
          html_url: string | null;
          category: CourseCategory;
          category_reason: string | null;
          followed: boolean;
          first_seen_at: string;
          last_seen_at: string;
          missing_since: string | null;
          last_synced_at: string;
          content_synced_at: string | null;
          materials_synced_at: string | null;
          materials_status: Json;
          syllabus_text: string | null;
          canvas_image_url: string | null;
          cover_url: string | null;
          semester: number | null;
          color_hue: number | null;
          classes_end_on: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: "canvas";
          external_id: number;
          name: string;
          course_code?: string | null;
          workflow_state?: string | null;
          enrollment_types?: string[];
          enrollment_states?: string[];
          term_name?: string | null;
          term_start_at?: string | null;
          term_end_at?: string | null;
          start_at?: string | null;
          end_at?: string | null;
          html_url?: string | null;
          category: CourseCategory;
          category_reason?: string | null;
          followed?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
          missing_since?: string | null;
          last_synced_at?: string;
          content_synced_at?: string | null;
          materials_synced_at?: string | null;
          materials_status?: Json;
          syllabus_text?: string | null;
          canvas_image_url?: string | null;
          cover_url?: string | null;
          semester?: number | null;
          color_hue?: number | null;
          classes_end_on?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>;
        Relationships: [];
      };
      sync_runs: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          resource: string;
          status: "running" | "success" | "error";
          started_at: string;
          finished_at: string | null;
          stats: Json | null;
          error_code: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          resource: string;
          status: "running" | "success" | "error";
          started_at?: string;
          finished_at?: string | null;
          stats?: Json | null;
          error_code?: string | null;
          error_message?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sync_runs"]["Insert"]>;
        Relationships: [];
      };
      assignments: {
        Row: AssignmentRow;
        Insert: Partial<AssignmentRow> & { user_id: string; course_id: string; external_id: number; name: string };
        Update: Partial<AssignmentRow>;
        Relationships: [];
      };
      announcements: {
        Row: AnnouncementRow;
        Insert: Partial<AnnouncementRow> & { user_id: string; course_id: string; external_id: number; title: string };
        Update: Partial<AnnouncementRow>;
        Relationships: [];
      };
      changes: {
        Row: ChangeRow;
        Insert: Partial<ChangeRow> & { user_id: string; entity_type: ChangeRow["entity_type"]; external_id: number; kind: ChangeKind; title: string };
        Update: Partial<ChangeRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow> & { user_id: string; kind: ReminderKind; due_at: string; status: NotificationRow["status"]; title: string; body: string };
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Partial<PushSubscriptionRow> & { user_id: string; endpoint: string; p256dh: string; auth: string };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      course_modules: {
        Row: ModuleRow;
        Insert: Partial<ModuleRow> & { user_id: string; course_id: string; external_id: number; name: string };
        Update: Partial<ModuleRow>;
        Relationships: [];
      };
      course_module_items: {
        Row: ModuleItemRow;
        Insert: Partial<ModuleItemRow> & { user_id: string; course_id: string; module_id: string; external_id: number; title: string; item_type: string };
        Update: Partial<ModuleItemRow>;
        Relationships: [];
      };
      course_files: {
        Row: FileRow;
        Insert: Partial<FileRow> & { user_id: string; course_id: string; external_id: number; display_name: string };
        Update: Partial<FileRow>;
        Relationships: [];
      };
      course_pages: {
        Row: PageRow;
        Insert: Partial<PageRow> & { user_id: string; course_id: string; external_id: number; title: string };
        Update: Partial<PageRow>;
        Relationships: [];
      };
      calendar_events: {
        Row: CalendarEventRow;
        Insert: Partial<CalendarEventRow> & { user_id: string; course_id: string; external_id: number; title: string };
        Update: Partial<CalendarEventRow>;
        Relationships: [];
      };
      class_sessions: {
        Row: ClassSessionRow;
        Insert: Partial<ClassSessionRow> & { user_id: string; course_id: string; title: string; session_at: string };
        Update: Partial<ClassSessionRow>;
        Relationships: [];
      };
      transcripts: {
        Row: TranscriptRow;
        Insert: Partial<TranscriptRow> & { user_id: string; session_id: string; source_format: TranscriptRow["source_format"]; content_text: string };
        Update: Partial<TranscriptRow>;
        Relationships: [];
      };
      study_notes: {
        Row: StudyNoteRow;
        Insert: Partial<StudyNoteRow> & { user_id: string; course_id: string; kind: NoteKind; content_md: string; provider: string; model: string; input_hash: string };
        Update: Partial<StudyNoteRow>;
        Relationships: [];
      };
      canvas_conversations: {
        Row: ConversationRow;
        Insert: Partial<ConversationRow> & { user_id: string; external_id: number; workflow_state: string };
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      canvas_activity: {
        Row: ActivityRow;
        Insert: Partial<ActivityRow> & { user_id: string; external_id: number; item_type: string };
        Update: Partial<ActivityRow>;
        Relationships: [];
      };
      course_people: {
        Row: PersonRow;
        Insert: Partial<PersonRow> & { user_id: string; course_id: string; external_id: number; name: string; role: PersonRow["role"] };
        Update: Partial<PersonRow>;
        Relationships: [];
      };
      class_schedule: {
        Row: ScheduleRow;
        Insert: Partial<ScheduleRow> & { user_id: string; course_id: string; weekday: number; start_time: string; end_time: string };
        Update: Partial<ScheduleRow>;
        Relationships: [];
      };
      class_resources: {
        Row: ClassResourceRow;
        Insert: Partial<ClassResourceRow> & { user_id: string; course_id: string; url: string; title: string };
        Update: Partial<ClassResourceRow>;
        Relationships: [];
      };
      material_notes: {
        Row: MaterialNoteRow;
        Insert: Partial<MaterialNoteRow> & { user_id: string; course_id: string; module_item_id: string };
        Update: Partial<MaterialNoteRow>;
        Relationships: [];
      };
      material_texts: {
        Row: MaterialTextRow;
        Insert: Partial<MaterialTextRow> & { user_id: string; module_item_id: string; content_text: string };
        Update: Partial<MaterialTextRow>;
        Relationships: [];
      };
      class_skips: {
        Row: ClassSkipRow;
        Insert: Partial<ClassSkipRow> & { user_id: string; course_id: string; class_date: string };
        Update: Partial<ClassSkipRow>;
        Relationships: [];
      };
      search_chunks: {
        Row: SearchChunkRow;
        Insert: Omit<Partial<SearchChunkRow>, "tsv"> & { user_id: string; source_type: SearchSourceType; source_id: string; title: string; href: string; content: string };
        Update: Omit<Partial<SearchChunkRow>, "tsv">;
        Relationships: [];
      };
      flashcards: {
        Row: FlashcardRow;
        Insert: Partial<FlashcardRow> & { user_id: string; course_id: string; front: string; back: string };
        Update: Partial<FlashcardRow>;
        Relationships: [];
      };
      flashcard_reviews: {
        Row: FlashcardReviewRow;
        Insert: Partial<FlashcardReviewRow> & { user_id: string; card_id: string; course_id: string; rating: number };
        Update: Partial<FlashcardReviewRow>;
        Relationships: [];
      };
      exams: {
        Row: ExamRow;
        Insert: Partial<ExamRow> & { user_id: string; course_id: string; title: string; exam_at: string };
        Update: Partial<ExamRow>;
        Relationships: [];
      };
      search_sources: {
        Row: SearchSourceRow;
        Insert: Partial<SearchSourceRow> & { user_id: string; source_type: SearchSourceType; source_id: string; hash: string };
        Update: Partial<SearchSourceRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      storage_usage: { Args: Record<string, never>; Returns: Json };
      my_cloud_access: { Args: Record<string, never>; Returns: { is_admin: boolean; cloud_enabled: boolean }[] };
      admin_list_users: {
        Args: Record<string, never>;
        Returns: { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; is_admin: boolean; cloud_enabled: boolean }[];
      };
      admin_set_cloud_access: { Args: { target: string; enable: boolean }; Returns: undefined };
      trial_add_usage: { Args: { uid: string; m: string; tokens_in: number; tokens_out: number; cost: number }; Returns: number };
      my_trial_usage: { Args: { m: string }; Returns: { enabled: boolean; limit_usd: number | null; requests: number; cost_usd: number }[] };
      trial_access_for: { Args: { uid: string; m: string }; Returns: { enabled: boolean; limit_usd: number | null; cost_usd: number }[] };
      admin_trial_usage: { Args: { m: string }; Returns: { user_id: string; enabled: boolean; limit_usd: number | null; requests: number; cost_usd: number }[] };
      admin_set_trial_access: { Args: { target: string; enable: boolean; limit_usd?: number | null }; Returns: undefined };
      search_index_state: {
        Args: Record<string, never>;
        Returns: { source_type: SearchSourceType; source_id: string; course_id: string | null; hash: string }[];
      };
      search_chunks_find: {
        Args: { q: string; course?: string | null; match_any?: boolean; lim?: number };
        Returns: SearchHit[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type CourseRow = Database["public"]["Tables"]["courses"]["Row"];
export type SyncRunRow = Database["public"]["Tables"]["sync_runs"]["Row"];

export type SubmissionState = "pending" | "submitted" | "graded" | "excused" | "not_required" | "unknown";

export type AssignmentRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  name: string;
  description_text: string | null;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  submission_types: string[];
  html_url: string | null;
  canvas_updated_at: string | null;
  submission_state: SubmissionState;
  submitted_at: string | null;
  score: number | null;
  grade: string | null;
  late: boolean;
  missing: boolean;
  first_seen_at: string;
  last_seen_at: string;
  missing_since: string | null;
  last_synced_at: string;
};

export type AnnouncementRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  title: string;
  message_excerpt: string | null;
  author_name: string | null;
  posted_at: string | null;
  html_url: string | null;
  first_seen_at: string;
  last_synced_at: string;
};

export type ChangeKind = "new_assignment" | "due_date_changed" | "assignment_removed" | "graded" | "new_announcement" | "new_file" | "module_updated" | "new_message";

export type ChangeRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  entity_type: "assignment" | "announcement" | "file" | "module" | "conversation";
  entity_id: string | null;
  external_id: number;
  kind: ChangeKind;
  title: string;
  detail: Json | null;
  dedupe_key: string;
  detected_at: string;
  read_at: string | null;
};

export type ReminderKind = "due_72h" | "due_24h" | "due_6h" | "class_missing";

export type NotificationRow = {
  id: string;
  user_id: string;
  assignment_id: string | null;
  course_id: string | null;
  dedupe_key: string | null;
  kind: ReminderKind;
  due_at: string;
  status: "pending" | "sent" | "failed" | "skipped";
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_count: number;
  error: string | null;
  read_at: string | null;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_success_at: string | null;
  failure_count: number;
};

export type ModuleRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  name: string;
  position: number | null;
  unlock_at: string | null;
  state: string | null;
  items_count: number;
  first_seen_at: string;
  missing_since: string | null;
  last_synced_at: string;
};

export type ModuleItemRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  module_id: string;
  title: string;
  item_type: string;
  position: number | null;
  indent: number;
  content_id: number | null;
  html_url: string | null;
  external_url: string | null;
  first_seen_at: string;
  missing_since: string | null;
  /** Programa de escritorio: copia del archivo en la carpeta local (ruta relativa). */
  local_path: string | null;
  last_synced_at: string;
};

export type FileRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  display_name: string;
  content_type: string | null;
  size_bytes: number | null;
  canvas_created_at: string | null;
  canvas_updated_at: string | null;
  html_url: string | null;
  first_seen_at: string;
  missing_since: string | null;
  last_synced_at: string;
};

export type PageRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  slug: string | null;
  title: string;
  front_page: boolean;
  canvas_updated_at: string | null;
  html_url: string | null;
  first_seen_at: string;
  missing_since: string | null;
  last_synced_at: string;
};

export type CalendarEventRow = {
  id: string;
  user_id: string;
  course_id: string;
  provider: "canvas";
  external_id: number;
  title: string;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  location_name: string | null;
  description_text: string | null;
  html_url: string | null;
  online_meeting_url: string | null;
  first_seen_at: string;
  missing_since: string | null;
  last_synced_at: string;
};

export type MaterialsResource = "modules" | "files" | "pages";
export type ResourceStatus = "ok" | "unavailable" | "error";

export type ClassSessionRow = {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  session_at: string;
  duration_minutes: number | null;
  recording_url: string | null;
  source: "manual" | "graph";
  external_id: string | null;
  topics: string[];
  notes: string | null;
  watched_at: string | null;
  understanding: Understanding | null;
  review_state: ReviewState | null;
  last_reviewed_at: string | null;
  review_count: number;
  /** Programa de escritorio: vídeo de la clase en la carpeta local (ruta relativa). */
  local_video: string | null;
  created_at: string;
  updated_at: string;
};

export type Understanding = "low" | "mid" | "high";
export type ReviewState = "reviewing" | "done";

export type ClassResourceRow = {
  id: string;
  user_id: string;
  course_id: string;
  session_id: string | null;
  module_item_id: string | null;
  url: string;
  title: string;
  note: string | null;
  created_at: string;
};

export type MaterialNoteRow = {
  id: string;
  user_id: string;
  course_id: string;
  module_item_id: string;
  content_md: string;
  updated_at: string;
};

export type MaterialTextRow = {
  id: string;
  user_id: string;
  module_item_id: string;
  pages: number;
  content_text: string;
  extracted_at: string;
};

export type ClassSkipRow = {
  id: string;
  user_id: string;
  course_id: string;
  class_date: string;
  created_at: string;
};

export type TranscriptRow = {
  id: string;
  user_id: string;
  session_id: string;
  source_format: "vtt" | "docx" | "txt" | "paste";
  content_text: string;
  word_count: number;
  speakers: string[];
  created_at: string;
};

export type NoteKind = "summary" | "questions" | "exercises";

export type StudyNoteRow = {
  id: string;
  user_id: string;
  course_id: string;
  session_id: string | null;
  kind: NoteKind;
  content_md: string;
  provider: string;
  model: string;
  input_hash: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  external_id: number;
  subject: string | null;
  last_message_excerpt: string | null;
  last_message_at: string | null;
  participants: string[];
  context_name: string | null;
  workflow_state: string;
  message_count: number;
  starred: boolean;
  first_seen_at: string;
  missing_since: string | null;
  last_synced_at: string;
};

export type ActivityRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  external_id: number;
  item_type: string;
  notification_category: string | null;
  title: string | null;
  excerpt: string | null;
  html_url: string | null;
  read_state: boolean | null;
  canvas_created_at: string | null;
  canvas_updated_at: string | null;
  first_seen_at: string;
  last_synced_at: string;
};

export type PersonRow = {
  id: string;
  user_id: string;
  course_id: string;
  external_id: number;
  name: string;
  role: "teacher" | "ta" | "designer" | "other";
  role_label: string | null;
  email: string | null;
  missing_since: string | null;
  last_synced_at: string;
};

export type ScheduleRow = {
  id: string;
  user_id: string;
  course_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  meeting_url: string | null;
  note: string | null;
  created_at: string;
};

export type SearchSourceType = "transcript" | "class_note" | "study_note" | "material" | "material_note" | "resource";
export type SearchChunkRow = {
  id: string;
  user_id: string;
  course_id: string | null;
  source_type: SearchSourceType;
  source_id: string;
  chunk_index: number;
  title: string;
  location: string | null;
  href: string;
  content: string;
  tsv: unknown;
  created_at: string;
};
export type SearchSourceRow = {
  user_id: string;
  source_type: SearchSourceType;
  source_id: string;
  hash: string;
  chunks: number;
  indexed_at: string;
};
export type SearchHit = {
  id: string;
  course_id: string | null;
  source_type: SearchSourceType;
  source_id: string;
  chunk_index: number;
  title: string;
  location: string | null;
  href: string;
  content: string;
  rank: number;
};

export type FlashcardState = "new" | "learning" | "review";
export type FlashcardRow = {
  id: string;
  user_id: string;
  course_id: string;
  session_id: string | null;
  module_item_id: string | null;
  front: string;
  back: string;
  source_label: string | null;
  origin: "ai" | "manual";
  state: FlashcardState;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  step: number;
  last_reviewed_at: string | null;
  suspended: boolean;
  created_at: string;
  updated_at: string;
};
export type FlashcardReviewRow = {
  id: string;
  user_id: string;
  card_id: string;
  course_id: string;
  rating: number;
  was_new: boolean;
  reviewed_at: string;
};
export type ExamRow = {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  exam_at: string;
  session_ids: string[];
  module_item_ids: string[];
  created_at: string;
};
