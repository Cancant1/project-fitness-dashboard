import { useId } from "react";

export interface ChartPoint { label: string; value: number; secondary?: number; note?: string }

export function LineChart({ data, label, unit = "", secondaryLabel }: { data: ChartPoint[]; label: string; unit?: string; secondaryLabel?: string }) {
  const titleId = useId();
  if (data.length < 2) return <div className="chart-empty">Add at least two data points to see this trend.</div>;
  const width = 720;
  const height = 240;
  const pad = { left: 36, right: 18, top: 18, bottom: 30 };
  const values = data.flatMap((point) => point.secondary == null ? [point.value] : [point.value, point.secondary]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => pad.left + index / (data.length - 1) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (max - value) / span * (height - pad.top - pad.bottom);
  const path = data.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.value)}`).join(" ");
  const secondary = data.every((point) => point.secondary != null)
    ? data.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.secondary!)} `).join(" ")
    : "";
  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{label}. From {data[0].value.toFixed(1)} to {data.at(-1)!.value.toFixed(1)} {unit} across {data.length} points.</title>
        {[0, .25, .5, .75, 1].map((ratio) => {
          const value = max - ratio * span;
          const yy = y(value);
          return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid" /><text x={pad.left - 8} y={yy + 3} textAnchor="end" className="chart-axis">{value.toFixed(span < 10 ? 1 : 0)}</text></g>;
        })}
        {secondary && <path d={secondary} className="chart-line secondary" />}
        <path d={path} className="chart-line" />
        {data.map((point, index) => <circle key={`${point.label}-${index}`} cx={x(index)} cy={y(point.value)} r="4" className="chart-point"><title>{point.label}: {point.value.toFixed(1)} {unit}</title></circle>)}
        <text x={pad.left} y={height - 7} className="chart-axis">{data[0].label}</text>
        <text x={width - pad.right} y={height - 7} textAnchor="end" className="chart-axis">{data.at(-1)!.label}</text>
      </svg>
      <div className="chart-legend"><span><i />{label}</span>{secondary && <span><i className="secondary" />{secondaryLabel}</span>}</div>
    </div>
  );
}

export function Bars({ data, label, unit = "" }: { data: ChartPoint[]; label: string; unit?: string }) {
  const max = Math.max(...data.map((point) => point.value), 1);
  return (
    <div className="bar-chart" role="img" aria-label={`${label}. ${data.map((point) => `${point.label}: ${point.value} ${unit}`).join(", ")}`}>
      {data.map((point) => <div key={point.label} className="bar-item"><span className="bar-value">{Math.round(point.value)}</span><span className="bar-track"><i style={{ height: `${Math.max(3, point.value / max * 100)}%` }} /></span><small>{point.label}</small></div>)}
    </div>
  );
}

export function ComparisonBars({ data, label, secondaryLabel, unit = "" }: { data: ChartPoint[]; label: string; secondaryLabel: string; unit?: string }) {
  const max = Math.max(...data.flatMap((point) => [point.value, point.secondary ?? 0]), 1);
  const summary = data.map((point) => `${point.label}: ${point.value} ${label}, ${point.secondary ?? 0} ${secondaryLabel}`).join(", ");
  return (
    <div>
      <div className="bar-chart comparison-bars" role="img" aria-label={`${label} compared with ${secondaryLabel}. ${summary}`}>
        {data.map((point) => <div key={point.label} className="bar-item"><span className="bar-value">{Math.round(point.value)}/{Math.round(point.secondary ?? 0)}</span><span className="bar-pair"><i style={{ height: `${point.value ? Math.max(3, point.value / max * 100) : 0}%` }} /><i className="secondary" style={{ height: `${point.secondary ? Math.max(3, point.secondary / max * 100) : 0}%` }} /></span><small>{point.label}</small></div>)}
      </div>
      <div className="chart-legend"><span><i />{label}{unit ? ` (${unit})` : ""}</span><span><i className="secondary" />{secondaryLabel}</span></div>
    </div>
  );
}
