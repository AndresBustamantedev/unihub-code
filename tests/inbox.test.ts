import { describe, expect, it } from "vitest";
import { diffConversations, mapActivity, mapConversation } from "@/features/inbox/map";

const ctx = { userId: "u", selfId: 7, courseIdByExternal: new Map([[170132, "course-uuid"]]), nowIso: "2026-11-14T12:00:00Z" };

describe("mapConversation", () => {
  it("excluye al propio usuario, mapea la asignatura y recorta el extracto", () => {
    const r = mapConversation(
      {
        id: 1,
        subject: " Presentación nueva tutora ",
        workflow_state: "unread",
        last_message: "Buenas tardes,   Alex: soy Marta",
        last_message_at: "2026-05-27T10:00:00Z",
        participants: [{ id: 7, name: "Yo" }, { id: 9, full_name: "MARTA GARCIA LOPEZ" }],
        audience_contexts: { courses: { "170132": ["TeacherEnrollment"] } },
      },
      ctx,
    );
    expect(r).toMatchObject({ subject: "Presentación nueva tutora", participants: ["MARTA GARCIA LOPEZ"], course_id: "course-uuid", last_message_excerpt: "Buenas tardes, Alex: soy Marta" });
  });
});

describe("mapActivity", () => {
  it("omite conversaciones y limpia el HTML", () => {
    expect(mapActivity({ id: 1, type: "Conversation" }, ctx)).toBeNull();
    expect(mapActivity({ id: 2, type: "Message", notification_category: "Grading", message: "<p>Nota <b>publicada</b></p>", course_id: 170132 }, ctx)).toMatchObject({
      excerpt: "Nota publicada",
      course_id: "course-uuid",
      notification_category: "Grading",
    });
  });
});

describe("diffConversations", () => {
  const row = (o: Partial<ReturnType<typeof mapConversation>>) => ({ ...mapConversation({ id: 1, workflow_state: "unread", last_message_at: "2026-11-14T10:00:00Z" }, ctx), ...o });
  it("primera sincronización: nada", () => expect(diffConversations(new Map(), [row({})], true)).toEqual([]));
  it("conversación nueva sin leer", () => expect(diffConversations(new Map(), [row({})], false)).toHaveLength(1));
  it("respuesta nueva en conversación conocida", () =>
    expect(diffConversations(new Map([[1, "2026-11-13T10:00:00Z"]]), [row({})], false)[0]?.dedupe_key).toBe("2026-11-14T10:00:00Z"));
  it("sin cambios o ya leída: nada", () => {
    expect(diffConversations(new Map([[1, "2026-11-14T10:00:00Z"]]), [row({})], false)).toEqual([]);
    expect(diffConversations(new Map(), [row({ workflow_state: "read" })], false)).toEqual([]);
  });
});
