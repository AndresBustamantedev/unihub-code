import "server-only";
import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { findMissingClasses, pastOccurrences } from "@/features/classes/missing";
import { anonymizeSpeakers } from "@/features/notes/prompts";

/**
 * Datos de ejemplo del modo demo («Probar con datos de ejemplo»): asignaturas, tareas, anuncios,
 * horario, clases con transcripción y apuntes, tarjetas y un examen. Todo inventado y con fechas
 * relativas a hoy, para que la demo siempre parezca al día. Solo se carga en una base vacía.
 */

interface DemoCourse {
  key: string;
  name: string;
  code: string;
  hue: number;
  teacher: string;
  schedule: [weekday: number, start: string, end: string, room: string][];
}

const COURSES: DemoCourse[] = [
  { key: "bd", name: "Bases de Datos", code: "BD-2", hue: 215, teacher: "Lucía Martín Ortega", schedule: [[1, "09:00", "11:00", "Aula 2.14"], [3, "09:00", "10:00", "Lab. 1"]] },
  { key: "redes", name: "Redes de Computadores", code: "RC-2", hue: 160, teacher: "Javier Ruiz Prado", schedule: [[2, "11:00", "13:00", "Aula 1.03"], [4, "11:00", "12:00", "Lab. 3"]] },
  { key: "conc", name: "Programación Concurrente", code: "PC-2", hue: 280, teacher: "Elena Navarro Gil", schedule: [[1, "12:00", "14:00", "Aula 2.07"], [5, "09:00", "11:00", "Lab. 2"]] },
  { key: "est", name: "Estadística", code: "EST-2", hue: 30, teacher: "Andrés Moreno Vidal", schedule: [[3, "11:00", "13:00", "Aula 0.12"]] },
];

const DAY = 86_400_000;

/** ¿La base de datos está vacía (sin asignaturas)? Solo entonces se cargan los datos de ejemplo. */
export async function seedDemoIfEmpty(db: PGlite, uid: string): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.courses where user_id = $1", [uid]);
  if ((rows[0]?.n ?? 0) > 0) return false;
  await db.transaction(async (tx) => seed(tx as unknown as PGlite, uid));
  return true;
}

