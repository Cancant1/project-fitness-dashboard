// Theme-aware SVG plot drawn at the container's real width: lines, dots, bands, reference lines, markers.
// One scale for every mark and label. Colours come from tokens passed in by the caller.

import { useWidth } from "./ui";

export interface XY { x: number; y: number }
export interface PlotLine { points: XY[]; color: string; dashed?: boolean; width?: number }
export interface PlotDot extends XY { color: string; hollow?: boolean; r?: number; title?: string }
export interface PlotBand { x0: number; x1: number; label: string; title?: string }
export interface PlotRef { y: number; label: string }
export interface PlotMarker extends XY { label: string; color?: string }

interface Props {
  label: string;
  height?: number;
  xDomain: [number, number];
  yDomain?: [number, number];
  xTicks?: { x: number; label: string }[];
  yFormat?: (v: number) => string;
  lines?: PlotLine[];
  dots?: PlotDot[];
  bands?: PlotBand[];
  refs?: PlotRef[];
  markers?: PlotMarker[];
  empty?: string;
}

export function Plot({ label, height = 240, xDomain, yDomain, xTicks = [], yFormat = (v) => String(Number(v.toFixed(1))), lines = [], dots = [], bands = [], refs = [], markers = [], empty = "No data yet." }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const ys = [...lines.flatMap((l) => l.points.map((p) => p.y)), ...dots.map((d) => d.y), ...refs.map((r) => r.y), ...markers.map((m) => m.y)];
  const hasData = lines.some((l) => l.points.length) || dots.length > 0;

  let [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (!yDomain) {
    const pad = (y1 - y0) * 0.1 || 2;
    y0 -= pad;
    y1 += pad;
  }
  const ticks = niceTicks(y0, y1, height < 200 ? 3 : 4);
  const [x0, x1] = xDomain;
  const W = Math.max(width, 200);
  const H = height;
  const PAD = { l: 40, r: 14, t: bands.length ? 22 : 12, b: xTicks.length ? 24 : 10 };
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const clipX = (x: number) => Math.min(W - PAD.r, Math.max(PAD.l, x));

  return (
    <div ref={ref} style={{ width: "100%", minWidth: 0 }}>
      {!hasData ? (
        <p className="muted" style={{ fontSize: 15, minHeight: 60, display: "grid", placeItems: "center" }}>{empty}</p>
      ) : width > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ display: "block" }}>
          <g fontFamily="var(--sans)" fontSize="11" fill="var(--fg2)">
            {bands.map((b, i) => {
              const a = clipX(sx(b.x0));
              const z = clipX(sx(b.x1));
              if (z - a < 1) return null;
              const chars = Math.floor((z - a - 6) / 6);
              const text = chars >= 4 ? (b.label.length > chars ? `${b.label.slice(0, chars - 1)}…` : b.label) : "";
              return (
                <g key={i}>
                  <rect x={a} y={PAD.t - 16} width={z - a} height={H - PAD.b - PAD.t + 16} fill="var(--fg)" fillOpacity={i % 2 ? 0.035 : 0.065} rx={4}>
                    <title>{b.title ?? b.label}</title>
                  </rect>
                  {text && <text x={a + 4} y={PAD.t - 5} fontSize="10">{text}</text>}
                </g>
              );
            })}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
                <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end">{yFormat(t)}</text>
              </g>
            ))}
            {xTicks.map((t, i) => {
              const x = sx(t.x);
              const anchor = x < PAD.l + 20 ? "start" : x > W - PAD.r - 20 ? "end" : "middle";
              return <text key={i} x={x} y={H - 6} textAnchor={anchor}>{t.label}</text>;
            })}
            {refs.map((r) => (
              <g key={r.label}>
                <line x1={PAD.l} x2={W - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--fg)" strokeOpacity="0.5" strokeDasharray="2 4" />
                <text x={W - PAD.r} y={sy(r.y) - 5} textAnchor="end" fill="var(--fg)">{r.label}</text>
              </g>
            ))}
          </g>
          {lines.map((l, i) => {
            if (!l.points.length) return null;
            const d = l.points.map((p, j) => `${j ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
            return <path key={i} d={d} fill="none" stroke={l.color} strokeWidth={l.width ?? 2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={l.dashed ? "5 5" : undefined} />;
          })}
          {dots.map((d, i) => (
            <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={d.r ?? 3.5} fill={d.hollow ? "var(--surface)" : d.color} stroke={d.color} strokeWidth={d.hollow ? 1.75 : 0}>
              {d.title && <title>{d.title}</title>}
            </circle>
          ))}
          {markers.map((m, i) => (
            <g key={i}>
              <circle cx={sx(m.x)} cy={sy(m.y)} r={6} fill="var(--surface)" stroke={m.color ?? "var(--fg)"} strokeWidth={2}><title>{m.label}</title></circle>
              <text x={sx(m.x)} y={sy(m.y) + 20} textAnchor="middle" fontFamily="var(--sans)" fontSize="11" fill="var(--fg)">{m.label}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}
