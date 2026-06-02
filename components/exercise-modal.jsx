/* global React, RepsData, RepsCharts, RepsIcons */
const { useState: useEM, useMemo: useEMMemo } = React;
const EMI = RepsIcons;

/* -----------------------------------------------------------------
   ProgressionChart
   Combines exercise weight (line + area) with bodyweight (subtle line)
   on a shared X axis.
   ----------------------------------------------------------------- */
function ProgressionChart({ sessions, bodyData, metric = "maxWeight", height = 240 }) {
  if (!sessions || sessions.length < 2) {
    return <div className="empty" style={{margin: "0 0 12px"}}>Not enough data for a trend yet.</div>;
  }

  const width = 720;
  const padL = 36, padR = 40, padT = 16, padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  // X scale: by date across the whole range
  const firstDate = sessions[0].date;
  const lastDate = sessions[sessions.length - 1].date;
  const totalDays = Math.max(1, RepsData.daysBetween(firstDate, lastDate));

  const xFor = (date) => padL + (RepsData.daysBetween(firstDate, date) / totalDays) * innerW;

  // Y left scale: exercise metric
  const values = sessions.map(s => s[metric]).filter(v => v != null);
  const vMin = Math.floor(Math.min(...values) * 0.9);
  const vMax = Math.ceil(Math.max(...values) * 1.05);
  const vRange = vMax - vMin || 1;
  const yFor = (v) => padT + innerH - ((v - vMin) / vRange) * innerH;

  // Y right scale: bodyweight (subtle, narrow band)
  const bw = (bodyData || []).filter(b => b.date >= firstDate && b.date <= lastDate);
  const bwMin = bw.length ? Math.floor(Math.min(...bw.map(b => b.value)) - 0.5) : 0;
  const bwMax = bw.length ? Math.ceil(Math.max(...bw.map(b => b.value)) + 0.5) : 1;
  const bwRange = bwMax - bwMin || 1;
  const yForBw = (v) => padT + innerH - ((v - bwMin) / bwRange) * innerH;

  // Build paths
  const exPath = sessions.map((s, i) => {
    const x = xFor(s.date), y = yFor(s[metric]);
    return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");

  const areaPath = exPath + ` L${xFor(lastDate).toFixed(1)},${padT + innerH} L${xFor(firstDate).toFixed(1)},${padT + innerH} Z`;

  const bwPath = bw.length ? bw.map((b, i) => {
    const x = xFor(b.date), y = yForBw(b.value);
    return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ") : "";

  // Peak markers
  const peak = sessions.reduce((m, s) => s[metric] > m[metric] ? s : m, sessions[0]);

  // X axis ticks — month start across range
  const months = [];
  const seen = new Set();
  for (const s of sessions) {
    const m = s.date.slice(0, 7);
    if (!seen.has(m)) {
      seen.add(m);
      months.push({ date: s.date, label: new Date(`${s.date}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }) });
    }
  }

  // Y ticks
  const yTicks = [0, 0.5, 1].map(t => ({
    v: Math.round(vMin + vRange * (1 - t)),
    y: padT + t * innerH
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{width:"100%", height:"auto", display:"block"}}>
      {/* Grid */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={t.y} y2={t.y} className="chart-grid" />
          <text x={padL - 6} y={t.y + 3} className="chart-axis" textAnchor="end">{t.v}</text>
        </g>
      ))}

      {/* Bodyweight — subtle background line */}
      {bw.length > 1 && (
        <g>
          <path d={bwPath} fill="none" stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" opacity="0.45" />
          {bw.slice(-1).map((b, i) => (
            <text key={i} x={xFor(b.date) + 4} y={yForBw(b.value) - 4} className="chart-axis" fill="var(--muted)" opacity="0.7">
              {b.value.toFixed(1)}kg bw
            </text>
          ))}
        </g>
      )}

      {/* Exercise area + line */}
      <path d={areaPath} className="chart-area" opacity="0.5" />
      <path d={exPath} className="chart-line accent" strokeWidth="1.8" />

      {/* Session dots */}
      {sessions.map((s, i) => (
        <circle key={i} cx={xFor(s.date)} cy={yFor(s[metric])} r={s === peak ? 4 : 2.5} className="chart-dot" />
      ))}

      {/* Peak callout */}
      <g>
        <line x1={xFor(peak.date)} x2={xFor(peak.date)} y1={padT} y2={padT + innerH} stroke="var(--accent)" strokeDasharray="2 3" strokeWidth="0.8" opacity="0.4" />
        <text x={xFor(peak.date) + 6} y={yFor(peak[metric]) - 8} className="chart-axis" fill="var(--accent-ink)" fontWeight="600">
          PR {peak.maxWeight}{peak.unit} × {peak.topReps}
        </text>
      </g>

      {/* Month ticks */}
      {months.map((m, i) => (
        <text key={i} x={xFor(m.date)} y={height - 8} className="chart-axis" textAnchor="middle">{m.label}</text>
      ))}
    </svg>
  );
}

/* -----------------------------------------------------------------
   VolumeBars per session
   ----------------------------------------------------------------- */
function VolumeBars({ sessions, height = 80 }) {
  if (!sessions || !sessions.length) return null;
  const width = 720;
  const padL = 40, padR = 16, padT = 10, padB = 18;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const volumes = sessions.map(s => Number(s.volume) || 0);
  const max = Math.max(...volumes, 1);
  const step = innerW / sessions.length;
  const barWidth = Math.max(2, Math.min(22, step * 0.7));
  const yFor = (v) => padT + innerH - (v / max) * innerH;
  const ticks = [0, 0.5, 1].map(t => {
    const v = max * t;
    return { v, y: yFor(v), label: Math.round(v).toLocaleString() };
  });
  const labelEvery = Math.max(1, Math.ceil(sessions.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{width:"100%", height:"auto", display:"block", overflow:"visible"}}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={t.y} y2={t.y} className="chart-grid" />
          <text x={padL - 6} y={t.y + 3} className="chart-axis" textAnchor="end">{t.label}</text>
        </g>
      ))}
      {sessions.map((s, i) => {
        const volume = Number(s.volume) || 0;
        const x = padL + i * step + (step - barWidth) / 2;
        const y = yFor(volume);
        const h = Math.max(1, padT + innerH - y);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={h} fill="var(--accent)" opacity="0.66" rx="1.5" />
            <title>{`${RepsData.shortDate(s.date)} · ${Math.round(volume).toLocaleString()} volume`}</title>
            {(i % labelEvery === 0 || i === sessions.length - 1) && (
              <text x={x + barWidth / 2} y={height - 5} className="chart-axis" textAnchor="middle">
                {RepsData.shortDate(s.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* -----------------------------------------------------------------
   Rep distribution mini histogram
   ----------------------------------------------------------------- */
function RepDistribution({ buckets }) {
  const max = Math.max(...Object.values(buckets), 1);
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:6, alignItems:"end", height: 88}}>
      {Object.entries(buckets).map(([range, n]) => (
        <div key={range} style={{display:"flex", flexDirection:"column", alignItems:"center", gap:4, height:"100%"}}>
          <div className="mono" style={{fontSize:10, color:"var(--ink)"}}>{n}</div>
          <div style={{
            flex: 1, width: "100%",
            background: "var(--surface-2)",
            borderRadius: 3,
            display: "flex", alignItems: "flex-end"
          }}>
            <div style={{
              width:"100%",
              height: `${(n / max) * 100}%`,
              background: "var(--accent)",
              opacity: 0.7,
              borderRadius: 3
            }}></div>
          </div>
          <div className="mono" style={{fontSize: 9, color:"var(--muted)"}}>{range}</div>
        </div>
      ))}
    </div>
  );
}

/* -----------------------------------------------------------------
   Day-of-week bar
   ----------------------------------------------------------------- */
function DowBars({ buckets }) {
  const max = Math.max(...Object.values(buckets), 1);
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4}}>
      {Object.entries(buckets).map(([day, n]) => (
        <div key={day} style={{display:"flex", flexDirection:"column", alignItems:"center", gap:3}}>
          <div className="mono" style={{fontSize:10, color: n ? "var(--ink)" : "var(--faint)"}}>{n || "·"}</div>
          <div style={{
            width: "100%", height: 36,
            background: "var(--surface-2)", borderRadius: 3,
            display: "flex", alignItems: "flex-end"
          }}>
            <div style={{
              width: "100%",
              height: `${(n / max) * 100}%`,
              background: "var(--accent)", opacity: 0.7,
              borderRadius: 3
            }}></div>
          </div>
          <div className="mono" style={{fontSize: 9, color:"var(--muted)"}}>{day}</div>
        </div>
      ))}
    </div>
  );
}

/* -----------------------------------------------------------------
   ExerciseModal — the big showcase
   ----------------------------------------------------------------- */
function ExerciseModal({ name, onClose, onRemove }) {
  const [metric, setMetric] = useEM("maxWeight"); // maxWeight | est1rm | topReps | volume
  const [showAllSessions, setShowAllSessions] = useEM(false);

  const history = useEMMemo(() => RepsData.exerciseHistory(name), [name]);
  const bodyData = useEMMemo(() => RepsData.bodyData(), []);

  if (!history) {
    return (
      <div onClick={onClose} style={{position:"fixed", inset:0, zIndex:50, background:"rgba(10,10,10,0.4)", display:"grid", placeItems:"center", padding:20}}>
        <div onClick={e => e.stopPropagation()} style={{width:"min(560px,100%)", background:"var(--surface)", border:"var(--hair)", borderRadius:"var(--r-lg)", padding:20}}>
          <h3 style={{margin:0}}>{name}</h3>
          <p style={{color:"var(--muted)", fontSize:13}}>No logged history for this exercise yet.</p>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const metricLabel = {
    maxWeight: "Top set weight",
    est1rm: "Est. 1RM (Epley)",
    topReps: "Top set reps",
    volume: "Session volume"
  }[metric];

  // Stagnation detection: top set weight unchanged for the last 3 sessions
  const last3 = history.sessions.slice(-3);
  const stagnant = last3.length === 3 && last3.every(s => s.maxWeight === last3[0].maxWeight);

  // Best ever set
  const bestSet = history.sessions.reduce((best, s) => {
    return s.est1rm > (best?.est1rm || 0) ? s : best;
  }, null);

  const visibleSessions = showAllSessions ? history.sessions.slice().reverse() : history.sessions.slice().reverse().slice(0, 8);
  const unit = history.sessions[history.sessions.length-1]?.unit || "kg";

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:50,
        background:"rgba(10,10,10,0.5)",
        display:"grid", placeItems:"center", padding:20
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width:"min(920px, 100%)", maxHeight: "92vh",
        background:"var(--surface)", border:"var(--hair)",
        borderRadius:"var(--r-lg)", boxShadow:"var(--shadow-2)",
        display:"flex", flexDirection:"column", overflow:"hidden"
      }}>
        {/* Header */}
        <div className="panel-head" style={{padding:"12px 16px"}}>
          <div>
            <div style={{display:"flex", alignItems:"baseline", gap:10}}>
              <h2 style={{margin:0, fontSize:"var(--t-xl)", fontWeight:600, letterSpacing:"-0.015em"}}>{name}</h2>
              <span className={`plan-type ${history.group?.toLowerCase()}`}>{history.group}</span>
              {stagnant && <span className="chip warn">stagnant · 3 sessions</span>}
            </div>
            <div className="kpi-label" style={{marginTop:4}}>
              <span className="mono">{history.totalSets}</span> sets across <span className="mono">{history.totalSessions}</span> sessions
              <span style={{margin:"0 6px", color:"var(--faint)"}}>·</span>
              first logged <span className="mono">{RepsData.shortDate(history.firstSeen)}</span>
              <span style={{margin:"0 6px", color:"var(--faint)"}}>·</span>
              last <span className="mono">{RepsData.shortDate(history.lastSeen)}</span>
            </div>
          </div>
          <div style={{display:"flex", gap:6}}>
            <button className="btn ghost sm" onClick={() => { if (confirm(`Hide "${name}" from your exercise list?`)) { onRemove?.(name); onClose(); } }}>
              <EMI.X /> Remove
            </button>
            <button className="btn ghost sm icon-only" onClick={onClose}><EMI.X /></button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1, overflow:"auto"}}>
          {/* KPI strip */}
          <div className="kpi-row" style={{border:0, borderRadius:0, borderBottom:"var(--hair)"}}>
            <div className="kpi">
              <div className="kpi-label">PR weight</div>
              <div className="kpi-value tnum"><span>{history.peakWeight}</span><span className="unit">{unit}</span></div>
              <div className="kpi-foot mono">{history.peakWeightSession ? `${RepsData.shortDate(history.peakWeightSession.date)} · ${history.peakWeightSession.topReps} reps` : "—"}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Est. 1RM</div>
              <div className="kpi-value tnum"><span>{Math.round(history.peak1rm)}</span><span className="unit">{unit}</span></div>
              <div className="kpi-foot mono">Epley formula</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Best volume</div>
              <div className="kpi-value tnum"><span>{Math.round(history.peakVolume).toLocaleString()}</span><span className="unit">{unit}</span></div>
              <div className="kpi-foot mono">{history.peakVolumeSession ? RepsData.shortDate(history.peakVolumeSession.date) : "—"}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Avg / session</div>
              <div className="kpi-value tnum"><span>{(history.totalSets / history.totalSessions).toFixed(1)}</span><span className="unit">sets</span></div>
              <div className="kpi-foot mono">{Math.round(history.sessions.reduce((s,p)=>s+p.totalReps,0)/history.totalSessions)} reps avg</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Frequency</div>
              <div className="kpi-value tnum"><span>{(history.totalSessions / Math.max(1, RepsData.daysBetween(history.firstSeen, history.lastSeen) / 7)).toFixed(1)}</span><span className="unit">×/wk</span></div>
              <div className="kpi-foot mono">{Math.round(RepsData.daysBetween(history.firstSeen, history.lastSeen) / 7)} weeks span</div>
            </div>
          </div>

          {/* Chart */}
          <div style={{padding: "14px 16px 8px"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10}}>
              <div>
                <h3 style={{margin:0, fontSize:"var(--t-md)", fontWeight:500}}>{metricLabel}</h3>
                <div className="kpi-label" style={{marginTop:2}}>Bodyweight shown as dashed line (right scale)</div>
              </div>
              <div style={{display:"flex", gap:4}}>
                {[
                  ["maxWeight","Top weight"],
                  ["est1rm","Est. 1RM"],
                  ["topReps","Top reps"],
                  ["volume","Volume"]
                ].map(([k, l]) => (
                  <button key={k} className={`ex-tag ${metric === k ? "is-on" : ""}`} onClick={() => setMetric(k)}>{l}</button>
                ))}
              </div>
            </div>
            <ProgressionChart sessions={history.sessions} bodyData={bodyData} metric={metric} />
          </div>

          {/* Volume bars */}
          <div style={{padding: "0 16px 14px"}}>
            <div className="kpi-label" style={{marginBottom: 4}}>Session volume — weight × reps summed</div>
            <VolumeBars sessions={history.sessions} />
          </div>

          {/* Distributions row */}
          <div className="grid-2" style={{padding: "0 16px 14px", gap: 14}}>
            <div className="panel" style={{boxShadow:"none"}}>
              <div className="panel-head"><h3>Rep range distribution</h3><span className="label">{history.totalSets} sets</span></div>
              <div className="panel-body">
                <RepDistribution buckets={history.repBuckets} />
              </div>
            </div>
            <div className="panel" style={{boxShadow:"none"}}>
              <div className="panel-head"><h3>When you train this</h3><span className="label">sessions / day</span></div>
              <div className="panel-body">
                <DowBars buckets={history.dowBuckets} />
              </div>
            </div>
          </div>

          {/* Best ever set */}
          {bestSet && (
            <div style={{padding: "0 16px 14px"}}>
              <div className="panel" style={{boxShadow:"none", background:"var(--accent-soft)", borderColor: "var(--accent-line)"}}>
                <div className="panel-body" style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap: 16, padding: 14}}>
                  <div>
                    <div className="kpi-label" style={{color:"var(--accent-ink)"}}>Best ever performance</div>
                    <div style={{marginTop: 4, fontSize: "var(--t-lg)", fontWeight: 500}}>
                      <span className="mono">{bestSet.maxWeight}{bestSet.unit}</span> × <span className="mono">{bestSet.topReps}</span> reps
                      <span style={{margin:"0 6px", color:"var(--accent-ink)"}}>·</span>
                      <span style={{color:"var(--accent-ink)"}}>est 1RM <span className="mono">{Math.round(bestSet.est1rm)}{bestSet.unit}</span></span>
                    </div>
                    <div className="mono muted" style={{fontSize: 11, marginTop: 4}}>
                      {RepsData.shortDate(bestSet.date)} · {bestSet.split} · session vol {Math.round(bestSet.volume).toLocaleString()}{bestSet.unit}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Session history */}
          <div style={{padding: "0 16px 14px"}}>
            <div className="panel" style={{boxShadow:"none"}}>
              <div className="panel-head">
                <h3>Session history</h3>
                <button className="btn ghost sm" onClick={() => setShowAllSessions(s => !s)}>
                  {showAllSessions ? "Show recent" : `Show all (${history.sessions.length})`}
                </button>
              </div>
              <div className="panel-body tight">
                <table className="tab">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Split</th>
                      <th className="num">Top set</th>
                      <th className="num">All sets</th>
                      <th className="num">Reps</th>
                      <th className="num">Volume</th>
                      <th className="num">Est 1RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSessions.map((s, i) => (
                      <tr key={i}>
                        <td className="mono">{RepsData.shortDate(s.date)}</td>
                        <td className="muted">{s.split}</td>
                        <td className="num mono"><strong>{s.maxWeight}{s.unit}</strong> × {s.topReps}</td>
                        <td className="num mono muted" style={{fontSize: 10}}>
                          {s.sets.map(x => `${x.weight}×${x.reps}`).join(" · ")}
                        </td>
                        <td className="num">{s.totalReps}</td>
                        <td className="num">{Math.round(s.volume).toLocaleString()}</td>
                        <td className="num">{Math.round(s.est1rm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Notes */}
          {history.notes.length > 0 && (
            <div style={{padding: "0 16px 14px"}}>
              <div className="panel" style={{boxShadow:"none"}}>
                <div className="panel-head"><h3>Notes from sessions</h3><span className="label">{history.notes.length}</span></div>
                <div className="panel-body" style={{display: "flex", flexDirection:"column", gap: 6, maxHeight: 200, overflow: "auto"}}>
                  {history.notes.slice(0, 30).map((n, i) => (
                    <div key={i} style={{display:"grid", gridTemplateColumns:"80px 1fr", gap: 10, fontSize: 12}}>
                      <span className="mono muted">{RepsData.shortDate(n.date)}</span>
                      <span>{n.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.ExerciseModal = ExerciseModal;
