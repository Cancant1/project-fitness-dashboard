// Pure parsing and aggregation for the `health-ingest` Edge Function. No imports, no I/O: runs in Deno (the function)
// and in Node (the app's vitest suite, src/lib/healthIngest.test.ts).
//
// Input: what the iOS Shortcut posts. Output: one `health_daily` patch for the morning the night ended (Europe/Amsterdam).

export const TZ = "Europe/Amsterdam";

export type Stage = "in_bed" | "asleep" | "awake" | "core" | "deep" | "rem";

export interface SleepSample {
  stage: Stage;
  /** Epoch milliseconds. */
  start: number;
  end: number;
}

export interface SleepSummary {
  /** Local (TZ) date of the latest sleep end: the morning the night ended. */
  date: string;
  /** core + deep + rem, or "Asleep" (unspecified) when the source has no stages. Null when only "In Bed" was sent. */
  total_min: number | null;
  deep_min: number | null;
  rem_min: number | null;
  core_min: number | null;
  awake_min: number | null;
  in_bed_min: number | null;
  /** ISO instants of the night that was used. */
  start: string;
  end: string;
  /** Samples in the night used / samples left out (an earlier nap or another night in the window). */
  used: number;
  left_out: number;
}

/** The columns of `health_daily` this request sets. Absent = leave the stored value alone. */
export interface HealthPatch {
  sleep_total_min?: number | null;
  sleep_deep_min?: number | null;
  sleep_rem_min?: number | null;
  sleep_core_min?: number | null;
  sleep_awake_min?: number | null;
  resting_hr?: number;
  hrv_sdnn_ms?: number;
}

export interface Ingest {
  date: string;
  patch: HealthPatch;
  sleep: SleepSummary | null;
  resting_hr: number | null;
  hrv_sdnn_ms: number | null;
  warnings: string[];
}

// ------------------------------------------------------------------ stage names

const STAGE_KEYS: Record<string, Stage> = {
  // HealthKit raw names and values (HKCategoryValueSleepAnalysis…: 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 rem)
  inbed: "in_bed", "0": "in_bed",
  asleep: "asleep", asleepunspecified: "asleep", unspecified: "asleep", "1": "asleep",
  awake: "awake", "2": "awake",
  core: "core", asleepcore: "core", "3": "core",
  deep: "deep", asleepdeep: "deep", "4": "deep",
  rem: "rem", asleeprem: "rem", "5": "rem",
  // English wording seen in Health / Shortcuts
  sleep: "asleep", sleeping: "asleep", light: "core", lightsleep: "core", coresleep: "core", deepsleep: "deep", remsleep: "rem", wake: "awake",
  // Dutch (Gezondheid / Opdrachten)
  inbedtijd: "in_bed", slaap: "asleep", slapend: "asleep", geslapen: "asleep", inslaap: "asleep",
  wakker: "awake", kern: "core", kernslaap: "core", licht: "core", lichteslaap: "core",
  diep: "deep", diepeslaap: "deep", diepslaap: "deep", remslaap: "rem"
};

/** Maps an Apple sleep stage label (English, Dutch, HealthKit raw name or number) to a stage. Null if unknown. */
export function normaliseStage(raw: unknown): Stage | null {
  if (raw == null) return null;
  const key = String(raw)
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/hkcategoryvaluesleepanalysis/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  const exact = STAGE_KEYS[key];
  if (exact) return exact;
  // Lenient fallback for wordings like "Asleep (Core)" or "Slaap: diep". Order matters.
  if (/bed/.test(key)) return "in_bed";
  if (/awake|wakker/.test(key)) return "awake";
  if (/deep|diep/.test(key)) return "deep";
  if (/rem/.test(key)) return "rem";
  if (/core|kern/.test(key)) return "core";
  if (/asleep|slaap|sleep/.test(key)) return "asleep";
  return null;
}

