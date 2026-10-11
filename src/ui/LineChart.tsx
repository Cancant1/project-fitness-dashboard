import { useId } from "react";

export interface Point { x: number; y: number }
export interface Series { points: Point[]; color?: string; dashed?: boolean; area?: boolean; dots?: boolean }

interface Props {
  series: Series[];
  height?: number;
  yTicks?: number[];
  xLabels?: { x: number; label: string }[];
  refLines?: { y: number; label: string }[];
  markers?: { x: number; y: number; color?: string; label?: string }[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  label: string;
}

const W = 660;
const PAD = { l: 40, r: 16, t: 14, b: 26 };

/** Small, theme-aware SVG line chart. One scale for marks, ticks and labels. */
export function LineChart({ series, height = 240, yTicks, xLabels, refLines = [], markers = [], xDomain, yDomain, label }: Props) {
  const gradId = useId();
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x).concat(markers.map((m) => m.x));
  const ys = all.map((p) => p.y).concat(refLines.map((r) => r.y), markers.map((m) => m.y));
  const [x0, x1] = xDomain ?? [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (!yDomain) {
    const pad = (y1 - y0) * 0.08 || 1;
    y0 -= pad;
    y1 += pad;
  }
  const H = height;
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const ticks = yTicks ?? niceTicks(y0, y1, 4);

  if (!all.length) return <p className="muted" style={{ fontSize: 15 }}>No data yet.</p>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={label} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fontFamily="var(--sans)" fontSize="11" fill="var(--fg2)">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
            <text x={4} y={sy(t) + 4}>{Number(t.toFixed(1))}</text>
          </g>
        ))}
        {xLabels?.map((l) => (
          <text key={l.x} x={sx(l.x)} y={H - 6} textAnchor="middle">{l.label}</text>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--fg)" strokeOpacity="0.45" strokeDasharray="2 4" />
            <text x={W - PAD.r} y={sy(r.y) - 6} textAnchor="end" fill="var(--fg)">{r.label}</text>
          </g>
        ))}
      </g>
      {series.map((s, i) => {
        if (!s.points.length) return null;
        const d = s.points.map((p, j) => `${j ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
        const last = s.points[s.points.length - 1]!;
        const first = s.points[0]!;
        return (
          <g key={i}>
            {s.area && <path d={`${d} L${sx(last.x)},${H - PAD.b} L${sx(first.x)},${H - PAD.b} Z`} fill={`url(#${gradId})`} />}
            <path d={d} fill="none" stroke={s.color ?? "var(--accent)"} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 5" : undefined} />
            {s.dots && s.points.map((p, j) => <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color ?? "var(--accent)"} />)}
            {!s.dashed && <circle cx={sx(last.x)} cy={sy(last.y)} r={4.5} fill="var(--surface)" stroke={s.color ?? "var(--accent)"} strokeWidth={2} />}
          </g>
        );
      })}
      {markers.map((m, i) => (
        <circle key={i} cx={sx(m.x)} cy={sy(m.y)} r={5} fill={m.color ?? "var(--warm)"}><title>{m.label}</title></circle>
      ))}
    </svg>
  );
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toFixed(6)));
  return out;
}
