// Weekly check-in: pulls Mario's rows from Supabase (read-only), runs the coach's weeklyReport() and writes
// the report for Claude and Mario to go through. Run from the app folder:
//   npx tsx scripts/checkin.ts [--week N] [--today YYYY-MM-DD] [--out ../docs/checkins] [--user <uuid>]
// Keys come from ../.env.local (VITE_SUPABASE_URL, SUPABASE_SECRET_KEY) and are never printed.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  coachData, currentWeekNo, lastCompleteWeekNo, weeklyReport, EVIDENCE,
  type CoachTables, type Signal, type WeeklyReport
} from "../src/coach/index";

const MARIO = "4ba0a5a6-0012-4569-adc9-82d440f07987";
const TABLES = [
  "programs", "sessions", "sets", "exercises", "training_maxes", "body_measurements", "food_entries",
  "nutrition_days", "nutrition_targets", "pain_checks", "conditioning", "health_daily", "profiles"
] as const;

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const today = args.today ?? localIso(new Date());
const outDir = resolve(here, "..", args.out ?? "../docs/checkins");

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1]?.startsWith("--") ? "true" : argv[++i];
  }
  return out;
}

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const text = readFileSync(resolve(here, "..", "..", ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return env;
}

async function pull(): Promise<CoachTables> {
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = args.user ?? MARIO;
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").eq("user_id", user).is("deleted_at", null)
        .order("id", { ascending: true }).range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tables[t] = rows;
  }
  return tables as unknown as CoachTables;
}

const STATUS: Record<Signal["status"], string> = { act: "ACT", watch: "WATCH", good: "good", info: "info", pending: "pending" };
const AREA_NAME: Record<Signal["area"], string> = {
  consistency: "Consistency", strength: "Strength", muscle: "Muscle", body: "Body", fuel: "Fuel",
  joints: "Joints", recovery: "Recovery", conditioning: "Conditioning"
};
const VERDICT: Record<WeeklyReport["verdict"], string> = { on_track: "On track", watch: "Watch", adjust: "Adjust", too_early: "Too early" };

function signalLine(s: Signal): string {
  const metric = s.metric ? ` _(${s.metric.label}: ${s.metric.value}${s.metric.target ? ` / ${s.metric.target}` : ""})_` : "";
  const action = s.action ? ` → **action:** \`${JSON.stringify(s.action)}\`` : "";
  const applied = s.applied ? ` (applied ${s.applied.created.slice(0, 10)})` : "";
  return `- **[${STATUS[s.status]}] ${s.title}.** ${s.message}${metric}${action}${applied} — why: ${s.why.join(", ") || "–"}`;
}

