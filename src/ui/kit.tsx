// Visual kit: the shared components every page is built from. Tokens only (light + dark), no text-heavy parts.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./kit.css";

// ------------------------------------------------------------------ layout

/** Page header: a small eyebrow, a large title, optional trailing actions. */
export function PageHead({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="k-head">
      <div>
        {eyebrow && <p className="k-eyebrow">{eyebrow}</p>}
        <h1 className="k-title">{title}</h1>
      </div>
      {children && <div className="k-head-actions">{children}</div>}
    </header>
  );
}

/** Card surface. `tone="hero"` is the Pompeian-red gradient card. */
export function Card({ children, tone, className = "", pad = true, ...rest }: {
  children: ReactNode; tone?: "hero" | "ink" | "plain"; className?: string; pad?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return <section className={`k-card ${tone ? `k-card-${tone}` : ""} ${pad ? "k-pad" : ""} ${className}`} {...rest}>{children}</section>;
}

/** Small uppercase-free label above a group of content. */
export function Label({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="k-label"><span>{children}</span>{action}</div>;
}

// ------------------------------------------------------------------ numbers

/** Big number with a unit and a one-line caption. */
export function Stat({ value, unit, label, sub, tone, size = "md" }: {
  value: ReactNode; unit?: string; label?: ReactNode; sub?: ReactNode; tone?: "warm" | "accent" | "good"; size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <div className={`k-stat k-stat-${size}`}>
      {label && <span className="k-stat-label">{label}</span>}
      <span className={`k-stat-value ${tone ? `k-tone-${tone}` : ""}`}>{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="k-stat-sub">{sub}</span>}
    </div>
  );
}

/** A small change badge: +3.5 kg ↑ */
export function Delta({ value, unit = "", digits = 1 }: { value: number | null; unit?: string; digits?: number }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value > 0.0001, down = value < -0.0001;
  return <span className={`k-delta ${up ? "up" : down ? "down" : ""}`}>{up ? "▲" : down ? "▼" : "•"} {Math.abs(value).toFixed(digits).replace(/\.0+$/, "")}{unit}</span>;
}

// ------------------------------------------------------------------ ring

/** Progress ring. `value` 0..1 (clamped), optional second ring value for a target marker. */
export function Ring({ value, size = 88, stroke = 9, color = "var(--accent)", track = "var(--track)", children, label }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="k-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray 500ms ease" }} />
      </svg>
      <div className="k-ring-center">{children}</div>
    </div>
  );
}

/** Thin horizontal progress with an optional marker (e.g. old best). */
export function Bar({ value, marker, color = "var(--accent)", height = 6 }: { value: number; marker?: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="k-bar" style={{ height }}>
      <span style={{ width: `${v * 100}%`, background: color }} />
      {marker != null && marker > 0 && marker <= 1 && <i style={{ left: `${marker * 100}%` }} />}
    </div>
  );
}

// ------------------------------------------------------------------ curves

export interface Pt { x: number; y: number }

/** Smooth path through points (Catmull–Rom → cubic Bézier). */
export function smoothPath(pts: Pt[]): string {
  // Monotone cubic (Fritsch–Carlson): smooth, but never loops back in x or overshoots a data point.
  if (!pts.length) return "";
  const f = (p: Pt) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${f(p)}`).join(" ");
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i]!.x);
  const s = pts.slice(1).map((p, i) => (dx[i] ? (p.y - pts[i]!.y) / dx[i]! : 0));
  const m = pts.map((_, i) => (i === 0 ? s[0]! : i === n - 1 ? s[n - 2]! : s[i - 1]! * s[i]! <= 0 ? 0 : (s[i - 1]! + s[i]!) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (!s[i]) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / s[i]!, b = m[i + 1]! / s[i]!, h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * s[i]!; m[i + 1] = t * b * s[i]!; }
  }
  let d = `M${f(pts[0]!)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i]!, p2 = pts[i + 1]!, h = dx[i]! / 3;
    d += ` C${f({ x: p1.x + h, y: p1.y + m[i]! * h })} ${f({ x: p2.x - h, y: p2.y - m[i + 1]! * h })} ${f(p2)}`;
  }
  return d;
}

