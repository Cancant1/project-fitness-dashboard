// health-ingest: the iOS Shortcut posts last night's sleep plus the latest resting HR and HRV here every morning.
//
//   POST /functions/v1/health-ingest
//   header  x-ingest-token: <token from the app's Apple Watch page>
//   body    { date?, sleep?: [{stage, start, end}], sleep_text?: "stage;start;end\n…", resting_hr?, hrv_sdnn_ms? }
//
// Deployed with --no-verify-jwt: the ingest token is the auth. Its SHA-256 hash is looked up in ingest_tokens with the
// service role, and the result is written to that user's health_daily row for the morning the night ended.
// Parsing lives in parse.ts (pure, unit-tested from the app: src/lib/healthIngest.test.ts).

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { buildIngest, sha256Hex } from "./parse.ts";

const MAX_BODY_BYTES = 256 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Use POST." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { ok: false, error: "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- auth: the token's hash must exist and not be revoked
  const token = (req.headers.get("x-ingest-token") ?? "").trim();
  if (!token) return json(401, { ok: false, error: "Missing x-ingest-token header." });
  const hash = await sha256Hex(token);
  const { data: tok, error: tokError } = await db
    .from("ingest_tokens").select("id, user_id, revoked_at").eq("token_hash", hash).maybeSingle();
  if (tokError) return json(500, { ok: false, error: "Token lookup failed." });
  if (!tok || tok.revoked_at) return json(401, { ok: false, error: "Unknown or revoked token. Make a new one on the app's Apple Watch page." });

  // ---- body: JSON, or plain sleep lines when the Shortcut sent text
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "Body too large." });
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  const ingest = buildIngest(body);
  const { date, patch, sleep, warnings } = ingest;
  if (Object.keys(patch).length === 0) {
    return json(422, { ok: false, error: "Nothing to save: no sleep, resting_hr or hrv_sdnn_ms found.", date, warnings });
  }

  // ---- upsert health_daily (user, date). The unique index is partial (deleted_at is null), so no onConflict:
  // update the live row by id, or insert a new one; on an insert race, retry as an update.
  const userId = tok.user_id as string;
  const save = async (): Promise<{ error: { code?: string; message: string } | null; created: boolean }> => {
    const { data: existing, error: selError } = await db
      .from("health_daily").select("id, updated_at").eq("user_id", userId).eq("date", date).is("deleted_at", null).maybeSingle();
    if (selError) return { error: selError, created: false };
    // updated_at must be newer than the stored one, or the keep_newest trigger skips the write.
    const prev = existing?.updated_at ? Date.parse(existing.updated_at as string) : 0;
    const stamp = new Date(Math.max(Date.now(), prev + 1)).toISOString();
    if (existing) {
      const { error } = await db.from("health_daily")
        .update({ ...patch, source: "ios-shortcut", updated_at: stamp }).eq("id", existing.id);
      return { error, created: false };
    }
    const { error } = await db.from("health_daily")
      .insert({ user_id: userId, date, ...patch, source: "ios-shortcut", created_at: stamp, updated_at: stamp });
    return { error, created: true };
  };

  let result = await save();
  if (result.error?.code === "23505") result = await save();
  if (result.error) return json(500, { ok: false, error: `Saving failed: ${result.error.message}`, date });

  await db.from("ingest_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id);

  return json(200, {
    ok: true,
    date,
    created: result.created,
    sleep_total_min: patch.sleep_total_min ?? null,
    sleep_deep_min: patch.sleep_deep_min ?? null,
    sleep_rem_min: patch.sleep_rem_min ?? null,
    sleep_core_min: patch.sleep_core_min ?? null,
    sleep_awake_min: patch.sleep_awake_min ?? null,
    resting_hr: patch.resting_hr ?? null,
    hrv_sdnn_ms: patch.hrv_sdnn_ms ?? null,
    night: sleep ? { start: sleep.start, end: sleep.end, samples: sleep.used, left_out: sleep.left_out } : null,
    warnings
  });
});
