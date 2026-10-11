// Small charts used on Progress, Records and Exercise: rep-max curve, best-per-year bars with the PR staircase,
// and a compact scatter. Drawn at their real width so text stays crisp. Tokens only.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { periodBests, repBests, runningBests, yearKey, type Metric, type SessionBest, type WorkSet } from "../../lib/analysis";
import { smoothPath } from "../../ui/kit";
import { fmtLiftSet, fmtMetric, fmtWhen } from "./format";

/** Width of an element, kept up to date. A callback ref, so it also works when the element mounts late. */
export function useWidth<T extends HTMLElement>(fallback = 300): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    if (el.clientWidth) setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => {
      const next = Math.round(e[0]?.contentRect.width ?? 0);
      if (next) setW((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/** Caption on the left, the tapped value on the right. */
function Readout({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="pg-readout">
      <span>{caption}</span>
      <span className="pg-readout-v">{children}</span>
    </div>
  );
}

// ------------------------------------------------------------------ rep-max curve

export const REP_AXIS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Heaviest load done for at least N reps, N = 1–12 (flagged sets excluded). */
export function useRepMaxes(sets: readonly WorkSet[]) {
  return useMemo(() => {
    const m = repBests(sets, REP_AXIS, "atLeast");
    return REP_AXIS.filter((r) => m.has(r)).map((r) => ({ reps: r, set: m.get(r)! }));
  }, [sets]);
}

export function RepCurve({ sets, metric = "e1rm", color = "var(--warm)", height = 120, caption = "Rep maxes" }: {
  sets: readonly WorkSet[]; metric?: Metric; color?: string; height?: number; caption?: string;
}) {
  const fmtSet = (s: Pick<WorkSet, "loadKg" | "reps" | "unit">) => fmtLiftSet(s, metric);
  const pts = useRepMaxes(sets);
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length < 2) return null;

  const loads = pts.map((p) => p.set.loadKg!);
  const lo = Math.min(...loads), hi = Math.max(...loads);
  const pad = (hi - lo) * 0.15 || 5;
  const L = 10, R = 10, T = 10, B = 20;
  const sx = (r: number) => L + ((r - 1) / 11) * (w - L - R);
  const sy = (v: number) => T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (height - T - B);
  const xy = pts.map((p) => ({ x: sx(p.reps), y: sy(p.set.loadKg!) }));
  const chosen = pts.find((p) => p.reps === sel) ?? pts.find((p) => p.reps === 5) ?? pts[pts.length - 1]!;

  const pick = (clientX: number, box: DOMRect) => {
    const r = Math.round(1 + ((clientX - box.left - L) / (w - L - R)) * 11);
    const near = pts.reduce((a, p) => (Math.abs(p.reps - r) < Math.abs(a.reps - r) ? p : a), pts[0]!);
    setSel(near.reps);
  };

  return (
    <div className="pg-mini">
      <Readout caption={caption}>
        <b>{fmtSet(chosen.set)}</b>
        <span>{fmtWhen(chosen.set.date, chosen.set.confidence)}</span>
      </Readout>
      <div ref={ref} className="pg-mini-plot" style={{ height }}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        role="img" aria-label={`${caption}: ${pts.map((p) => `${p.reps} reps ${fmtSet({ ...p.set, reps: null })}`).join(", ")}`}>
        <svg width={w} height={height} aria-hidden="true">
          <line x1={sx(chosen.reps)} x2={sx(chosen.reps)} y1={T - 4} y2={height - B} stroke="var(--fg)" strokeOpacity="0.12" />
          <path d={smoothPath(xy)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          {pts.map((p, i) => {
            const on = p.reps === chosen.reps;
            const hollow = p.set.confidence === "estimated";
            return <circle key={p.reps} cx={xy[i]!.x} cy={xy[i]!.y} r={on ? 5.5 : 3.5}
              fill={hollow && !on ? "var(--surface)" : color} stroke={on ? "var(--surface)" : color} strokeWidth={on ? 2 : 1.5} />;
          })}
          {[1, 3, 5, 8, 10, 12].map((r) => (
            <text key={r} x={sx(r)} y={height - 4} textAnchor="middle" className={`k-axis ${r === chosen.reps ? "k-axis-strong" : ""}`}>{r}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ best per year + staircase

export function YearBars({ bests, metric, height = 120, caption = "Best per year" }: {
  bests: readonly SessionBest[]; metric: Metric; height?: number; caption?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const data = useMemo(() => {
    const per = new Map(periodBests(bests, yearKey).map((b) => [b.period, b]));
    if (!per.size) return null;
    const ys = [...per.keys()].map(Number);
    const years: number[] = [];
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) years.push(y);
    const prYears = new Set(runningBests([...per.values()]).map((b) => b.period));
    const top = [...per.values()].reduce((a, b) => (b.value > a.value ? b : a));
    let run = -Infinity;
    const stair = years.map((y) => { const b = per.get(String(y)); if (b && b.value > run) run = b.value; return Number.isFinite(run) ? run : null; });
    return { per, years, prYears, top, stair };
  }, [bests]);
  const [sel, setSel] = useState<string | null>(null);
  if (!data) return null;

  const vals = [...data.per.values()].map((b) => b.value);
  const hi = Math.max(...vals), lo0 = Math.min(...vals);
  const lo = metric === "e1rm" ? Math.max(0, lo0 - (hi - lo0) * 0.6 - 10) : Math.min(0, lo0);
  const T = 12, B = 20;
  const n = data.years.length;
  const slot = w / n;
  const bw = Math.min(26, slot * 0.62);
  const sy = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (height - T - B);
  const chosen = (sel && data.per.get(sel)) || data.top;

  const stairPath = data.stair.map((v, i) => (v == null ? "" : `${i && data.stair[i - 1] != null ? "L" : "M"}${(i * slot + 2).toFixed(1)},${sy(v).toFixed(1)} L${((i + 1) * slot - 2).toFixed(1)},${sy(v).toFixed(1)}`)).join(" ");
  const showYear = (i: number) => n <= 7 || i === 0 || i === n - 1 || data.years[i] === Number(chosen.period);

  return (
    <div className="pg-mini">
      <Readout caption={caption}>
        <b>{fmtMetric(chosen.value, metric)}</b>
        <span>{chosen.period}{chosen.confidence === "estimated" ? " · est." : ""}</span>
      </Readout>
      <div ref={ref} className="pg-mini-plot" style={{ height }} role="img"
        aria-label={`${caption}: ${data.years.map((y) => `${y} ${fmtMetric(data.per.get(String(y))?.value, metric)}`).join(", ")}`}>
        <svg width={w} height={height} aria-hidden="true">
          {data.years.map((y, i) => {
            const b = data.per.get(String(y));
            const cx = i * slot + slot / 2;
            const on = b && b.period === chosen.period;
            return (
              <g key={y} onPointerDown={() => b && setSel(b.period)} style={{ cursor: b ? "pointer" : undefined }}>
                <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
                {b && (
                  <rect x={cx - bw / 2} width={bw} y={sy(b.value)} height={Math.max(3, height - B - sy(b.value))} rx={Math.min(6, bw / 3)}
                    fill={b === data.top ? "var(--warm)" : data.prYears.has(b.period) ? "color-mix(in srgb, var(--warm) 38%, var(--track))" : "var(--track)"}
                    stroke={on ? "var(--fg)" : "none"} strokeOpacity="0.35" strokeWidth="1.5" />
                )}
                {b?.confidence === "estimated" && <circle cx={cx} cy={sy(b.value) - 7} r="2.5" fill="var(--surface)" stroke="var(--fg2)" strokeWidth="1.2" />}
                {showYear(i) && <text x={cx} y={height - 4} textAnchor="middle" className={`k-axis ${on ? "k-axis-strong" : ""}`}>’{String(y).slice(2)}</text>}
              </g>
            );
          })}
          <path d={stairPath} fill="none" stroke="var(--warm)" strokeWidth="1.5" strokeDasharray="2 3" strokeLinecap="round" pointerEvents="none" />
        </svg>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ scatter

export interface ScatterSeries {
  label: string;
  color: string;
  points: { x: number; y: number; hollow?: boolean; title: string }[];
  fit?: { slope: number; intercept: number } | null;
}

export function Scatter({ series, height = 190, formatX, label }: { series: ScatterSeries[]; height?: number; formatX: (x: number) => string; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return null;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 5;
  const y0 = Math.min(...ys) - yPad, y1 = Math.max(...ys) + yPad;
  const L = 34, R = 8, T = 8, B = 22;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (w - L - R);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (height - T - B);
  // Round ticks (25 or 50 kg apart) inside the plotted range.
  const step = y1 - y0 > 150 ? 50 : 25;
  const yt: number[] = [];
  for (let t = Math.ceil(y0 / step) * step; t <= y1; t += step) yt.push(t);
  return (
    <div ref={ref} className="pg-mini-plot" style={{ height }} role="img" aria-label={label}>
      <svg width={w} height={height} aria-hidden="true">
        {yt.map((t) => (
          <g key={t}>
            <line x1={L} x2={w - R} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={L - 6} y={sy(t) + 4} textAnchor="end" className="k-axis">{Math.round(t)}</text>
          </g>
        ))}
        <text x={L} y={height - 4} className="k-axis">{formatX(Math.min(...xs))}</text>
        <text x={w - R} y={height - 4} textAnchor="end" className="k-axis">{formatX(Math.max(...xs))}</text>
        {series.map((s) => s.fit && (
          <line key={`f-${s.label}`} x1={sx(x0)} x2={sx(x1)} y1={sy(s.fit.slope * x0 + s.fit.intercept)} y2={sy(s.fit.slope * x1 + s.fit.intercept)}
            stroke={s.color} strokeWidth="1.5" strokeDasharray="4 5" strokeOpacity="0.8" />
        ))}
        {series.map((s) => s.points.map((p, i) => (
          <circle key={`${s.label}-${i}`} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={p.hollow ? "var(--surface)" : s.color} fillOpacity={p.hollow ? 1 : 0.8}
            stroke={s.color} strokeWidth="1.5"><title>{p.title}</title></circle>
        )))}
      </svg>
    </div>
  );
}
