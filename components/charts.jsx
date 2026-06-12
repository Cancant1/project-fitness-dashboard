/* global React */
// Tiny SVG chart primitives — designed to be sharp and data-friendly

function Sparkline({ data, width = 120, height = 28, accent = false }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const path = "M" + points.map(p => p.map(n => n.toFixed(1)).join(",")).join(" L");
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{display:"block"}}>
      <path d={path} className={`chart-line ${accent ? "accent" : ""}`} />
      <circle cx={last[0]} cy={last[1]} r="2" className="chart-dot" />
    </svg>
  );
}

function StackedBars({ data, width = 600, height = 200, keys = ["Push","Pull","Legs"] }) {
  if (!data || !data.length) return null;
  const totals = data.map(d => keys.reduce((s, k) => s + (d[k] || 0), 0));
  const max = Math.max(...totals, 30);
  const padL = 28, padB = 22, padT = 6, padR = 6;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const bw = innerW / data.length;
  const gap = bw * 0.15;
  const yScale = v => padT + innerH - (v / max) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const v = max * t;
    return { y: yScale(v), label: Math.round(v) };
  });

  const colorClass = { Push: "push", Pull: "pull", Legs: "legs" };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={g.y} y2={g.y} className="chart-grid" />
          <text x={padL - 6} y={g.y + 3} className="chart-axis" textAnchor="end">{g.label}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * bw + gap / 2;
        const w = bw - gap;
        let running = 0;
        return (
          <g key={i}>
            {keys.map(k => {
              const v = d[k] || 0;
              if (!v) return null;
              const h = (v / max) * innerH;
              const y = yScale(running + v);
              running += v;
              return <rect key={k} x={x} y={y} width={w} height={h} className={`chart-bar ${colorClass[k] || ""}`} />;
            })}
            {i % Math.ceil(data.length / 6) === 0 && (
              <text x={x + w / 2} y={height - 6} className="chart-axis" textAnchor="middle">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function chartDateMs(date) {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function monthlyChartTicks(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];
  const spansYears = new Date(startMs).getUTCFullYear() !== new Date(endMs).getUTCFullYear();
  const format = (timestamp) => new Intl.DateTimeFormat("en-GB", {
    month: "short",
    ...(spansYears ? { year: "2-digit" } : {})
  }).format(new Date(timestamp));
  const ticks = [{ timestamp: startMs, label: format(startMs) }];
  const start = new Date(startMs);
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  while (cursor <= endMs) {
    ticks.push({ timestamp: cursor, label: format(cursor) });
    const date = new Date(cursor);
    cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return ticks;
}

function LineArea({ data, width = 600, height = 200, accent = true, target = null, current = null }) {
  if (!data || data.length < 2) return null;
  const plotted = data
    .filter(d => d?.value !== null && d?.value !== undefined && d?.value !== "")
    .map(d => ({ ...d, value: Number(d.value), timestamp: chartDateMs(d.date) }))
    .filter(d => Number.isFinite(d.value));
  if (plotted.length < 2) return null;
  const targetValue = target == null || target === "" ? null : Number(target);
  const currentValue = current == null || current === "" ? plotted[plotted.length - 1].value : Number(current);
  const values = plotted.map(d => d.value);
  if (Number.isFinite(targetValue)) values.push(targetValue);
  if (Number.isFinite(currentValue)) values.push(currentValue);
  let min = Math.floor(Math.min(...values));
  let max = Math.ceil(Math.max(...values));
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min || 1;
  const padL = 40, padB = 28, padT = 12, padR = 82;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const dated = plotted.filter(d => Number.isFinite(d.timestamp));
  const startMs = dated.length ? dated[0].timestamp : 0;
  const endMs = dated.length ? dated[dated.length - 1].timestamp : plotted.length - 1;
  const dateRange = Math.max(1, endMs - startMs);
  const xScale = (d, i) => Number.isFinite(d.timestamp)
    ? padL + ((d.timestamp - startMs) / dateRange) * innerW
    : padL + (i / (plotted.length - 1)) * innerW;
  const yScale = v => padT + innerH - ((v - min) / range) * innerH;

  const pts = plotted.map((d, i) => [xScale(d, i), yScale(d.value)]);
  let path = "";
  pts.forEach((p, i) => {
    path += (path ? " L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1);
  });
  const lastIdx = pts.length - 1;
  // Cap grid density: one line per kg was unreadable (and slow) on wide ranges.
  const gridStep = Math.max(1, Math.ceil(range / 6));
  const gridLines = [];
  for (let value = min; value <= max; value += gridStep) {
    gridLines.push({ y: yScale(value), label: value.toFixed(0) });
  }
  const monthTicks = monthlyChartTicks(startMs, endMs);
  const targetY = Number.isFinite(targetValue) ? yScale(targetValue) : null;
  const currentY = Number.isFinite(currentValue) ? yScale(currentValue) : null;
  const referencesOverlap = targetY != null && currentY != null && Math.abs(targetY - currentY) < 12;

  return (
    <svg viewBox={`0 0 ${width} ${height}`}>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={g.y} y2={g.y} className="chart-grid" />
          <text x={padL - 6} y={g.y + 3} className="chart-axis" textAnchor="end">{g.label}</text>
        </g>
      ))}
      {monthTicks.map((tick, index) => {
        const x = padL + ((tick.timestamp - startMs) / dateRange) * innerW;
        return (
          <g key={`${tick.timestamp}-${index}`}>
            <line x1={x} x2={x} y1={padT} y2={height - padB} className="chart-month-grid" />
            <text
              x={x}
              y={height - 7}
              className="chart-axis"
              textAnchor={index === 0 ? "start" : "middle"}>
              {tick.label}
            </text>
          </g>
        );
      })}
      {targetY != null && (
        <g>
          <line x1={padL} x2={width - padR} y1={targetY} y2={targetY} className="chart-target-line" />
          <text x={width - padR + 6} y={targetY + (referencesOverlap ? -5 : 3)} className="chart-reference-label">
            {targetValue.toFixed(1)} kg target
          </text>
        </g>
      )}
      {currentY != null && (
        <g>
          <line x1={padL} x2={width - padR} y1={currentY} y2={currentY} className="chart-current-line" />
          <text x={width - padR + 6} y={currentY + (referencesOverlap ? 10 : 3)} className="chart-reference-label current">
            {currentValue.toFixed(1)} kg current
          </text>
        </g>
      )}
      <path d={path} className={`chart-line ${accent ? "accent" : ""}`} />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === lastIdx ? 3 : 1.5} className="chart-dot" />
      ))}
    </svg>
  );
}

window.RepsCharts = { Sparkline, StackedBars, LineArea };