async function seed(db: PGlite, uid: string): Promise<void> {
  const now = Date.now();
  const at = (days: number, hour = 23, minute = 59) => {
    const d = new Date(now + days * DAY);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const termStart = at(-75, 0, 0);
  const termEnd = at(60, 0, 0);
  let ext = 990_000;
  const id: Record<string, string> = {};

  for (const c of COURSES) {
    const r = await db.query<{ id: string }>(
      `insert into public.courses (user_id, external_id, name, course_code, workflow_state, enrollment_types, enrollment_states,
         term_name, term_start_at, term_end_at, category, category_reason, followed, semester, color_hue, content_synced_at)
       values ($1, $2, $3, $4, 'available', '{student}', '{active}', 'Primer semestre', $5, $6, 'current', 'Datos de ejemplo', true, 3, $7, now())
       returning id`,
      [uid, ++ext, c.name, c.code, termStart, termEnd, c.hue],
    );
    id[c.key] = r.rows[0]!.id;
    await db.query("insert into public.course_people (user_id, course_id, external_id, name, role, role_label) values ($1, $2, $3, $4, 'teacher', 'Profesor')", [uid, id[c.key], ++ext, c.teacher]);
    for (const [weekday, start, end, room] of c.schedule) {
      await db.query("insert into public.class_schedule (user_id, course_id, weekday, start_time, end_time, location) values ($1, $2, $3, $4, $5, $6)", [uid, id[c.key], weekday, start, end, room]);
    }
  }

  // Tareas: unas pendientes (pronto), una entregada y una calificada.
  const assignments: [course: string, name: string, dueDays: number, state: string, points: number, score?: number][] = [
    ["bd", "Práctica 3: normalización hasta 3FN", 2, "pending", 10],
    ["redes", "Cuestionario: capa de transporte", 4, "pending", 5],
    ["conc", "Práctica 2: productor-consumidor con semáforos", 6, "pending", 10],
    ["est", "Entrega: análisis descriptivo con R", 9, "pending", 10],
    ["redes", "Práctica 1: captura de tráfico con Wireshark", -5, "submitted", 10],
    ["bd", "Práctica 2: consultas SQL avanzadas", -12, "graded", 10, 8.5],
  ];
  const assignmentIds: string[] = [];
  for (const [course, name, dueDays, state, points, score] of assignments) {
    const r = await db.query<{ id: string }>(
      `insert into public.assignments (user_id, course_id, external_id, name, description_text, due_at, points_possible, submission_types,
         submission_state, submitted_at, score, grade)
       values ($1, $2, $3, $4, $5, $6, $7, '{online_upload}', $8, $9, $10, $11) returning id`,
      [uid, id[course], ++ext, name, "Enunciado de ejemplo de la demo de UniHub.", at(dueDays), points, state,
        state === "pending" ? null : at(dueDays - 1, 18, 30), score ?? null, score == null ? null : String(score)],
    );
    assignmentIds.push(r.rows[0]!.id);
  }

  const announcements: [string, string, string, number][] = [
    ["bd", "Cambio de aula para el laboratorio del miércoles", "Esta semana el laboratorio será en el Lab. 2 por mantenimiento de los equipos.", -1],
    ["redes", "Material nuevo: apuntes del tema 4", "He subido los apuntes del tema 4 (TCP y control de congestión) a la sección de módulos.", -3],
    ["conc", "Tutorías de la práctica 2", "Habrá tutorías extra el jueves de 16:00 a 18:00 para resolver dudas de la práctica.", -4],
  ];
  for (const [course, title, msg, days] of announcements) {
    const c = COURSES.find((x) => x.key === course)!;
    await db.query(
      "insert into public.announcements (user_id, course_id, external_id, title, message_excerpt, author_name, posted_at) values ($1, $2, $3, $4, $5, $6, $7)",
      [uid, id[course], ++ext, title, msg, c.teacher, at(days, 10, 15)],
    );
  }

  // Novedades: lo que UniHub detecta entre sincronizaciones.
  const changes: [string, string, string, string, number][] = [
    ["bd", "assignment", "graded", "Práctica 2: consultas SQL avanzadas", -1],
    ["redes", "announcement", "new_announcement", "Material nuevo: apuntes del tema 4", -3],
    ["est", "assignment", "new_assignment", "Entrega: análisis descriptivo con R", -2],
  ];
  for (const [course, entity, kind, title, days] of changes) {
    await db.query(
      "insert into public.changes (user_id, course_id, entity_type, external_id, kind, title, detected_at) values ($1, $2, $3, $4, $5, $6, $7)",
      [uid, id[course], entity, ++ext, kind, title, at(days, 9, 0)],
    );
  }

  // Clases con transcripción (formato Teams resumido) y apuntes generados.
  const sessions: [course: string, title: string, days: number, hour: number, understanding: string | null, transcript: string][] = [
    ["bd", "Tema 5 · Normalización: 1FN, 2FN y 3FN", -7, 9, "mid",
      "Lucía Martín: Hoy vemos normalización. La idea es eliminar redundancias para evitar anomalías de inserción, borrado y actualización. Una tabla está en primera forma normal si todos sus atributos son atómicos. En segunda forma normal, además, ningún atributo no clave depende de una parte de la clave. Y en tercera forma normal no hay dependencias transitivas: un atributo no clave no puede depender de otro atributo no clave. Ejemplo: en Pedido(id, cliente, ciudad_cliente) la ciudad depende del cliente, no del pedido, así que hay que separarla."],
    ["bd", "Tema 6 · Transacciones y propiedades ACID", -2, 9, null,
      "Lucía Martín: Una transacción es una unidad de trabajo que se ejecuta entera o no se ejecuta. ACID: atomicidad, consistencia, aislamiento y durabilidad. El aislamiento tiene niveles: read uncommitted, read committed, repeatable read y serializable. Cuanto más alto, menos anomalías como lecturas sucias o fantasmas, pero menos concurrencia."],
    ["redes", "Tema 4 · TCP: control de flujo y de congestión", -6, 11, "high",
      "Javier Ruiz: TCP garantiza entrega fiable y ordenada. El control de flujo usa la ventana de recepción para no saturar al receptor. El control de congestión protege a la red: arranque lento, que duplica la ventana cada RTT, y evitación de congestión, que la aumenta de forma lineal. Ante tres ACK duplicados se hace retransmisión rápida."],
    ["conc", "Tema 3 · Semáforos y el problema productor-consumidor", -7, 12, "low",
      "Elena Navarro: Un semáforo es un contador con dos operaciones atómicas, wait y signal. Para el productor-consumidor usamos tres: uno para huecos libres, otro para elementos y un mutex para la sección crítica. Si se invierte el orden de los wait se puede producir un interbloqueo."],
    ["est", "Tema 2 · Distribuciones de probabilidad", -5, 11, "mid",
      "Andrés Moreno: La distribución binomial cuenta éxitos en n ensayos independientes. La de Poisson modela sucesos raros en un intervalo. La normal aparece por el teorema central del límite: la media de muchas variables independientes tiende a una normal."],
  ];
  const sessionIds: Record<string, string> = {};
  const hashes: Record<string, string> = {};
  for (const [i, [course, title, days, hour, understanding, text]] of sessions.entries()) {
    const watched = understanding != null;
    const r = await db.query<{ id: string }>(
      `insert into public.class_sessions (user_id, course_id, title, session_at, duration_minutes, topics, watched_at, understanding, review_state, review_count)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [uid, id[course], title, at(days, hour, 0), 110, [], watched ? at(days + 1, 19, 0) : null, understanding,
        understanding === "high" ? "done" : watched ? "reviewing" : null, watched ? 1 : 0],
    );
    const sid = r.rows[0]!.id;
    sessionIds[`${course}${i}`] = sid;
    const speaker = text.split(":")[0]!;
    // Misma huella que al generar los apuntes de verdad: así no aparecen como «desactualizados».
    hashes[`${course}${i}`] = createHash("sha256").update(anonymizeSpeakers(text, [speaker])).digest("hex").slice(0, 32);
    await db.query(
      "insert into public.transcripts (user_id, session_id, source_format, content_text, word_count, speakers) values ($1, $2, 'vtt', $3, $4, $5)",
      [uid, sid, text, text.split(/\s+/).length, [speaker]],
    );
  }

  const notes: [key: string, course: string, kind: string, md: string][] = [
    ["bd0", "bd", "summary", `## Normalización\n\n- **Objetivo:** eliminar redundancias y evitar anomalías de inserción, borrado y actualización.\n- **1FN:** todos los atributos son atómicos.\n- **2FN:** 1FN y ningún atributo no clave depende de *parte* de la clave.\n- **3FN:** 2FN y sin dependencias transitivas.\n\n> Ejemplo: en \`Pedido(id, cliente, ciudad_cliente)\`, la ciudad depende del cliente y no del pedido → se separa en \`Cliente(cliente, ciudad)\`.`],
    ["bd0", "bd", "questions", `1. ¿Qué anomalías evita la normalización?\n2. ¿Cuándo está una tabla en 2FN pero no en 3FN?\n3. Normaliza \`Matrícula(alumno, asignatura, profesor, despacho_profesor)\` hasta 3FN.`],
    ["redes2", "redes", "summary", `## Control de flujo y de congestión en TCP\n\n- **Control de flujo:** la *ventana de recepción* evita saturar al receptor.\n- **Arranque lento:** la ventana se duplica cada RTT hasta el umbral.\n- **Evitación de congestión:** crecimiento lineal a partir del umbral.\n- **Retransmisión rápida:** al recibir 3 ACK duplicados.`],
  ];
  for (const [key, course, kind, md] of notes) {
    await db.query(
      "insert into public.study_notes (user_id, course_id, session_id, kind, content_md, provider, model, input_hash) values ($1, $2, $3, $4, $5, 'openai', 'gpt-6-luna', $6)",
      [uid, id[course], sessionIds[key], kind, md, hashes[key]],
    );
  }

  // Tarjetas: unas para repasar hoy, otras nuevas y otras ya aprendidas.
  const cards: [course: string, session: string | null, front: string, back: string, state: string, dueDays: number][] = [
    ["bd", "bd0", "¿Cuándo está una tabla en primera forma normal (1FN)?", "Cuando todos sus atributos son atómicos (sin grupos repetidos ni valores compuestos).", "review", 0],
    ["bd", "bd0", "¿Qué es una dependencia transitiva?", "Un atributo no clave que depende de otro atributo no clave, y no directamente de la clave.", "learning", 0],
    ["bd", "bd1", "¿Qué significan las siglas ACID?", "Atomicidad, consistencia, aislamiento (isolation) y durabilidad.", "new", 0],
    ["bd", "bd1", "¿Qué anomalía evita el nivel «read committed»?", "Las lecturas sucias: no se leen cambios de transacciones sin confirmar.", "new", 0],
    ["redes", "redes2", "¿Para qué sirve la ventana de recepción de TCP?", "Para el control de flujo: el emisor no envía más de lo que el receptor puede almacenar.", "review", 3],
    ["redes", "redes2", "¿Qué hace TCP al recibir tres ACK duplicados?", "Retransmisión rápida del segmento perdido, sin esperar al temporizador.", "review", 0],
    ["conc", "conc3", "¿Qué semáforos necesita el productor-consumidor?", "Uno de huecos libres, uno de elementos disponibles y un mutex para la sección crítica.", "new", 0],
    ["conc", "conc3", "¿Qué pasa si se invierte el orden de los wait en el productor-consumidor?", "Puede producirse un interbloqueo.", "new", 0],
    ["est", "est4", "¿Qué modela la distribución de Poisson?", "El número de sucesos raros en un intervalo de tiempo o espacio.", "review", 5],
    ["est", "est4", "¿Qué dice el teorema central del límite?", "La media de muchas variables aleatorias independientes tiende a una distribución normal.", "learning", 0],
  ];
  for (const [course, session, front, back, state, dueDays] of cards) {
    const reviewed = state !== "new";
    await db.query(
      `insert into public.flashcards (user_id, course_id, session_id, front, back, source_label, state, due_at, interval_days, reps, last_reviewed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [uid, id[course], session ? sessionIds[session] : null, front, back,
        session ? sessions[Number(session.replace(/\D/g, ""))]![1] : null, state,
        at(dueDays, 8, 0), state === "review" ? 4 : 0, reviewed ? 2 : 0, reviewed ? at(-2, 20, 0) : null],
    );
  }

  // Clases del horario sin importar: se dejan solo la más reciente (para ver el aviso) y el resto
  // se marcan como «no hubo clase», para que la portada de la demo no se llene de avisos.
  const slots = COURSES.flatMap((c) => c.schedule.map(([weekday, start, end]) => ({ course_id: id[c.key]!, weekday, start_time: start, end_time: end, ends_on: null })));
  const { rows: done } = await db.query<{ course_id: string; session_at: string }>("select course_id, session_at::text as session_at from public.class_sessions where user_id = $1", [uid]);
  const missing = findMissingClasses(pastOccurrences(slots, new Date(now)), done.map((r) => ({ ...r, session_at: new Date(r.session_at).toISOString() })), []);
  for (const o of missing.slice(0, -1)) {
    await db.query("insert into public.class_skips (user_id, course_id, class_date) values ($1, $2, $3) on conflict do nothing", [uid, o.course_id, o.date]);
  }

  await db.query(
    "insert into public.exams (user_id, course_id, title, exam_at, session_ids) values ($1, $2, 'Primer parcial', $3, $4)",
    [uid, id.bd, at(12).slice(0, 10), JSON.stringify([sessionIds.bd0, sessionIds.bd1])],
  );

  await db.query(
    "insert into public.sync_runs (user_id, provider, resource, status, started_at, finished_at, stats) values ($1, 'canvas', 'content', 'success', $2, $2, '{}')",
    [uid, new Date(now - 25 * 60_000).toISOString()],
  );
}
