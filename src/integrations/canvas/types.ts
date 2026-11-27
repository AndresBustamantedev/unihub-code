/** Subconjunto de los objetos de Canvas que usamos. Todo opcional: Canvas omite campos según permisos. */
export interface CanvasTerm {
  id: number;
  name?: string | null;
  start_at?: string | null;
  end_at?: string | null;
}

export interface CanvasEnrollment {
  type?: string; // student, teacher, ta, observer, designer
  role?: string;
  enrollment_state?: string; // active, invited, completed, inactive
}

export interface CanvasCourse {
  id: number;
  name?: string;
  course_code?: string;
  workflow_state?: string; // available, completed, unpublished, deleted
  start_at?: string | null;
  end_at?: string | null;
  concluded?: boolean;
  access_restricted_by_date?: boolean;
  enrollments?: CanvasEnrollment[];
  term?: CanvasTerm | null;
  image_download_url?: string | null;
}

export interface CanvasSubmission {
  workflow_state?: string; // unsubmitted, submitted, pending_review, graded
  submitted_at?: string | null;
  score?: number | null;
  grade?: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean | null;
}

export interface CanvasAssignment {
  id: number;
  name?: string;
  description?: string | null;
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  points_possible?: number | null;
  submission_types?: string[];
  html_url?: string;
  updated_at?: string | null;
  published?: boolean;
  submission?: CanvasSubmission;
}

export interface CanvasAnnouncement {
  id: number;
  title?: string;
  message?: string | null;
  posted_at?: string | null;
  delayed_post_at?: string | null;
  html_url?: string;
  context_code?: string; // "course_123"
  author?: { display_name?: string } | null;
  user_name?: string;
}

export interface CanvasModuleItem {
  id: number;
  module_id?: number;
  title?: string;
  type?: string; // File, Page, Assignment, Quiz, Discussion, ExternalUrl, ExternalTool, SubHeader
  position?: number;
  indent?: number;
  content_id?: number | null;
  html_url?: string;
  external_url?: string;
  published?: boolean;
}

export interface CanvasModule {
  id: number;
  name?: string;
  position?: number;
  unlock_at?: string | null;
  state?: string; // locked, unlocked, started, completed (solo para estudiantes)
  items_count?: number;
  published?: boolean;
  items?: CanvasModuleItem[];
}

export interface CanvasFile {
  id: number;
  display_name?: string;
  filename?: string;
  "content-type"?: string;
  size?: number;
  created_at?: string | null;
  updated_at?: string | null;
  modified_at?: string | null;
  hidden_for_user?: boolean;
  locked_for_user?: boolean;
}

export interface CanvasPage {
  page_id: number;
  url?: string;
  title?: string;
  updated_at?: string | null;
  published?: boolean;
  front_page?: boolean;
  html_url?: string;
}

export interface CanvasCalendarEvent {
  id: number | string;
  title?: string;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  location_name?: string | null;
  description?: string | null;
  html_url?: string;
  context_code?: string;
  workflow_state?: string;
  online_meeting_url?: string | null;
}

export interface CanvasConversation {
  id: number;
  subject?: string | null;
  workflow_state?: string; // read, unread, archived
  last_message?: string | null; // vista previa de ≤100 caracteres
  last_message_at?: string | null;
  message_count?: number;
  starred?: boolean;
  context_name?: string | null;
  context_code?: string | null;
  participants?: { id: number; name?: string; full_name?: string }[];
  audience_contexts?: { courses?: Record<string, unknown>; groups?: Record<string, unknown> };
}

export interface CanvasStreamItem {
  id: number;
  type?: string; // DiscussionTopic, Announcement, Conversation, Message, Submission, Conference, Collaboration, AssessmentRequest
  title?: string | null;
  message?: string | null;
  notification_category?: string | null;
  html_url?: string | null;
  url?: string | null;
  read_state?: boolean | null;
  context_type?: string | null;
  course_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CanvasUser {
  id: number;
  name?: string;
  short_name?: string;
  sortable_name?: string;
  email?: string | null;
  enrollments?: { type?: string; role?: string; enrollment_state?: string }[];
}