/** Tiny trend line with a soft area and an end dot. Scales to its box. */
export function Sparkline({ data, color = "var(--accent)", height = 40, label }: { data: number[]; color?: string; height?: number; label: string }) {
  const id = useId();
  const W = 120;
  if (data.length < 2) return <div style={{ height }} aria-label={label} />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * W, y: 4 + (1 - (v - min) / span) * (height - 8) }));
  const line = smoothPath(pts);
  const last = pts[pts.length - 1]!;
  return (
    <svg className="k-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={label}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${W},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="3" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface Series { points: Pt[]; color?: string; area?: boolean; dashed?: boolean; label: string; hollow?: (p: Pt) => boolean }

/**
 * Smooth area chart, drawn at its real width so text stays crisp, with a hover/tap crosshair.
 * x is numeric (e.g. a day index); `formatX` turns it into a label.
 */
export function AreaChart({ series, height = 240, formatX, formatY = (v) => String(Math.round(v)), yLines, bands = [], yBands = [], refs = [], markers = [], onPick, label }: {
  series: Series[]; height?: number; formatX: (x: number) => string; formatY?: (y: number) => string;
  yLines?: number; bands?: { from: number; to: number; label?: string }[];
  /** Horizontal value ranges, e.g. a 76–78 kg goal band. */
  yBands?: { from: number; to: number; label?: string; color?: string }[];
  refs?: { y: number; label: string; color?: string }[];
  markers?: { x: number; y: number; color?: string; label: string }[];
  /** Tap/click: the nearest point of the first series. */
  onPick?: (p: Pt) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  useResize(wrap, setW);

  const all = series.flatMap((s) => s.points).concat(markers);
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y).concat(refs.map((r) => r.y), yBands.flatMap((b) => [b.from, b.to]));
  if (!all.length) return <div className="k-empty" style={{ height }}>No data yet</div>;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.12 || 5;
  y0 -= pad; y1 += pad;
  const L = 36, R = 12, T = 12, B = 24;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (w - L - R);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (height - T - B);
  const ticks = niceTicks(y0, y1, yLines ?? 3);
  const xTicks = [x0, x0 + (x1 - x0) / 2, x1];

  const main = series[0]!;
  const nearest = hover == null ? null : main.points.reduce((b, p) => (Math.abs(p.x - hover) < Math.abs(b.x - hover) ? p : b), main.points[0]!);

  return (
    <div ref={wrap} className="k-chart"
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(x0 + ((e.clientX - r.left - L) / (w - L - R)) * (x1 - x0)); }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        if (!onPick) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = x0 + ((e.clientX - r.left - L) / (w - L - R)) * (x1 - x0);
        const p = main.points.reduce((b, q) => (Math.abs(q.x - x) < Math.abs(b.x - x) ? q : b), main.points[0]!);
        if (p) onPick(p);
      }}
      style={{ height, cursor: onPick ? "pointer" : undefined }} role="img" aria-label={label}>
      <svg width={w} height={height} aria-hidden="true">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color ?? "var(--chart-1)"} stopOpacity="0.24" />
              <stop offset="1" stopColor={s.color ?? "var(--chart-1)"} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {bands.map((b, i) => (
          <g key={i}>
            <rect x={sx(b.from)} y={T} width={Math.max(1, sx(b.to) - sx(b.from))} height={height - T - B} fill="var(--fg)" opacity="0.035" rx="4" />
          </g>
        ))}
        {yBands.map((b, i) => (
          <g key={`yb${i}`}>
            <rect x={L} width={w - L - R} y={sy(b.to)} height={Math.max(1, sy(b.from) - sy(b.to))} fill={b.color ?? "var(--warm)"} opacity="0.09" rx="4" />
            {b.label && <text x={w - R - 4} y={sy(b.to) + 13} textAnchor="end" className="k-axis k-axis-strong">{b.label}</text>}
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={w - R} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={L - 8} y={sy(t) + 4} textAnchor="end" className="k-axis">{formatY(t)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={sx(t)} y={height - 6} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} className="k-axis">{formatX(t)}</text>
        ))}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={L} x2={w - R} y1={sy(r.y)} y2={sy(r.y)} stroke={r.color ?? "var(--fg)"} strokeOpacity="0.5" strokeDasharray="3 5" />
            <text x={w - R} y={sy(r.y) - 6} textAnchor="end" className="k-axis k-axis-strong">{r.label}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const pts = s.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
          const d = smoothPath(pts);
          const color = s.color ?? "var(--chart-1)";
          return (
            <g key={i}>
              {s.area && pts.length > 1 && <path d={`${d} L${pts[pts.length - 1]!.x},${height - B} L${pts[0]!.x},${height - B} Z`} fill={`url(#${gid}-${i})`} />}
              <path d={d} fill="none" stroke={color} strokeWidth={s.dashed ? 2 : 2.5} strokeDasharray={s.dashed ? "5 6" : undefined} strokeLinecap="round" />
              {s.hollow && s.points.map((p, j) => s.hollow!(p) ? <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r="3" fill="var(--surface)" stroke={color} strokeWidth="1.5" /> : null)}
            </g>
          );
        })}
        {markers.map((m, i) => <circle key={i} cx={sx(m.x)} cy={sy(m.y)} r="5" fill={m.color ?? "var(--warm)"} stroke="var(--surface)" strokeWidth="2"><title>{m.label}</title></circle>)}
        {nearest && (
          <g>
            <line x1={sx(nearest.x)} x2={sx(nearest.x)} y1={T} y2={height - B} stroke="var(--fg)" strokeOpacity="0.18" />
            <circle cx={sx(nearest.x)} cy={sy(nearest.y)} r="5" fill="var(--surface)" stroke={main.color ?? "var(--chart-1)"} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {nearest && (
        <div className="k-tip" style={{ left: Math.min(Math.max(sx(nearest.x), 60), w - 60), top: Math.max(sy(nearest.y) - 44, 0) }}>
          <b>{formatY(nearest.y)}</b> <span>{formatX(nearest.x)}</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ radar

/** Radar for 5–10 axes; values as ratios (1 = reference). Two shapes: current and reference. */
export function Radar({ axes, size = 260, label }: { axes: { name: string; value: number; ref?: number }[]; size?: number; label: string }) {
  const c = size / 2, R = size / 2 - 34;
  const max = Math.max(1.2, ...axes.map((a) => Math.max(a.value, a.ref ?? 0)));
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return { x: c + Math.cos(a) * R * (v / max), y: c + Math.sin(a) * R * (v / max) };
  };
  const poly = (vals: number[]) => vals.map((v, i) => { const p = pt(i, v); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={label} className="k-radar">
      {[0.25, 0.5, 0.75, 1].map((g) => <polygon key={g} points={poly(axes.map(() => g * max))} fill="none" stroke="var(--grid)" />)}
      {axes.map((_, i) => { const p = pt(i, max); return <line key={i} x1={c} y1={c} x2={p.x} y2={p.y} stroke="var(--grid)" />; })}
      {axes.some((a) => a.ref != null) && <polygon points={poly(axes.map((a) => a.ref ?? 0))} fill="none" stroke="var(--chart-3)" strokeDasharray="3 4" strokeWidth="1.5" />}
      <polygon points={poly(axes.map((a) => a.value))} fill="var(--chart-1)" fillOpacity="0.18" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const p = pt(i, max * 1.13);
        return <text key={a.name} x={p.x} y={p.y + 4} textAnchor={Math.abs(p.x - c) < 8 ? "middle" : p.x > c ? "start" : "end"} className="k-axis k-axis-strong">{a.name}</text>;
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ heatmap

/** Calendar heatmap: one column per week, cells coloured by level 0–3. */
export function WeekHeat({ weeks, label }: { weeks: { key: string; level: 0 | 1 | 2 | 3; title: string }[]; label: string }) {
  return (
    <div className="k-heat" role="img" aria-label={label}>
      {weeks.map((w) => <span key={w.key} className={`l${w.level}`} title={w.title} />)}
    </div>
  );
}

// ------------------------------------------------------------------ misc

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="k-seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Pill({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" | "warm" | "good" | "ink" }) {
  return <span className={`k-pill k-pill-${tone}`}>{children}</span>;
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/** Keeps a chart drawn at its container's real width (crisp text at every size). */
function useResize(ref: React.RefObject<HTMLElement | null>, set: (w: number) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    set(Math.max(240, Math.round(el.clientWidth)));
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => set(Math.max(240, Math.round(e[0]!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, set]);
}