function render(r: WeeklyReport): string {
  const n = r.numbers;
  const fmt = (v: number | null | undefined, d = 1) => (v == null ? "–" : v.toFixed(d));
  const lines: string[] = [];
  lines.push(`# Check-in · ${r.label} (${r.weekType}) · ${r.from} → ${r.to}`, "");
  lines.push(`**Verdict: ${VERDICT[r.verdict]}.** ${r.headline}`, "");
  lines.push(`_Generated ${today} by scripts/checkin.ts from live data. ${r.complete ? "Week complete." : "Week still running."}_`, "");

  lines.push("## Actions", "");
  lines.push(...(r.actions.length ? r.actions.map(signalLine) : ["- None."]), "");

  lines.push("## Numbers", "");
  lines.push(`| | |`, `|---|---|`);
  lines.push(`| Sessions | ${n.sessions.done} / ${n.sessions.planned} |`);
  lines.push(`| Working sets | ${n.workingSets.done} / ${n.workingSets.planned} |`);
  for (const [lift, t] of Object.entries(n.trainingMax)) {
    if (!t) continue;
    lines.push(`| ${lift} TM | ${fmt(t.tm)} (plan line ${fmt(t.line)}${t.provisional ? ", provisional" : ""}) |`);
  }
  for (const ro of n.repOuts) {
    lines.push(`| Rep-out ${ro.lift} ${ro.date} | ${ro.load} × ${ro.reps}${ro.target != null ? ` (target ${ro.target})` : ""}${ro.tmTo != null ? `, TM ${fmt(ro.tmFrom)} → ${fmt(ro.tmTo)}` : ""}${ro.nextLoad != null ? `, next ${ro.nextLoad}` : ""} |`);
  }
  for (const [lift, load] of Object.entries(n.stepLoads)) lines.push(`| ${lift} next load | ${load} |`);
  const bw = n.bodyweight;
  lines.push(`| Bodyweight 7-day | ${fmt(bw.avg7d)} kg${bw.band ? ` (plan ${bw.band[0].toFixed(1)}–${bw.band[1].toFixed(1)})` : ""}, ${bw.weighIns} weigh-ins |`);
  if (bw.rate != null) lines.push(`| Rate (28-day fit) | ${bw.rate.toFixed(2)} kg/wk ± ${fmt(bw.rateSe, 2)} (n=${bw.rateN}) |`);
  lines.push(`| Waist | ${fmt(n.waist.latestCm)} cm${n.waist.cmPerMonth != null ? `, ${n.waist.cmPerMonth.toFixed(1)} cm/month` : ""} |`);
  const f = n.food;
  lines.push(`| Food logged | ${f.daysLogged} days |`);
  lines.push(`| Energy | ${fmt(f.avgKcal, 0)} kcal avg / target ${fmt(f.targetKcal, 0)}${f.tdee != null ? ` · measured maintenance ≈${f.tdee.toFixed(0)}` : ""} |`);
  lines.push(`| Protein | ${fmt(f.avgProtein, 0)} g avg / target ${fmt(f.targetProtein, 0)} (${fmt(f.proteinPerKg, 2)} g/kg) |`);
  lines.push(`| Sleep | ${fmt(n.sleep.avgHours)} h over ${n.sleep.nights} nights |`);
  lines.push(`| Session energy | ${fmt(n.energy.avg)} (prev ${fmt(n.energy.prevAvg)}), ${n.energy.rated} rated |`);
  lines.push(`| Pain | ${n.pain.length ? n.pain.map((p) => `${p.site}: ${p.sessions} sessions${p.sharp ? `, ${p.sharp} sharp` : ""}`).join("; ") : "none logged"} |`);
  const c = n.conditioning;
  lines.push(`| Conditioning | ride ${c.rideMin}${c.rideTarget != null ? `/${c.rideTarget}` : ""} min · boxing ${c.boxing ? "yes" : "no"} · rounds ${c.rounds ?? "–"}${c.roundsNext != null ? ` (next ${c.roundsNext})` : ""} |`);
  lines.push("");
  if (n.muscles.length) {
    lines.push("### Fractional sets per muscle", "", "| Muscle | Sets | Plan | Good weeks | % of good |", "|---|---|---|---|---|");
    for (const m of n.muscles) lines.push(`| ${m.muscle} | ${m.sets.toFixed(1)} | ${m.plan} | ${m.good} | ${Math.round(m.pctOfGood * 100)}% |`);
    lines.push("");
  }

  lines.push("## All signals", "");
  let area = "";
  for (const s of r.signals) {
    if (s.area !== area) { area = s.area; lines.push("", `### ${AREA_NAME[s.area]}`); }
    lines.push(signalLine(s));
  }
  lines.push("", "## Evidence behind this week's signals", "");
  const ids = [...new Set(r.signals.flatMap((s) => s.why))].sort();
  for (const id of ids) {
    const e = (EVIDENCE as Record<string, { summary?: string } | string | undefined>)[id];
    const text = typeof e === "string" ? e : e?.summary ?? "";
    lines.push(`- **${id}**: ${text}`);
  }
  lines.push("", "## Discussion", "", "_Added during the check-in: Mario's notes, decisions, follow-ups._", "");
  return lines.join("\n");
}

async function main() {
  const tables = await pull();
  const data = coachData(tables);
  if (!data.program) {
    console.log("No active programme row: the plan hasn't been started in the app.");
  }
  const weekNo = args.week != null ? Number(args.week) : (lastCompleteWeekNo(data, today) ?? currentWeekNo(data, today));
  if (weekNo == null) throw new Error(`No plan week for ${today}`);
  const report = weeklyReport(data, weekNo, today);

  mkdirSync(join(outDir, "data"), { recursive: true });
  const name = `${report.to}-week-${report.weekNo}`;
  writeFileSync(join(outDir, `${name}.md`), render(report), "utf8");
  // Snapshot of the plan-era rows only (history stays in Supabase); sets follow their sessions.
  const planSessionIds = new Set(tables.sessions.filter((s) => s.date >= data.start).map((s) => s.id));
  const planRows = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t,
    (rows as { date?: string; effective_date?: string; effective_from?: string; session_id?: string }[]).filter((r) => {
      if (t === "sets") return planSessionIds.has(r.session_id ?? "");
      const d = r.date ?? r.effective_date ?? r.effective_from;
      return t === "programs" || t === "exercises" || t === "profiles" || !d || d >= data.start;
    })]));
  writeFileSync(join(outDir, "data", `${name}.json`), JSON.stringify({ generated: today, report, rows: planRows }, null, 1), "utf8");

  console.log(`${report.label} (${report.weekType}) ${report.from} → ${report.to}: ${VERDICT[report.verdict]}. ${report.headline}`);
  for (const s of report.actions) console.log(`  [${STATUS[s.status]}] ${s.title}: ${s.message}`);
  console.log(`Wrote ${join(outDir, `${name}.md`)}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
