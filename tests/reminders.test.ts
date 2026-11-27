import { describe, expect, it } from "vitest";
import { planReminders, type ReminderCandidate } from "@/features/reminders/plan";

const NOW = new Date("2026-11-14T12:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const cand = (o: Partial<ReminderCandidate>): ReminderCandidate => ({
  id: "a1", name: "Práctica 1", due_at: h(48), submission_state: "pending", last_synced_at: NOW.toISOString(), missing_since: null, html_url: null, courseLabel: "REDES", ...o,
});
const kinds = (r: ReturnType<typeof planReminders>) => r.map((x) => `${x.kind}:${x.status}`);

describe("planReminders", () => {
  it("fuera de toda ventana => nada", () => expect(planReminders([cand({ due_at: h(80) })], NOW)).toEqual([]));
  it("a 48 h => solo 72h", () => expect(kinds(planReminders([cand({})], NOW))).toEqual(["due_72h:pending"]));
  it("a 20 h => 24h pendiente y 72h omitido", () => expect(kinds(planReminders([cand({ due_at: h(20) })], NOW))).toEqual(["due_72h:skipped", "due_24h:pending"]));
  it("a 5 h => solo envía el de 6h", () =>
    expect(kinds(planReminders([cand({ due_at: h(5) })], NOW))).toEqual(["due_72h:skipped", "due_24h:skipped", "due_6h:pending"]));
  it("vencida, entregada, sin fecha o retirada => nada", () => {
    expect(planReminders([cand({ due_at: h(-1) })], NOW)).toEqual([]);
    expect(planReminders([cand({ submission_state: "submitted", due_at: h(5) })], NOW)).toEqual([]);
    expect(planReminders([cand({ due_at: null })], NOW)).toEqual([]);
    expect(planReminders([cand({ due_at: h(5), missing_since: h(-2) })], NOW)).toEqual([]);
  });
  it("fecha no verificada (sync antigua) => nada", () =>
    expect(planReminders([cand({ due_at: h(5), last_synced_at: h(-3) })], NOW)).toEqual([]));
  it("conserva la fecha exacta para deduplicar", () => expect(planReminders([cand({ due_at: h(10) })], NOW)[0]?.due_at).toBe(h(10)));
});
