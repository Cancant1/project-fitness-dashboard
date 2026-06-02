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

function LineArea({ data, width = 600, height = 200, accent = true, target = null }) {
  if (!data || data.length < 2) return null;
  const values = data.map(d => d.value).filter(v => v !== null && v !== undefined);
  const min = Math.floor(Math.min(...values) - 0.5);
  const max = Math.ceil(Math.max(...values) + 0.5);
  const range = max - min || 1;
  const padL = 28, padB = 22, padT = 6, padR = 6;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xScale = i => padL + (i / (data.length - 1)) * innerW;
  const yScale = v => padT + innerH - ((v - min) / range) * innerH;

  const pts = data.map((d, i) => d.value !== null && d.value !== undefined ? [xScale(i), yScale(d.value)] : null);
  let path = "";
  pts.forEach((p, i) => {
    if (!p) return;
    path += (path ? " L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1);
  });
  const lastIdx = pts.map((p,i)=>p?i:-1).filter(i=>i>=0).pop();

  const gridLines = [0, 0.5, 1].map(t => {
    const v = min + range * (1 - t);
    return { y: padT + t * innerH, label: v.toFixed(0) };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={g.y} y2={g.y} className="chart-grid" />
          <text x={padL - 6} y={g.y + 3} className="chart-axis" textAnchor="end">{g.label}</text>
        </g>
      ))}
      {target !== null && (
        <line x1={padL} x2={width - padR} y1={yScale(target)} y2={yScale(target)} stroke="var(--accent)" strokeDasharray="3 3" strokeWidth="1" opacity="0.6" />
      )}
      <path d={path} className={`chart-line ${accent ? "accent" : ""}`} />
      {pts.map((p, i) => p && (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === lastIdx ? 3 : 1.5} className="chart-dot" />
      ))}
      {data.length > 1 && (
        <>
          <text x={padL} y={height - 6} className="chart-axis">{data[0].label}</text>
          <text x={width - padR} y={height - 6} className="chart-axis" textAnchor="end">{data[data.length-1].label}</text>
        </>
      )}
    </svg>
  );
}

function Heatmap({ data, weeks = 12 }) {
  // data: [{date, value}] — render as 7×N grid
  const cells = [];
  const today = new Date();
  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (w * 7 + (6 - d)));
      const iso = date.toISOString().slice(0, 10);
      const entry = data.find(x => x.date === iso);
      cells.push({ date: iso, value: entry?.value || 0, d, w });
    }
  }
  const max = Math.max(...cells.map(c => c.value), 1);
  return (
    <svg viewBox={`0 0 ${weeks * 14} ${7 * 14}`} style={{width:"100%", height:"auto"}}>
      {cells.map((c, i) => {
        const intensity = c.value ? Math.max(0.18, c.value / max) : 0;
        return (
          <rect key={i}
            x={c.w * 14} y={c.d * 14}
            width={12} height={12} rx={2}
            fill={c.value ? `color-mix(in oklab, var(--accent) ${intensity * 100}%, var(--surface-2))` : "var(--surface-2)"} />
        );
      })}
    </svg>
  );
}

window.RepsCharts = { Sparkline, StackedBars, LineArea, Heatmap };