// ------------------------------------------------------------------ time zones

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function wallParts(ms: number, tz: string) {
  const parts = dtf(tz).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

/** Offset of `tz` from UTC at instant `ms`, in milliseconds (Amsterdam: +1 h winter, +2 h summer). */
function tzOffset(ms: number, tz: string): number {
  const w = wallParts(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/** A wall-clock time in `tz` → epoch ms. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz = TZ): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = wall - tzOffset(wall, tz);
  const second = wall - tzOffset(first, tz);
  return second;
}

/** Epoch ms → "YYYY-MM-DD" in `tz`. */
export function localDate(ms: number, tz = TZ): string {
  const w = wallParts(ms, tz);
  return `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ dates from Shortcuts

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mrt: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12
};
const WEEKDAYS = new Set([
  "mon", "monday", "tue", "tues", "tuesday", "wed", "wednesday", "thu", "thur", "thurs", "thursday", "fri", "friday",
  "sat", "saturday", "sun", "sunday",
  "ma", "maa", "maandag", "di", "din", "dinsdag", "wo", "woe", "woensdag", "do", "don", "donderdag", "vr", "vrij", "vrijdag",
  "za", "zat", "zaterdag", "zo", "zon", "zondag"
]);

function monthOf(word: string): number | null {
  const w = word.replace(/\./g, "").toLowerCase();
  if (w === "maart") return 3;
  if (w.length < 3) return null;
  return MONTHS[w.slice(0, 3)] ?? null;
}

function offsetMs(text: string | undefined): number | null {
  if (!text) return null;
  if (/^z$/i.test(text)) return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(text);
  if (!m) return null;
  const v = (Number(m[2]) * 60 + Number(m[3])) * 60_000;
  return m[1] === "-" ? -v : v;
}

/** Clock part shared by the patterns: h, m, optional s, optional am/pm, optional zone name, optional offset (6 groups). */
const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([ap])\.?m\.?)?(?:\s*(gmt|utc|cet|cest))?(?:\s*(z|[+-]\d{2}:?\d{2}))?`;

/** Wall-clock (or offset) time → epoch ms; `c` = the 6 TIME groups. Null if a part is out of range. */
function build(y: number, mo: number, d: number, c: (string | undefined)[], tz: string): number | null {
  const [hS, miS, sS, ampm, zone, off] = c;
  let h = Number(hS);
  const mi = Number(miS), s = Math.min(Number(sS ?? 0), 59);
  if (ampm) {
    if (h < 1 || h > 12) return null;
    const pm = ampm === "p";
    h = h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const offset = off ? offsetMs(off) : zone === "gmt" || zone === "utc" ? 0 : null;
  if (off && offset == null) return null;
  return offset != null ? Date.UTC(y, mo - 1, d, h, mi, s) - offset : zonedToUtc(y, mo, d, h, mi, s, tz);
}

const RE_ISO = new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})(?:t|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(z|[+-]\d{2}:?\d{2})?$`);
const RE_DMY_NAME = new RegExp(String.raw`^(\d{1,2})\.?\s+([a-z.]+)\s+(\d{4})\s+${TIME}$`);
const RE_MDY_NAME = new RegExp(String.raw`^([a-z.]+)\s+(\d{1,2})\s+(\d{4})\s+${TIME}$`);
const RE_NUMERIC = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s+${TIME}$`);
const RE_YMD_SLASH = new RegExp(String.raw`^(\d{4})/(\d{1,2})/(\d{1,2})\s+${TIME}$`);

/**
 * A date-time as Shortcuts may write it → epoch ms. Lenient:
 *   ISO 8601 "2026-10-11T07:12:00+02:00" (recommended), "2026-10-11 07:12",
 *   "11 Oct 2026 at 07:12", "11 okt. 2026 om 07:12", "Oct 11, 2026 at 7:12 AM", "11-10-2026 07:12",
 *   RFC 2822 "Sun, 11 Oct 2026 07:12:00 +0200", epoch seconds or milliseconds.
 * Times without an offset are read as `tz` wall-clock time. Returns null when it can't tell.
 */
export function parseWhen(input: unknown, tz = TZ): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input > 0 ? (input < 1e12 ? input * 1000 : input) : null;
  if (typeof input !== "string") return null;
  let t = input
    .replace(/\s+/g, " ")  // \s includes the narrow no-break space iOS puts before AM/PM
    .trim().toLowerCase();
  if (!t) return null;
  if (/^\d{10}(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  if (/^\d{13}$/.test(t)) return Number(t);
  t = t.replace(/,/g, " ").replace(/\s+(at|om|à|um)\s+/g, " ").replace(/\s+/g, " ").trim();
  // A leading weekday ("Sun, …", "zo 11 okt …").
  const first = /^([a-z]+)\.?\s+(?=\d)/.exec(t);
  if (first && WEEKDAYS.has(first[1]!)) t = t.slice(first[0].length);

  let m = RE_ISO.exec(t);
  if (m) return build(+m[1]!, +m[2]!, +m[3]!, [m[4], m[5], m[6], undefined, undefined, m[7]], tz);

  m = RE_DMY_NAME.exec(t);
  if (m) {
    const mo = monthOf(m[2]!);
    if (mo) return build(+m[3]!, mo, +m[1]!, m.slice(4, 10), tz);
  }
  m = RE_MDY_NAME.exec(t);
  if (m) {
    const mo = monthOf(m[1]!);
    if (mo) return build(+m[3]!, mo, +m[2]!, m.slice(4, 10), tz);
  }
  m = RE_YMD_SLASH.exec(t);
  if (m) return build(+m[1]!, +m[2]!, +m[3]!, m.slice(4, 10), tz);
  m = RE_NUMERIC.exec(t);
  if (m) {
    const a = +m[1]!, b = +m[2]!;
    // Day first (Dutch/European) unless that can't be, or the clock is 12-hour (US style) and the order is ambiguous.
    const monthFirst = a <= 12 && (b > 12 || !!m[7]);
    return build(+m[3]!, monthFirst ? a : b, monthFirst ? b : a, m.slice(4, 10), tz);
  }
  return null;
}

// ------------------------------------------------------------------ sleep text

/** `stage;start;end` per line (also tab or | separated). Returns the samples and a note per skipped line. */
export function parseSleepText(text: unknown, tz = TZ): { samples: SleepSample[]; skipped: string[] } {
  const samples: SleepSample[] = [];
  const skipped: string[] = [];
  const raw = Array.isArray(text) ? text.map((x) => String(x ?? "")).join("\n") : typeof text === "string" ? text : "";
  const lines = raw.split(/\r\n|\r|\n|\p{Zl}/u).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s*[;\t|]\s*/).filter((p) => p !== "");
    if (parts.length < 3) {
      skipped.push(`"${clip(line)}": expected stage;start;end`);
      continue;
    }
    const sample = toSample(parts[0], parts[1], parts[2], tz);
    if (typeof sample === "string") skipped.push(`"${clip(line)}": ${sample}`);
    else samples.push(sample);
  }
  return { samples, skipped };
}

function toSample(stageRaw: unknown, startRaw: unknown, endRaw: unknown, tz: string): SleepSample | string {
  const stage = normaliseStage(stageRaw);
  if (!stage) return `unknown stage "${clip(String(stageRaw ?? ""))}"`;
  const start = parseWhen(startRaw, tz);
  const end = parseWhen(endRaw, tz);
  if (start == null) return `can't read start "${clip(String(startRaw ?? ""))}"`;
  if (end == null) return `can't read end "${clip(String(endRaw ?? ""))}"`;
  if (end <= start) return "end is not after start";
  if (end - start > 24 * 3_600_000) return "longer than 24 hours";
  return { stage, start, end };
}

const clip = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);

// ------------------------------------------------------------------ aggregation

/** Gap that separates two sleeps (a nap and the night). Wake-ups inside one night are far shorter. */
const NIGHT_GAP_MS = 3 * 3_600_000;

/** Total length of the union of intervals (overlaps, e.g. Watch + iPhone, counted once). */
function unionMs(intervals: { start: number; end: number }[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0, curS = -Infinity, curE = -Infinity;
  for (const i of sorted) {
    if (i.start > curE) {
      if (curE > curS) total += curE - curS;
      curS = i.start;
      curE = i.end;
    } else if (i.end > curE) curE = i.end;
  }
  if (curE > curS) total += curE - curS;
  return total;
}

const toMin = (ms: number) => Math.round(ms / 60_000);

/**
 * Sums the stages of the last night in the samples. Overlapping samples of one stage count once.
 * Total asleep = core + deep + rem, or "Asleep" when no stages were recorded.
 */
export function aggregateSleep(samples: SleepSample[], tz = TZ): SleepSummary | null {
  const valid = samples.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  if (!valid.length) return null;

  // Group into separate sleeps; keep the one that ended last.
  const sorted = [...valid].sort((a, b) => a.start - b.start);
  const clusters: SleepSample[][] = [];
  let cur: SleepSample[] = [];
  let curEnd = -Infinity;
  for (const s of sorted) {
    if (cur.length && s.start - curEnd > NIGHT_GAP_MS) {
      clusters.push(cur);
      cur = [];
      curEnd = -Infinity;
    }
    cur.push(s);
    curEnd = Math.max(curEnd, s.end);
  }
  clusters.push(cur);
  // Prefer the last sleep that has actual sleep in it (not only "In Bed").
  const isSleep = (s: SleepSample) => s.stage !== "in_bed" && s.stage !== "awake";
  const night = [...clusters].reverse().find((c) => c.some(isSleep)) ?? clusters[clusters.length - 1]!;

  const by = (stage: Stage) => night.filter((s) => s.stage === stage);
  const ms = (stage: Stage) => unionMs(by(stage));
  const staged = by("core").length + by("deep").length + by("rem").length > 0;
  const core = ms("core"), deep = ms("deep"), rem = ms("rem"), asleep = ms("asleep"), awake = ms("awake"), inBed = ms("in_bed");

  const total = staged ? toMin(core + deep + rem) : by("asleep").length ? toMin(asleep) : null;
  const sleepEnds = night.filter(isSleep).map((s) => s.end);
  const lastEnd = Math.max(...(sleepEnds.length ? sleepEnds : night.map((s) => s.end)));
  const firstStart = Math.min(...night.map((s) => s.start));

  return {
    date: localDate(lastEnd, tz),
    total_min: total,
    deep_min: staged ? toMin(deep) : null,
    rem_min: staged ? toMin(rem) : null,
    core_min: staged ? toMin(core) : null,
    awake_min: staged || by("awake").length ? toMin(awake) : null,
    in_bed_min: by("in_bed").length ? toMin(inBed) : null,
    start: new Date(firstStart).toISOString(),
    end: new Date(lastEnd).toISOString(),
    used: night.length,
    left_out: valid.length - night.length
  };
}

// ------------------------------------------------------------------ numbers

/** First number in a value: 52, "52", "52,5", "52 count/min", ["52"], {value: 52}. Dutch decimal comma allowed. */
/**
 * Shortcuts on a Dutch iPhone turns "44,92491282952166" into the integer 4492491282952166 when the JSON field type
 * is Number (the decimal comma is dropped). Recover it: the first power-of-ten shift that lands in [lo, hi].
 */
export function unlocalise(n: number, lo: number, hi: number): number | null {
  if (!Number.isFinite(n) || n <= hi || !Number.isInteger(n)) return null;
  for (let k = 1; k <= 20; k++) {
    const v = n / 10 ** k;
    if (v >= lo && v <= hi) return v;
    if (v < lo) break;
  }
  return null;
}

export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) return v.length ? parseNumber(v[0]) : null;
  if (typeof v === "object") return parseNumber((v as Record<string, unknown>).value ?? (v as Record<string, unknown>).quantity);
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(v));
  return m ? Number(m[0].replace(",", ".")) : null;
}

