/**
 * Constructor de consultas compatible con la parte de supabase-js que usa UniHub
 * (`from().select/insert/upsert/update/delete` + filtros), traducido a SQL para la base de
 * datos local. Así el resto de la app funciona igual en la web (Supabase) y en el programa
 * de escritorio (Postgres local) sin cambiar ninguna consulta.
 *
 * Todos los nombres de tabla y columna se validan; los valores van siempre como parámetros.
 */

export interface Runner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
}

export interface LocalError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

export interface LocalResult<T = unknown> {
  data: T | null;
  error: LocalError | null;
  count: number | null;
  status: number;
  statusText: string;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  const n = name.trim();
  if (!IDENT.test(n)) throw new LocalQueryError(`Nombre no válido: ${name}`, "42602");
  return `"${n}"`;
}

class LocalQueryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Tipos de columna por tabla (para serializar jsonb correctamente). */
export class SchemaCache {
  private tables = new Map<string, Map<string, string>>();
  constructor(private runner: Runner) {}

  async columns(table: string): Promise<Map<string, string>> {
    let cols = this.tables.get(table);
    if (!cols) {
      const { rows } = await this.runner.query<{ column_name: string; udt_name: string }>(
        "select column_name, udt_name from information_schema.columns where table_schema = 'public' and table_name = $1",
        [table],
      );
      if (rows.length === 0) throw new LocalQueryError(`La tabla ${table} no existe`, "42P01");
      cols = new Map(rows.map((r) => [r.column_name, r.udt_name]));
      this.tables.set(table, cols);
    }
    return cols;
  }
}

type Op = "=" | "<>" | ">" | ">=" | "<" | "<=";
type Cond =
  | { kind: "cmp"; col: string; op: Op; value: unknown }
  | { kind: "in"; col: string; values: unknown[]; negate: boolean }
  | { kind: "is"; col: string; value: null | boolean; negate: boolean }
  | { kind: "like"; col: string; pattern: string; ci: boolean; negate: boolean }
  | { kind: "or"; conds: Cond[] };

const PGRST_OPS: Record<string, Op> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

/** "(a,b,"c d")" → ["a","b","c d"] (sintaxis de listas de PostgREST). */
function parseList(raw: string): string[] {
  const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
  if (!inner) return [];
  return inner.split(",").map((s) => s.trim().replace(/^"(.*)"$/, "$1"));
}

function parseIsValue(v: string): null | boolean {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new LocalQueryError(`Valor no admitido para is: ${v}`, "22023");
}

/** Una condición en sintaxis PostgREST: "col.op.valor". */
function parseCond(expr: string): Cond {
  const m = expr.match(/^([a-z_][a-z0-9_]*)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.([\s\S]*)$/);
  if (!m) throw new LocalQueryError(`Filtro no admitido: ${expr}`, "PGRST100");
  const [, col, not, op, value] = m as unknown as [string, string, string | undefined, string, string];
  const negate = !!not;
  if (op === "is") return { kind: "is", col, value: parseIsValue(value), negate };
  if (op === "in") return { kind: "in", col, values: parseList(value), negate };
  if (op === "like" || op === "ilike") return { kind: "like", col, pattern: value.replace(/\*/g, "%"), ci: op === "ilike", negate };
  if (negate) throw new LocalQueryError(`Filtro no admitido: ${expr}`, "PGRST100");
  return { kind: "cmp", col, op: PGRST_OPS[op]!, value };
}

