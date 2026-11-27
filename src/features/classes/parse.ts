/**
 * Limpieza de transcripciones exportadas de Teams.
 * Formatos: WebVTT (con <v Hablante>), texto extraído del .docx de Teams y texto libre.
 */
export interface ParsedTranscript {
  text: string;
  speakers: string[];
  wordCount: number;
  durationMinutes: number | null;
}

const TS = /(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/;
const CUE_TIMING = new RegExp(`^\\s*${TS.source}\\s*-->\\s*(${TS.source})`);

function toSeconds(ts: string): number {
  const [main = "0"] = ts.replace(",", ".").split(".");
  const parts = main.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);
}

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

interface Turn {
  speaker: string | null;
  text: string;
}

function mergeTurns(turns: Turn[]): { text: string; speakers: string[] } {
  const merged: Turn[] = [];
  for (const t of turns) {
    const clean = t.text.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const last = merged[merged.length - 1];
    if (last && last.speaker === t.speaker) last.text += ` ${clean}`;
    else merged.push({ speaker: t.speaker, text: clean });
  }
  const speakers = [...new Set(merged.map((m) => m.speaker).filter((s): s is string => !!s))];
  const text = merged.map((m) => (m.speaker ? `${m.speaker}: ${m.text}` : m.text)).join("\n\n");
  return { text, speakers };
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function parseVtt(raw: string): ParsedTranscript {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  const turns: Turn[] = [];
  let maxEnd = 0;
  let inNote = false;
  let inCue = false;
  for (const line of lines) {
    if (/^WEBVTT/.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) {
      inNote = true;
      continue;
    }
    if (line.trim() === "") {
      inNote = false;
      inCue = false;
      continue;
    }
    if (inNote) continue;
    const timing = CUE_TIMING.exec(line);
    if (timing) {
      maxEnd = Math.max(maxEnd, toSeconds(timing[2] ?? "0"));
      inCue = true;
      continue;
    }
    if (!inCue) continue; // identificadores de cue
    const voice = /<v(?:\.[^ >]*)?\s+([^>]+)>/.exec(line);
    const text = decode(line.replace(/<[^>]+>/g, ""));
    turns.push({ speaker: voice?.[1]?.trim() ?? null, text });
  }
  const { text, speakers } = mergeTurns(turns);
  return { text, speakers, wordCount: words(text), durationMinutes: maxEnd > 0 ? Math.round(maxEnd / 60) : null };
}

const DOCX_SPEAKER = /^(.{2,80}?)\s{1,}(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
const DOCX_DURATION = /^\s*(?:(\d+)\s*h\s*)?(?:(\d+)\s*m(?:in)?\s*)?(?:(\d+)\s*s)?\s*$/i;

/** Texto plano extraído del .docx de Teams: "Nombre   0:03" seguido del texto. */
export function parseTeamsText(raw: string): ParsedTranscript {
  const lines = raw.replace(/\r/g, "").split("\n");
  const turns: Turn[] = [];
  let current: Turn | null = null;
  let duration: number | null = null;
  let maxTs = 0;
  let sawSpeakerHeader = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (!sawSpeakerHeader) {
      const d = DOCX_DURATION.exec(t);
      if (d && (d[1] || d[2] || d[3]) && /\d\s*[hms]/i.test(t)) {
        duration = Math.round(Number(d[1] ?? 0) * 60 + Number(d[2] ?? 0) + Number(d[3] ?? 0) / 60);
        continue;
      }
    }
    const sp = DOCX_SPEAKER.exec(t);
    if (sp && sp[1] && !/[.!?,]$/.test(sp[1]) && !/\d{4}/.test(sp[1]) && !/^\d/.test(sp[1])) {
      sawSpeakerHeader = true;
      current = { speaker: sp[1].trim(), text: "" };
      turns.push(current);
      maxTs = Math.max(maxTs, toSeconds(sp[2] ?? "0"));
      continue;
    }
    if (current) current.text += ` ${t}`;
    else if (sawSpeakerHeader) turns.push({ speaker: null, text: t });
    else if (!/^(transcripci[oó]n|transcript)$/i.test(t) && !/\d{4}/.test(t)) turns.push({ speaker: null, text: t });
  }
  if (!sawSpeakerHeader) return parsePlain(raw);
  const { text, speakers } = mergeTurns(turns);
  return { text, speakers, wordCount: words(text), durationMinutes: duration ?? (maxTs > 0 ? Math.round(maxTs / 60) : null) };
}

export function parsePlain(raw: string): ParsedTranscript {
  const text = raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { text, speakers: [], wordCount: words(text), durationMinutes: null };
}

/** Detecta el formato por contenido (no por extensión, que el usuario puede cambiar). */
export function parseTranscript(raw: string): ParsedTranscript & { format: "vtt" | "teams" | "plain" } {
  if (/^﻿?WEBVTT/.test(raw.trimStart()) || CUE_TIMING.test(raw.split("\n").slice(0, 20).join("\n"))) return { ...parseVtt(raw), format: "vtt" };
  const teams = parseTeamsText(raw);
  return { ...teams, format: teams.speakers.length > 0 ? "teams" : "plain" };
}
