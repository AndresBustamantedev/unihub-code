import { describe, expect, it } from "vitest";
import { parseTranscript, parseVtt, parseTeamsText } from "@/features/classes/parse";
import { extractTopics } from "@/features/classes/topics";
import { courseAcronym, parseRecordingName, suggestCourse } from "@/features/classes/suggest";

const VTT = `WEBVTT

NOTE generado por Teams

a1b2c3/12-0
00:00:03.120 --> 00:00:06.400
<v Profesora García>Buenos días, hoy vemos subredes.</v>

a1b2c3/13-0
00:00:06.400 --> 00:00:09.000
<v Profesora García>Empezamos por la máscara &amp; el prefijo.</v>

a1b2c3/14-0
00:00:09.000 --> 01:02:10.000
<v Alumno Pérez>¿Entra en el examen?</v>
`;

describe("parseVtt", () => {
  it("une turnos del mismo hablante, decodifica entidades y calcula duración", () => {
    const r = parseVtt(VTT);
    expect(r.speakers).toEqual(["Profesora García", "Alumno Pérez"]);
    expect(r.text).toBe("Profesora García: Buenos días, hoy vemos subredes. Empezamos por la máscara & el prefijo.\n\nAlumno Pérez: ¿Entra en el examen?");
    expect(r.durationMinutes).toBe(62);
  });
  it("detecta VTT por contenido", () => expect(parseTranscript(VTT).format).toBe("vtt"));
});

describe("parseTeamsText (.docx)", () => {
  const DOCX = `Transcripción
14 de noviembre de 2026, 10:00
1h 2m 5s

Profesora García   0:03
Buenos días.
Hoy vemos subredes.

Alumno Pérez   1:15
¿Entra en el examen?`;
  it("reconoce hablantes y duración del encabezado", () => {
    const r = parseTeamsText(DOCX);
    expect(r.speakers).toEqual(["Profesora García", "Alumno Pérez"]);
    expect(r.text.startsWith("Profesora García: Buenos días. Hoy vemos subredes.")).toBe(true);
    expect(r.durationMinutes).toBe(62);
  });
  it("texto libre se mantiene", () => expect(parseTranscript("Apuntes sueltos\nsin formato").format).toBe("plain"));
});

describe("extractTopics", () => {
  it("prioriza bigramas repetidos e ignora relleno y nombres de hablante", () => {
    const t = Array(4).fill("Profesora García: vale, la máscara de subred define la máscara de subred y el enrutamiento estático. Entonces el enrutamiento estático vale.").join("\n");
    const topics = extractTopics(t);
    expect(topics[0]).toMatch(/subred|enrutamiento/);
    expect(topics.join(" ")).not.toMatch(/vale|entonces|garcía/i);
  });
});

describe("suggestCourse", () => {
  const courses = [
    { id: "1", name: "FUNDAMENTOS DE REDES (M11-PAGO M12-PAGO)", course_code: "FUNDAMENTOS DE REDES" },
    { id: "2", name: "ANÁLISIS MATEMÁTICO (M11-PAGO M11-PAWT)", course_code: "ANÁLISIS MATEMÁTICO" },
  ];
  it("empareja por nombre de archivo de Teams", () => expect(suggestCourse("Clase Fundamentos de Redes - Transcript.vtt", courses)?.id).toBe("1"));
  it("acentos y mayúsculas da igual", () => expect(suggestCourse("analisis matematico 14-11.docx", courses)?.id).toBe("2"));
  it("siglas de Teams (PEL)", () => {
    const withPel = [...courses, { id: "3", name: "PROGRAMACIÓN CON ESTRUCTURAS LINEALES (M21-PAGO M21-PAWT)", course_code: "PROGRAMACIÓN CON ESTRUCTURAS LINEALES" }];
    expect(courseAcronym(withPel[2]!.name)).toBe("pel");
    expect(suggestCourse("PEL-20261008_193518-Meeting Recording.vtt", withPel)?.id).toBe("3");
    expect(suggestCourse("pel minúsculas no cuentan", withPel)).toBeNull();
  });
  it("sin coincidencia clara: null", () => expect(suggestCourse("Reunión de tutoría.vtt", courses)).toBeNull());
});