/** "a.eq.1,b.ilike.%x%" → condiciones (las comas solo separan donde empieza "col.op."). */
export function parseOr(expr: string): Cond[] {
  return expr
    .split(/,(?=[a-z_][a-z0-9_]*\.(?:not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.)/)
    .map((p) => parseCond(p.trim()));
}

class Params {
  values: unknown[] = [];
  add(v: unknown, cast?: string): string {
    this.values.push(v);
    return `$${this.values.length}${cast ? `::${cast}` : ""}`;
  }
}

function condSql(c: Cond, p: Params): string {
  switch (c.kind) {
    case "cmp":
      return `${ident(c.col)} ${c.op} ${p.add(c.value)}`;
    case "in": {
      // Comparación como texto: vale igual para uuid, bigint o text y evita problemas de tipos.
      const sql = `${ident(c.col)}::text = any(${p.add(c.values.map(String), "text[]")})`;
      return c.negate ? `not (${sql})` : sql;
    }
    case "is": {
      const v = c.value === null ? "null" : c.value ? "true" : "false";
      return `${ident(c.col)} is ${c.negate ? "not " : ""}${v}`;
    }
    case "like":
      return `${ident(c.col)} ${c.negate ? "not " : ""}${c.ci ? "ilike" : "like"} ${p.add(c.pattern)}`;
    case "or":
      return c.conds.length ? `(${c.conds.map((x) => condSql(x, p)).join(" or ")})` : "false";
  }
}

function parseColumns(cols: string): string {
  const c = cols.trim();
  if (c === "" || c === "*") return "*";
  return c
    .split(",")
    .map((s) => ident(s))
    .join(", ");
}

type Action = "select" | "insert" | "upsert" | "update" | "delete";
type Row = Record<string, unknown>;

export class LocalQuery<T = unknown> implements PromiseLike<LocalResult<T>> {
  private action: Action = "select";
  private columns = "*";
  private countMode: "exact" | null = null;
  private head = false;
  private returning: string | null = null;
  private rows: Row[] = [];
  private patch: Row = {};
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private conds: Cond[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private singleMode: "one" | "maybe" | null = null;

  constructor(
    private runner: Runner,
    private schema: SchemaCache,
    private table: string,
  ) {}

  // ---- acciones ----
  select(columns = "*", opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    if (this.action === "select") {
      this.columns = columns;
      this.countMode = opts?.count ? "exact" : null;
      this.head = !!opts?.head;
    } else {
      this.returning = columns;
    }
    return this;
  }
  insert(values: Row | Row[]): this {
    this.action = "insert";
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.action = "upsert";
    this.rows = Array.isArray(values) ? values : [values];
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  update(values: Row): this {
    this.action = "update";
    this.patch = values;
    return this;
  }
  delete(opts?: { count?: "exact" | "planned" | "estimated" }): this {
    this.action = "delete";
    this.countMode = opts?.count ? "exact" : null;
    return this;
  }

  // ---- filtros ----
  eq(col: string, value: unknown): this {
    if (value === null) return this.is(col, null);
    this.conds.push({ kind: "cmp", col, op: "=", value });
    return this;
  }
  neq(col: string, value: unknown): this {
    this.conds.push({ kind: "cmp", col, op: "<>", value });
    return this;
  }
  gt(col: string, value: unknown): this {
    this.conds.push({ kind: "cmp", col, op: ">", value });
    return this;
  }
  gte(col: string, value: unknown): this {
    this.conds.push({ kind: "cmp", col, op: ">=", value });
    return this;
  }
  lt(col: string, value: unknown): this {
    this.conds.push({ kind: "cmp", col, op: "<", value });
    return this;
  }
  lte(col: string, value: unknown): this {
    this.conds.push({ kind: "cmp", col, op: "<=", value });
    return this;
  }
  in(col: string, values: readonly unknown[]): this {
    this.conds.push({ kind: "in", col, values: [...values], negate: false });
    return this;
  }
  is(col: string, value: null | boolean): this {
    this.conds.push({ kind: "is", col, value, negate: false });
    return this;
  }
  like(col: string, pattern: string): this {
    this.conds.push({ kind: "like", col, pattern, ci: false, negate: false });
    return this;
  }
  ilike(col: string, pattern: string): this {
    this.conds.push({ kind: "like", col, pattern, ci: true, negate: false });
    return this;
  }
  not(col: string, op: string, value: unknown): this {
    if (op === "is") this.conds.push({ kind: "is", col, value: value as null | boolean, negate: true });
    else if (op === "in") this.conds.push({ kind: "in", col, values: Array.isArray(value) ? value : parseList(String(value)), negate: true });
    else if (op === "like" || op === "ilike") this.conds.push({ kind: "like", col, pattern: String(value), ci: op === "ilike", negate: true });
    else if (op === "eq") this.conds.push({ kind: "cmp", col, op: "<>", value });
    else throw new LocalQueryError(`not.${op} no admitido`, "PGRST100");
    return this;
  }
  or(expr: string): this {
    this.conds.push({ kind: "or", conds: parseOr(expr) });
    return this;
  }
  match(obj: Row): this {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  filter(col: string, op: string, value: unknown): this {
    if (op in PGRST_OPS) {
      this.conds.push({ kind: "cmp", col, op: PGRST_OPS[op]!, value });
      return this;
    }
    return this.not(col, op.replace(/^not\./, ""), value);
  }

  // ---- orden y límites ----
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const asc = opts?.ascending ?? true;
    const nulls = opts?.nullsFirst === undefined ? "" : opts.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${ident(col)} ${asc ? "asc" : "desc"}${nulls}`);
    return this;
  }
  limit(n: number): this {
    this.limitN = Math.max(0, Math.floor(n));
    return this;
  }
  range(from: number, to: number): this {
    this.offsetN = Math.max(0, Math.floor(from));
    this.limitN = Math.max(0, Math.floor(to) - this.offsetN + 1);
    return this;
  }
  single(): this {
    this.singleMode = "one";
    return this;
  }
  maybeSingle(): this {
    this.singleMode = "maybe";
    return this;
  }

  then<R1 = LocalResult<T>, R2 = never>(onfulfilled?: ((v: LocalResult<T>) => R1 | PromiseLike<R1>) | null, onrejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // ---- ejecución ----
  private where(p: Params): string {
    return this.conds.length ? ` where ${this.conds.map((c) => condSql(c, p)).join(" and ")}` : "";
  }

  private async value(col: string, v: unknown, p: Params): Promise<string> {
    const type = (await this.schema.columns(this.table)).get(col);
    if (type === undefined) throw new LocalQueryError(`La columna ${col} no existe en ${this.table}`, "42703");
    if (type === "jsonb" || type === "json") return p.add(v === null || v === undefined ? null : JSON.stringify(v), type);
    return p.add(v === undefined ? null : v);
  }

  private returningSql(): string {
    return this.returning === null ? "" : ` returning ${parseColumns(this.returning)}`;
  }

  private async execute(): Promise<LocalResult<T>> {
    try {
      const t = `public.${ident(this.table)}`;
      const p = new Params();
      let sql: string;
      switch (this.action) {
        case "select": {
          if (this.head && this.countMode) {
            const { rows } = await this.runner.query<{ n: number }>(`select count(*)::int as n from ${t}${this.where(p)}`, p.values);
            return ok(null, rows[0]?.n ?? 0);
          }
          sql = `select ${parseColumns(this.columns)} from ${t}${this.where(p)}`;
          if (this.orders.length) sql += ` order by ${this.orders.join(", ")}`;
          const lim = this.singleMode ? 2 : this.limitN;
          if (lim !== null) sql += ` limit ${lim}`;
          if (this.offsetN) sql += ` offset ${this.offsetN}`;
          const { rows } = await this.runner.query(sql, p.values);
          let count: number | null = null;
          if (this.countMode) {
            const cp = new Params();
            count = (await this.runner.query<{ n: number }>(`select count(*)::int as n from ${t}${this.where(cp)}`, cp.values)).rows[0]?.n ?? 0;
          }
          return this.finish(rows, count);
        }
        case "insert":
        case "upsert": {
          if (this.rows.length === 0) return ok(this.returning === null ? null : [], null);
          const cols = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
          const tuples: string[] = [];
          for (const r of this.rows) {
            const vals: string[] = [];
            for (const c of cols) vals.push(c in r ? await this.value(c, r[c], p) : "default");
            tuples.push(`(${vals.join(", ")})`);
          }
          sql = `insert into ${t} (${cols.map(ident).join(", ")}) values ${tuples.join(", ")}`;
          if (this.action === "upsert") {
            const target = (this.onConflict ?? "id").split(",").map((c) => ident(c));
            const targetNames = new Set((this.onConflict ?? "id").split(",").map((c) => c.trim()));
            const updatable = cols.filter((c) => !targetNames.has(c));
            sql += ` on conflict (${target.join(", ")}) `;
            sql += this.ignoreDuplicates || updatable.length === 0 ? "do nothing" : `do update set ${updatable.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
          }
          sql += this.returningSql();
          const res = await this.runner.query(sql, p.values);
          return this.finish(this.returning === null ? null : res.rows, null);
        }
        case "update": {
          const sets: string[] = [];
          for (const [c, v] of Object.entries(this.patch)) if (v !== undefined) sets.push(`${ident(c)} = ${await this.value(c, v, p)}`);
          if (sets.length === 0) return ok(this.returning === null ? null : [], null);
          sql = `update ${t} set ${sets.join(", ")}${this.where(p)}${this.returningSql()}`;
          const res = await this.runner.query(sql, p.values);
          return this.finish(this.returning === null ? null : res.rows, null);
        }
        case "delete": {
          sql = `delete from ${t}${this.where(p)}${this.returningSql()}`;
          const res = await this.runner.query(sql, p.values);
          return this.finish(this.returning === null ? null : res.rows, this.countMode ? (res.affectedRows ?? 0) : null);
        }
      }
    } catch (err) {
      const e = err as { message?: string; code?: string; detail?: string; hint?: string };
      return {
        data: null,
        error: { message: e.message ?? "Error en la base de datos local", code: e.code ?? "LOCAL", details: e.detail ?? null, hint: e.hint ?? null },
        count: null,
        status: 400,
        statusText: "Bad Request",
      };
    }
  }

  private finish(rows: unknown[] | null, count: number | null): LocalResult<T> {
    if (this.singleMode && rows) {
      if (rows.length > 1) return fail("Se esperaba una sola fila", "PGRST116");
      if (rows.length === 0) return this.singleMode === "maybe" ? ok(null, count) : fail("No hay filas", "PGRST116");
      return ok<T>(rows[0], count);
    }
    return ok<T>(rows, count);
  }
}

