import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/** Simula Supabase (auth.users, roles y RLS) y aplica todas las migraciones, incluida la 0018. */
const OWNER = "11111111-1111-4111-8111-111111111111";
const FRIEND = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

async function as(uid: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    await tx.exec("set local role authenticated");
    return tx.query(sql, params);
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon; create role authenticated; create role service_role;
    grant usage on schema auth to authenticated;
  `);
  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) {
    if (f.startsWith("0018")) {
      await db.query("insert into auth.users (id, email) values ($1, 'Admin@Ejemplo.com'), ($2, 'amiga@uem.es')", [OWNER, FRIEND]);
    }
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    // Primer administrador, como indica el README (paso manual tras crear el usuario).
    if (f.startsWith("0018")) await db.exec("insert into public.app_admins (user_id) select id from auth.users where lower(email) = lower('admin@ejemplo.com') on conflict (user_id) do nothing;");
  }
  await db.exec("grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;");
}, 120_000);

const insertCourse = (uid: string, ext: number) =>
  as(uid, "insert into public.courses (user_id, external_id, name, category) values ($1, $2, 'Curso', 'current')", [uid, ext]);

describe("0018 · copia en la web solo para cuentas autorizadas", () => {
  it("el dueño es admin y puede guardar datos", async () => {
    const r = await as(OWNER, "select * from public.my_cloud_access()");
    expect(r.rows[0]).toEqual({ is_admin: true, cloud_enabled: true });
    await insertCourse(OWNER, 1);
    const c = await as(OWNER, "select count(*)::int as n from public.courses");
    expect(c.rows[0]).toEqual({ n: 1 });
  });

  it("otra cuenta no puede escribir ni leer nada en Supabase", async () => {
    await expect(insertCourse(FRIEND, 2)).rejects.toThrow(/row-level security/);
    await expect(as(FRIEND, "select * from public.admin_list_users()")).rejects.toThrow(/solo administradores/);
    await expect(as(FRIEND, `select public.admin_set_cloud_access('${FRIEND}', true)`)).rejects.toThrow(/solo administradores/);
    const p = await as(FRIEND, "select count(*)::int as n from public.profiles");
    expect(p.rows[0]).toEqual({ n: 0 });
  });

  it("el admin la activa y desactiva", async () => {
    const list = await as(OWNER, "select email, is_admin, cloud_enabled from public.admin_list_users()");
    expect(list.rows).toHaveLength(2);
    await as(OWNER, `select public.admin_set_cloud_access('${FRIEND}', true)`);
    await insertCourse(FRIEND, 3);
    await as(OWNER, `select public.admin_set_cloud_access('${FRIEND}', false)`);
    await expect(insertCourse(FRIEND, 4)).rejects.toThrow(/row-level security/);
    // Nunca ve los datos del dueño.
    await as(OWNER, `select public.admin_set_cloud_access('${FRIEND}', true)`);
    const c = await as(FRIEND, "select count(*)::int as n from public.courses");
    expect(c.rows[0]).toEqual({ n: 1 });
  });

  it("se puede volver a aplicar sin errores", async () => {
    await db.exec(fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "0018_cloud_access.sql"), "utf8"));
  });

  it("0021 · prueba de IA: solo la activa un administrador y el gasto se suma de forma atómica", async () => {
    const m = "2026-12";
    await expect(as(FRIEND, `select public.admin_set_trial_access('${FRIEND}', true, 1.5)`)).rejects.toThrow(/solo administradores/);
    expect((await as(FRIEND, `select * from public.my_trial_usage('${m}')`)).rows[0]).toMatchObject({ enabled: false, requests: 0 });
    await as(OWNER, `select public.admin_set_trial_access('${FRIEND}', true, 1.5)`);
    // El servidor de la web (clave secreta) apunta consumo; un usuario normal no puede.
    await expect(as(FRIEND, `select public.trial_add_usage('${FRIEND}', '${m}', 100, 10, 0.5)`)).rejects.toThrow(/permission denied/);
    await db.exec(`set role service_role; select public.trial_add_usage('${FRIEND}', '${m}', 1000, 200, 0.0002); select public.trial_add_usage('${FRIEND}', '${m}', 1000, 200, 0.0002); reset role;`);
    const mine = (await as(FRIEND, `select * from public.my_trial_usage('${m}')`)).rows[0] as { enabled: boolean; limit_usd: string; requests: number; cost_usd: string };
    expect(mine.enabled).toBe(true);
    expect(Number(mine.limit_usd)).toBe(1.5);
    expect(mine.requests).toBe(2);
    expect(Number(mine.cost_usd)).toBeCloseTo(0.0004, 6);
    const all = (await as(OWNER, `select * from public.admin_trial_usage('${m}')`)).rows as { user_id: string; requests: number }[];
    expect(all.find((r) => r.user_id === FRIEND)?.requests).toBe(2);
    // Sin políticas: nadie lee la tabla directamente.
    expect((await as(FRIEND, "select count(*)::int as n from public.ai_trial_usage")).rows[0]).toEqual({ n: 0 });
  });
});