import { isoToMadridLocal, madridLocalToIso } from "@/lib/format";
describe("hora de Madrid", () => {
  it("invierno (UTC+1) y verano (UTC+2)", () => {
    expect(madridLocalToIso("2026-11-14T10:00")).toBe("2026-11-14T09:00:00.000Z");
    expect(madridLocalToIso("2026-07-01T10:00")).toBe("2026-07-01T08:00:00.000Z");
    expect(isoToMadridLocal("2026-11-14T09:00:00.000Z")).toBe("2026-11-14T10:00");
    expect(madridLocalToIso("basura")).toBeNull();
  });
});

import { safeFilename, sessionToMarkdown } from "@/features/classes/markdown";
describe("sessionToMarkdown", () => {
  it("incluye metadatos y marca hablantes en negrita", () => {
    const md = sessionToMarkdown(
      { title: "Subredes", session_at: "2026-11-14T09:00:00Z", duration_minutes: 62, recording_url: "https://x.sharepoint.com/r", topics: ["máscara de subred"], notes: null },
      "FUNDAMENTOS DE REDES",
      { content_text: "Profesora García: Hola.\n\nAlumno: ¿Examen?", speakers: ["Profesora García", "Alumno"] },
    );
    expect(md).toContain("# Subredes");
    expect(md).toContain("- **Duración:** 62 min");
    expect(md).toContain("**Profesora García:** Hola.");
  });
  it("nombres de archivo seguros", () => expect(safeFilename('2026-11-14_Tema 4: "Subredes"/IPv4')).toBe("2026-11-14_Tema_4_SubredesIPv4"));
});

describe("parseRecordingName", () => {
  it("desde la URL de Stream", () => {
    const url = "https://univeuropeaes.sharepoint.com/sites/X/_layouts/15/stream.aspx?id=%2Fsites%2FX%2FDocumentos%20compartidos%2FGeneral%2FRecordings%2FPEL-20261008_193518-Meeting%20Recording.mp4";
    expect(parseRecordingName(url)).toEqual({ name: "PEL-20261008_193518-Meeting Recording", localDate: "2026-10-08T19:35", title: "PEL" });
  });
  it("desde el archivo descargado", () => expect(parseRecordingName("PEL-20261008_193518-Meeting Recording.vtt").localDate).toBe("2026-10-08T19:35"));
  it("sin fecha", () => expect(parseRecordingName("Tema 4.docx").localDate).toBeNull());
});

import { displayCourseName } from "@/lib/course-color";
describe("displayCourseName", () => {
  it("pasa mayúsculas a formato normal y quita grupos", () => {
    expect(displayCourseName("PROGRAMACIÓN CON ESTRUCTURAS LINEALES (M21-PAGO M21-PAWT)")).toBe("Programación con estructuras lineales");
    expect(displayCourseName("Programación Avanzada INFORMÁTICA (M21-PAGO)")).toBe("Programación Avanzada INFORMÁTICA");
    expect(displayCourseName("BASIC STEAM_CÁLCULO")).toBe("Basic steam_cálculo");
  });
});

import { nextDays } from "@/lib/format";
describe("nextDays", () => {
  it("día de la semana ISO en hora de Madrid", () => {
    const d = nextDays(new Date("2026-11-15T23:30:00Z"), 2); // lunes 16 a las 00:30 en Madrid
    expect(d[0]?.isoWeekday).toBe(1);
    expect(d[1]?.isoWeekday).toBe(2);
  });
});

import { generatedCover, motifFor } from "@/lib/cover-art";
describe("portadas generadas", () => {
  it("motivo según la materia", () => {
    expect(motifFor("FUNDAMENTOS DE REDES")).toBe("network");
    expect(motifFor("ANÁLISIS MATEMÁTICO")).toBe("math");
    expect(motifFor("PROGRAMACIÓN CON ESTRUCTURAS LINEALES")).toBe("code");
    expect(motifFor("BASES DE LA INFORMÁTICA")).toBe("circuit");
  });
  it("determinista y SVG válido", () => {
    const a = generatedCover("abc", "Redes");
    expect(a).toBe(generatedCover("abc", "Redes"));
    expect(decodeURIComponent(a)).toContain("<svg");
  });
});

import { courseHue, pickFreeHue, registerCourseHues } from "@/lib/course-color";
describe("colores de asignatura", () => {
  it("elige el primer tono libre", () => expect(pickFreeHue([221, 162])).toBe(27));
  it("el color guardado manda sobre el calculado", () => {
    registerCourseHues([{ id: "x1", color_hue: 300 }]);
    expect(courseHue("x1")).toBe(300);
  });
});