// Los datos llegan de la base de datos sin tipo: el tipo lo pone quien consulta (como en supabase-js).
function ok<T>(data: unknown, count: number | null): LocalResult<T> {
  return { data: data as T, error: null, count, status: 200, statusText: "OK" };
}

function fail<T>(message: string, code: string): LocalResult<T> {
  return { data: null, error: { message, code, details: null, hint: null }, count: null, status: 406, statusText: "Not Acceptable" };
}

/** Cliente de datos local: misma forma que `supabase.from()` / `supabase.rpc()`. */
export function createLocalDataClient(runner: Runner) {
  const schema = new SchemaCache(runner);
  return {
    from(table: string) {
      if (!IDENT.test(table)) throw new LocalQueryError(`Tabla no válida: ${table}`, "42602");
      return new LocalQuery(runner, schema, table);
    },
    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<LocalResult<unknown>> {
      try {
        if (!IDENT.test(fn)) throw new LocalQueryError(`Función no válida: ${fn}`, "42602");
        const p = new Params();
        const named = Object.entries(args).map(([k, v]) => `${ident(k)} => ${p.add(v)}`);
        // Como Supabase: las funciones que devuelven filas (setof / table) dan una lista.
        const set = await runner.query<{ s: boolean }>(
          "select bool_or(p.proretset) as s from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1",
          [fn],
        );
        if (set.rows[0]?.s) {
          const { rows } = await runner.query(`select * from public.${ident(fn)}(${named.join(", ")})`, p.values);
          return ok(rows, null);
        }
        const { rows } = await runner.query<{ r: unknown }>(`select public.${ident(fn)}(${named.join(", ")}) as r`, p.values);
        return ok(rows[0]?.r ?? null, null);
      } catch (err) {
        const e = err as { message?: string; code?: string };
        return { data: null, error: { message: e.message ?? "Error", code: e.code ?? "LOCAL", details: null, hint: null }, count: null, status: 400, statusText: "Bad Request" };
      }
    },
  };
}
