import { describe, expect, it } from "vitest";
import { diffAssignments, mapAssignment, submissionStateOf, type AssignmentUpsert } from "@/features/content/map";
import { htmlToText } from "@/lib/html";
import { dueBucket } from "@/lib/format";
import type { CanvasAssignment } from "@/integrations/canvas/types";

const ctx = { userId: "u", courseId: "c", nowIso: "2026-11-14T12:00:00Z" };
const row = (o: Partial<CanvasAssignment>): AssignmentUpsert => mapAssignment({ id: 1, name: "P1", submission_types: ["online_upload"], submission: { workflow_state: "unsubmitted" }, ...o }, ctx);

describe("submissionStateOf", () => {
  it("pendiente / entregada / calificada / exenta", () => {
    expect(submissionStateOf({ id: 1, submission_types: ["online_upload"], submission: { workflow_state: "unsubmitted" } })).toBe("pending");
    expect(submissionStateOf({ id: 1, submission: { workflow_state: "submitted", submitted_at: "2026-11-01T00:00:00Z" } })).toBe("submitted");
    expect(submissionStateOf({ id: 1, submission: { workflow_state: "graded", score: 8 } })).toBe("graded");
    expect(submissionStateOf({ id: 1, submission: { workflow_state: "graded", excused: true } })).toBe("excused");
  });
  it("calificada sin nota publicada sigue como entregada", () => {
    expect(submissionStateOf({ id: 1, submission: { workflow_state: "graded", score: null, submitted_at: "2026-11-01T00:00:00Z" } })).toBe("submitted");
  });
  it("sin entrega online", () => expect(submissionStateOf({ id: 1, submission_types: ["on_paper"], submission: { workflow_state: "unsubmitted" } })).toBe("not_required"));
  it("sin objeto submission => desconocido", () => expect(submissionStateOf({ id: 1, submission_types: ["online_upload"] })).toBe("unknown"));
});

describe("diffAssignments", () => {
  const prev = [{ external_id: 1, name: "P1", due_at: "2026-11-20T22:59:00Z", submission_state: "pending" as const, missing_since: null }];
  it("primera importación no genera novedades", () => expect(diffAssignments([], [row({})], true)).toEqual([]));
  it("tarea nueva", () => expect(diffAssignments([], [row({ id: 2, name: "P2" })], false).map((c) => c.kind)).toEqual(["new_assignment"]));
  it("cambio de fecha con dedupe por la nueva fecha", () => {
    const [c] = diffAssignments(prev, [row({ due_at: "2026-11-27T22:59:00Z" })], false);
    expect(c?.kind).toBe("due_date_changed");
    expect(c?.dedupe_key).toBe("2026-11-27T22:59:00Z");
  });
  it("misma fecha en otro formato no es cambio", () => expect(diffAssignments(prev, [row({ due_at: "2026-11-20T23:59:00+01:00" })], false)).toEqual([]));
  it("calificada", () =>
    expect(diffAssignments(prev, [row({ due_at: prev[0]!.due_at, submission: { workflow_state: "graded", score: 9 } })], false).map((c) => c.kind)).toEqual(["graded"]));
  it("retirada", () => expect(diffAssignments(prev, [], false).map((c) => c.kind)).toEqual(["assignment_removed"]));
});

describe("htmlToText", () => {
  it("limpia etiquetas, scripts y entidades", () => {
    expect(htmlToText('<p>Hola&nbsp;<b>mundo</b> &amp; m&aacute;s</p><script>alert(1)</script><p>Fin</p>')).toBe("Hola mundo & más\nFin");
  });
  it("mayúsculas acentuadas", () => expect(htmlToText("&Aacute;rbol &iquest;s&iacute;?")).toBe("Árbol ¿sí?"));
  it("trunca", () => expect(htmlToText("a".repeat(50), 10)).toHaveLength(10));
});

describe("dueBucket (Europe/Madrid)", () => {
  const now = new Date("2026-11-14T10:00:00Z"); // 11:00 en Madrid
  it("vencida / hoy / mañana / semana", () => {
    expect(dueBucket("2026-11-14T09:00:00Z", now)).toBe("overdue");
    expect(dueBucket("2026-11-14T22:30:00Z", now)).toBe("today"); // 23:30 Madrid
    expect(dueBucket("2026-11-14T23:30:00Z", now)).toBe("tomorrow"); // 00:30 del 15 en Madrid
    expect(dueBucket("2026-11-19T10:00:00Z", now)).toBe("week");
    expect(dueBucket("2026-12-20T10:00:00Z", now)).toBe("later");
    expect(dueBucket(null, now)).toBe("none");
  });
});
