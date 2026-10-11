// Dates are local calendar dates as "YYYY-MM-DD" strings; never shift through UTC.

export function todayIso(now?: Date): string {
  return toIso(now ?? devToday() ?? new Date());
}

/** Dev only: `?today=YYYY-MM-DD` in the URL pretends it is that day (for previewing later plan weeks in ?demo). */
function devToday(): Date | null {
  if (!import.meta.env?.DEV || typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("today");
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00`) : null;
}

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000);
}

/** Monday of the week containing iso. */
export function mondayOf(iso: string): string {
  const d = fromIso(iso);
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const shortDateYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const fmtLongDate = (iso: string) => longDate.format(fromIso(iso));
export const fmtShortDate = (iso: string) => shortDate.format(fromIso(iso));
export const fmtShortDateYear = (iso: string) => shortDateYear.format(fromIso(iso));

/** Accepts "82,5", "82.5", " 82 ". Returns null for empty or invalid input. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 82.5 → "82.5", 120 → "120", 54.4310 → "54.43". */
export function fmtNum(n: number | null | undefined, maxDecimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n.toFixed(maxDecimals)).toLocaleString("en-GB", { maximumFractionDigits: maxDecimals });
}

export const LB_TO_KG = 0.45359237;

export function toKg(load: number | null, unit: string): number | null {
  if (load == null) return null;
  if (unit === "lb") return Math.round(load * LB_TO_KG * 100) / 100;
  if (unit === "bodyweight") return load || 0;
  return load;
}
