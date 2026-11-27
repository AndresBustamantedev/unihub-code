const rtf = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });

export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "nunca";
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", year: "numeric" });
}

export const APP_TIME_ZONE = "Europe/Madrid";

function dayKey(d: Date): string {
  // YYYY-MM-DD en la zona de la app.
  return d.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((Date.parse(dayKey(a)) - Date.parse(dayKey(b))) / 86_400_000);
}

/** "lun 17 nov, 23:59" */
export function formatDue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export function dueBucket(iso: string | null | undefined, now: Date = new Date()): DueBucket {
  if (!iso) return "none";
  const due = new Date(iso);
  if (due.getTime() < now.getTime()) return "overdue";
  const diff = dayDiff(due, now);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "week";
  return "later";
}

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Vencidas",
  today: "Hoy",
  tomorrow: "Mañana",
  week: "Próximos 7 días",
  later: "Más adelante",
  none: "Sin fecha de entrega",
};

/** "lun 17 nov · 18:00–20:00" */
export function formatEventRange(start: string | null, end: string | null, allDay = false): string {
  if (!start) return "sin fecha";
  const day = new Date(start).toLocaleDateString("es-ES", { timeZone: APP_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
  if (allDay) return `${day} · todo el día`;
  const t = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  return `${day} · ${t(start)}${end ? `–${t(end)}` : ""}`;
}

export function formatBytes(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function tzOffsetMs(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - ts;
}

/** "2026-11-14T10:00" en hora de Madrid → ISO UTC. Correcto en cambios de horario. */
export function madridLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let ts = guess - tzOffsetMs(guess, APP_TIME_ZONE);
  ts = guess - tzOffsetMs(ts, APP_TIME_ZONE);
  return new Date(ts).toISOString();
}

/** ISO → "2026-11-14T10:00" en hora de Madrid (para <input type="datetime-local">). */
export function isoToMadridLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + tzOffsetMs(new Date(iso).getTime(), APP_TIME_ZONE));
  return d.toISOString().slice(0, 16);
}

export function madridDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
}

export interface WeekDay {
  key: string;
  /** 1 = lunes … 7 = domingo (hora de Madrid). */
  isoWeekday: number;
  weekday: string;
  day: string;
  isToday: boolean;
  isWeekend: boolean;
}

/** n días en hora de Madrid empezando hoy (o `startOffset` días después de hoy). */
export function nextDays(now: Date, n = 7, startOffset = 0): WeekDay[] {
  return Array.from({ length: n }, (_, j) => {
    const i = j + startOffset;
    const d = new Date(now.getTime() + i * 86_400_000);
    const wd = d.toLocaleDateString("es-ES", { timeZone: APP_TIME_ZONE, weekday: "short" }).replace(".", "");
    const isoWeekday = ((new Date(`${madridDayKey(d)}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    return {
      key: madridDayKey(d),
      isoWeekday,
      weekday: i === 0 ? "hoy" : i === 1 ? "mañana" : wd,
      day: d.toLocaleDateString("es-ES", { timeZone: APP_TIME_ZONE, day: "numeric" }),
      isToday: i === 0,
      isWeekend: ["sáb", "dom"].includes(wd),
    };
  });
}

/** "23:59" en Madrid. */
export function madridTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

export function longToday(now = new Date()): string {
  const s = now.toLocaleDateString("es-ES", { timeZone: APP_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const WEEKDAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** "18:00:00" → "18:00" */
export function hhmm(t: string): string {
  return t.slice(0, 5);
}

/** Minutos desde medianoche en Madrid, para saber si una clase está en curso. */
export function madridMinutesNow(now = new Date()): number {
  const [h, m] = madridTime(now.toISOString()).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
