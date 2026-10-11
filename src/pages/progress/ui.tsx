// Small shared pieces for Progress, Records and Exercise.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Confidence, WorkSet } from "../../lib/analysis";
import { fmtNum, fmtShortDateYear, fromIso } from "../../lib/format";

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "short" });

export const fmtMonthYear = (iso: string) => monthYear.format(fromIso(iso.length === 7 ? `${iso}-01` : iso));
export const fmtMonth = (iso: string) => monthOnly.format(fromIso(iso.length === 7 ? `${iso}-01` : iso));

/**
 * A date as far as we know it: exact and week-known dates show the day (week-known gets a label);
 * estimated dates show only the month, with a label.
 */
export function fmtWhen(date: string, confidence: Confidence): string {
  if (confidence === "estimated") return `${fmtMonthYear(date)} · date estimated`;
  if (confidence === "week known") return `${fmtShortDateYear(date)} · week known`;
  return fmtShortDateYear(date);
}

/** "142.5 × 5", "+20 × 8", "BW × 12", "−10 × 8" (assisted). Loads in kg. */
export function fmtSet(s: Pick<WorkSet, "loadKg" | "reps" | "unit">): string {
  const reps = s.reps != null ? ` × ${fmtNum(s.reps)}` : "";
  if (s.loadKg == null) return `—${reps}`;
  if (s.unit === "bodyweight") {
    if (s.loadKg === 0) return `BW${reps}`;
    return `${s.loadKg > 0 ? "+" : "−"}${fmtNum(Math.abs(s.loadKg))}${reps}`;
  }
  return `${fmtNum(s.loadKg)}${reps}`;
}

export const fmtKg = (n: number | null | undefined, d = 1) => (n == null ? "—" : fmtNum(n, d));

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label} style={{ borderRadius: 22, maxWidth: "100%", flexWrap: "wrap", alignSelf: "flex-start" }}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          style={{ height: 38, borderRadius: 19, padding: "0 12px", whiteSpace: "nowrap" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Card with a title row (title left, optional controls right). */
export function Panel({ title, sub, right, children, style }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>{title}</h2>
          {sub && <p className="row-sub">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Two columns from ~900 px, one on the phone. */
export const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16, alignItems: "start" };

export function Swatch({ color, dashed, hollow, label }: { color: string; dashed?: boolean; hollow?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg2)" }}>
      {hollow ? (
        <span style={{ width: 9, height: 9, borderRadius: 5, boxShadow: `inset 0 0 0 2px ${color}` }} />
      ) : dashed ? (
        <span style={{ width: 16, height: 0, borderTop: `2px dashed ${color}` }} />
      ) : (
        <span style={{ width: 16, height: 3, borderRadius: 2, background: color }} />
      )}
      {label}
    </span>
  );
}

/** Width of an element, kept up to date (charts draw at real pixel size so text stays legible on the phone). */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? el.clientWidth);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
