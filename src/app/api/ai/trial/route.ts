import { NextResponse, type NextRequest } from "next/server";
import { handleTrial, trialStatus, type TrialDeps } from "@/features/ai-trial/handler";
import { complete } from "@/integrations/ai/provider";
import { logger } from "@/lib/redact";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Prueba gratuita de IA (solo en la web). El programa de escritorio de quien no tiene clave
 * propia manda aquí sus peticiones con su sesión de UniHub; la web usa su clave con un límite
 * de gasto al mes por usuario. Solo se guarda el consumo, nunca el contenido.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const NO_STORE = { "Cache-Control": "no-store" };

function deps(): TrialDeps | null {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return {
    env: process.env,
    verifyUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    access: async (uid, m) => {
      const { data } = await admin.rpc("trial_access_for", { uid, m });
      const row = Array.isArray(data) ? data[0] : null;
      return { enabled: !!row?.enabled, limitUsd: row?.limit_usd == null ? null : Number(row.limit_usd), used: Number(row?.cost_usd ?? 0) };
    },
    addUsage: async (uid, m, tokensIn, tokensOut, cost) => {
      const { error } = await admin.rpc("trial_add_usage", { uid, m, tokens_in: tokensIn, tokens_out: tokensOut, cost });
      if (error) logger.error("trial_usage_failed", { code: error.code ?? null });
    },
    complete: (cfg, req) => complete(cfg, req, { timeoutMs: 110_000 }),
  };
}

const bearer = (req: NextRequest) => {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(h);
  return m ? m[1]! : null;
};

export async function GET(req: NextRequest) {
  const d = deps();
  if (!d) return NextResponse.json({ enabled: false }, { status: 503, headers: NO_STORE });
  const r = await trialStatus(bearer(req), d);
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const d = deps();
  if (!d) return NextResponse.json({ error: "La prueba gratuita no está activada.", kind: "trial_off" }, { status: 503, headers: NO_STORE });
  const body = await req.json().catch(() => null);
  const r = await handleTrial(bearer(req), body, d);
  if (r.status >= 500) logger.warn("trial_failed", { status: r.status, kind: String(r.body.kind ?? "") });
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