// ------------------------------------------------------------------ the request

/** Lower-cases keys and turns spaces/dashes into underscores ("Resting HR " → "resting_hr"). */
function normaliseKeys(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) out[k.trim().toLowerCase().replace(/[\s-]+/g, "_")] = v;
  return out;
}

/**
 * Turns the posted body into the `health_daily` date and patch.
 * Date: local date of the latest sleep end, else `date` from the body, else today (all Europe/Amsterdam).
 */
export function buildIngest(input: unknown, now = Date.now(), tz = TZ): Ingest {
  const warnings: string[] = [];
  const body = input && typeof input === "object" && !Array.isArray(input) ? normaliseKeys(input as Record<string, unknown>) : {};
  if (typeof input === "string") body.sleep_text = input;

  // Sleep: structured list and/or the text lines.
  const samples: SleepSample[] = [];
  if (Array.isArray(body.sleep)) {
    for (const item of body.sleep) {
      if (!item || typeof item !== "object") { warnings.push("sleep: an item is not an object"); continue; }
      const it = normaliseKeys(item as Record<string, unknown>);
      const s = toSample(it.stage ?? it.value, it.start ?? it.start_date, it.end ?? it.end_date, tz);
      if (typeof s === "string") warnings.push(`sleep: ${s}`);
      else samples.push(s);
    }
  }
  if (body.sleep_text != null) {
    const parsed = parseSleepText(body.sleep_text, tz);
    samples.push(...parsed.samples);
    for (const w of parsed.skipped.slice(0, 5)) warnings.push(`sleep_text: ${w}`);
    if (parsed.skipped.length > 5) warnings.push(`sleep_text: ${parsed.skipped.length - 5} more lines skipped`);
  }
  const sleep = aggregateSleep(samples, tz);
  if (sleep && sleep.total_min == null) warnings.push("sleep: only In Bed was sent, no asleep time (is the Watch worn at night?)");

  // Resting HR and HRV, with sanity ranges.
  const hrRaw = parseNumber(body.resting_hr ?? body.restinghr ?? body.rhr);
  let resting_hr: number | null = null;
  if (hrRaw != null) {
    if (hrRaw >= 25 && hrRaw <= 220) resting_hr = Math.round(hrRaw);
    else warnings.push(`resting_hr ${hrRaw} is outside 25–220, ignored`);
  }
  const hrvRaw = parseNumber(body.hrv_sdnn_ms ?? body.hrv ?? body.hrv_ms);
  let hrv_sdnn_ms: number | null = null;
  if (hrvRaw != null) {
    const hrv = hrvRaw > 500 ? unlocalise(hrvRaw, 5, 300) : hrvRaw;
    if (hrv != null && hrv > 0 && hrv <= 500) {
      hrv_sdnn_ms = Math.round(hrv * 10) / 10;
      if (hrv !== hrvRaw) warnings.push(`hrv_sdnn_ms ${hrvRaw} read as ${hrv_sdnn_ms} (decimal comma lost; set the field type to Text)`);
    } else warnings.push(`hrv_sdnn_ms ${hrvRaw} is outside 1–500, ignored`);
  }

  // Date.
  let date = sleep?.date ?? null;
  if (!date && body.date != null && body.date !== "") {
    const d = String(body.date).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) date = d;
    else {
      const when = parseWhen(d, tz) ?? parseWhen(`${d} 12:00`, tz);
      if (when != null) date = localDate(when, tz);
      else warnings.push(`date "${clip(d)}" not understood, used today`);
    }
  }
  if (!date) date = localDate(now, tz);

  const patch: HealthPatch = {};
  if (sleep) {
    patch.sleep_total_min = sleep.total_min;
    patch.sleep_deep_min = sleep.deep_min;
    patch.sleep_rem_min = sleep.rem_min;
    patch.sleep_core_min = sleep.core_min;
    patch.sleep_awake_min = sleep.awake_min;
  }
  if (resting_hr != null) patch.resting_hr = resting_hr;
  if (hrv_sdnn_ms != null) patch.hrv_sdnn_ms = hrv_sdnn_ms;

  return { date, patch, sleep, resting_hr, hrv_sdnn_ms, warnings };
}

// ------------------------------------------------------------------ token hash

/** SHA-256 of the token text, lower-case hex. Must match the app (src/lib/ingestToken.ts). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
