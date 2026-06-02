/* global React, RepsData, RepsState */
const { useMemo: usePPM } = React;

const KCAL_PER_KG = 7700;
const MIN_FORECAST_WEIGHTS = 5;
const MIN_FORECAST_SPAN_DAYS = 7;
const MIN_FOOD_DAYS = 3;

function linearRegression(points) {
  // points: [{ x, y }]
  const n = points.length;
  if (n < 2) return null;
  let sx=0, sy=0, sxx=0, sxy=0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x*p.x; sxy += p.x*p.y; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function avgValue(rows) {
  return rows.length ? rows.reduce((s, d) => s + d.value, 0) / rows.length : null;
}

function signed(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function rateLabel(value, digits = 2) {
  return `${signed(value, digits)} kg/wk`;
}

function kcalLabel(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-GB");
}

function macroTargetAvg(profile, field) {
  const rows = Object.values(profile.macros || {}).map(m => Number(m?.[field])).filter(Number.isFinite);
  return rows.length ? rows.reduce((s, v) => s + v, 0) / rows.length : null;
}

function PhaseProgress({ profile, bodyData, kcalData }) {
  const phases = window.RepsState.PHASES;
  const phase = phases[profile.phase || "maintain"];
  const todayIso = RepsData.TODAY;

  if (!bodyData || bodyData.length === 0) {
    return (
      <div className="panel phase-progress-card">
        <div className="panel-head">
          <h3>Phase progress</h3>
          <span className="chip">{phase.label}</span>
        </div>
        <div className="panel-body empty" style={{margin: 12}}>
          Log a bodyweight entry to start tracking progress toward your target.
        </div>
      </div>
    );
  }

  const block = RepsData.currentTrainingBlock?.(profile, todayIso);
  const latestEntry = bodyData[bodyData.length - 1];
  const current = latestEntry.value;
  const target = profile.targetWeight;
  const blockStart = block?.start || bodyData[0].date;
  const exactStartEntry = bodyData.find(b => b.date === blockStart);
  const firstInBlock = bodyData.find(b => b.date >= blockStart);
  const beforeBlock = bodyData.filter(b => b.date <= blockStart).slice(-1)[0];
  const startEntry = exactStartEntry || firstInBlock || beforeBlock || bodyData[0];
  const start = startEntry.value;
  const startDate = startEntry.date;
  const chartData = bodyData.filter(b => b.date >= startDate && b.date <= todayIso);
  const blockWeightData = bodyData.filter(b => b.date >= blockStart && b.date <= todayIso);
  const ratePerWeek = phase.rate; // kg/wk (signed)

  // Observed trend follows the current goal block, not the full historical workbook.
  const trendData = blockWeightData.length >= 2 ? blockWeightData : chartData.slice(-30);
  const trendStartDate = trendData[0]?.date || startDate;
  const trendEndDate = trendData[trendData.length - 1]?.date || trendStartDate;
  const trendSpanDays = trendData.length >= 2 ? RepsData.daysBetween(trendStartDate, trendEndDate) : 0;
  const trendForecastReady = trendData.length >= MIN_FORECAST_WEIGHTS && trendSpanDays >= MIN_FORECAST_SPAN_DAYS;
  const reg = linearRegression(trendData.map(b => ({
    x: RepsData.daysBetween(trendStartDate, b.date),
    y: b.value
  })));
  const observedRatePerWeek = reg ? reg.slope * 7 : 0;

  const observedTrendLine = reg ? trendData.map(b => {
    const x = RepsData.daysBetween(trendStartDate, b.date);
    return { date: b.date, value: reg.intercept + reg.slope * x };
  }) : [];

  // Expected finish based on plan rate
  let etaDate = null, etaWeeks = null;
  if (target != null && ratePerWeek !== 0) {
    const distance = current - target; // positive when cutting, negative when bulking
    // If sign agrees with rate direction (cut: distance>0 needs rate<0, bulk reverse), proceed
    if ((distance > 0 && ratePerWeek < 0) || (distance < 0 && ratePerWeek > 0)) {
      etaWeeks = Math.abs(distance / ratePerWeek);
      etaDate = RepsData.addDays(todayIso, Math.round(etaWeeks * 7));
    }
  }

  // Observed ETA from trend
  let observedEtaCandidate = null, observedEtaWeeksCandidate = null;
  if (target != null && Math.abs(observedRatePerWeek) > 0.01) {
    const distance = current - target;
    if ((distance > 0 && observedRatePerWeek < 0) || (distance < 0 && observedRatePerWeek > 0)) {
      observedEtaWeeksCandidate = Math.abs(distance / observedRatePerWeek);
      observedEtaCandidate = RepsData.addDays(todayIso, Math.round(observedEtaWeeksCandidate * 7));
    }
  }
  const observedEta = trendForecastReady ? observedEtaCandidate : null;
  const observedEtaWeeks = trendForecastReady ? observedEtaWeeksCandidate : null;
  const distanceToTarget = target != null ? current - target : null;
  const observedWrongDirection = target != null && Math.abs(observedRatePerWeek) > 0.01 && (
    (distanceToTarget > 0 && observedRatePerWeek >= 0) ||
    (distanceToTarget < 0 && observedRatePerWeek <= 0)
  );
  const targetDistanceAbs = distanceToTarget != null ? Math.abs(distanceToTarget) : null;
  const targetFoot = target == null
    ? "set in Body"
    : targetDistanceAbs < 0.05
      ? "at target"
      : `${targetDistanceAbs.toFixed(1)}kg ${distanceToTarget > 0 ? "to lose" : "to gain"}`;

  // Actual avg kcal — last 14 days
  const maintenanceKcal = profile.maintenanceKcal || 2700;
  const targetAvgKcal = maintenanceKcal + phase.kcalDelta;
  const kcalWindowStart = RepsData.addDays(todayIso, -14);
  const last14Kcal = (kcalData || []).filter(d => d.date >= kcalWindowStart && d.date < todayIso);
  const actualAvgKcal = last14Kcal.length ? Math.round(last14Kcal.reduce((s,d)=>s+d.value,0) / last14Kcal.length) : null;
  const kcalDelta = actualAvgKcal !== null ? actualAvgKcal - targetAvgKcal : null;
  const actualVsMaintenance = actualAvgKcal !== null ? actualAvgKcal - maintenanceKcal : null;
  const foodImpliedRate = actualVsMaintenance !== null ? (actualVsMaintenance * 7) / KCAL_PER_KG : null;
  const plannedEnergyRate = (phase.kcalDelta * 7) / KCAL_PER_KG;
  const energyToTargetKcal = targetDistanceAbs != null ? targetDistanceAbs * KCAL_PER_KG : null;
  const planDaysByEnergy = energyToTargetKcal != null && phase.kcalDelta !== 0
    ? energyToTargetKcal / Math.abs(phase.kcalDelta)
    : null;

  const proteinData = RepsData.localNutritionData?.(profile, "protein", 14, true, { excludeToday: true }) || [];
  const actualAvgProtein = avgValue(proteinData);
  const proteinPerKg = actualAvgProtein !== null && current > 0 ? actualAvgProtein / current : null;
  const targetProteinAvg = macroTargetAvg(profile, "protein");
  const dataWindowFoot = trendForecastReady
    ? `${trendSpanDays}d span · forecast-ready`
    : `${trendSpanDays}d span · need ${MIN_FORECAST_WEIGHTS} weights / ${MIN_FORECAST_SPAN_DAYS}+ days`;

  // Progress bar from start → target
  let progressPct = 0;
  if (target != null && start !== target) {
    progressPct = Math.max(0, Math.min(100, ((start - current) / (start - target)) * 100));
  }

  // Build chart paths
  const width = 760, height = 180;
  const padL = 34, padR = 44, padT = 12, padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const clipId = `phase-chart-clip-${String(profile.id || "active").replace(/[^a-z0-9_-]/gi, "-")}`;
  // X scale: from the active block start to projected ETA (or today + 8 weeks if no ETA)
  const projectionEnd = [etaDate, observedEta, RepsData.addDays(todayIso, 56)].filter(Boolean).sort().slice(-1)[0];
  const minDate = block?.start || startDate;
  const maxDate = projectionEnd > todayIso ? projectionEnd : todayIso;
  const totalDays = Math.max(1, RepsData.daysBetween(minDate, maxDate));
  const xFor = (date) => padL + (RepsData.daysBetween(minDate, date) / totalDays) * innerW;

  // Y scale
  const allVals = chartData.map(b => b.value).concat(target != null ? [target] : []).concat([current + 1, current - 1, start]);
  const vMin = Math.floor(Math.min(...allVals) - 0.5);
  const vMax = Math.ceil(Math.max(...allVals) + 0.5);
  const vRange = vMax - vMin || 1;
  const yFor = (v) => padT + innerH - ((v - vMin) / vRange) * innerH;

  // Plan trajectory: from the active block start weight projecting at the selected phase rate.
  const planTrajectory = [];
  if (ratePerWeek !== 0 && target != null) {
    const distance = start - target;
    if ((distance > 0 && ratePerWeek < 0) || (distance < 0 && ratePerWeek > 0)) {
      const endDate = RepsData.addDays(startDate, Math.round(Math.abs(distance / ratePerWeek) * 7));
      planTrajectory.push({ date: startDate, value: start });
      planTrajectory.push({ date: endDate, value: target });
    }
  }

  // Observed trend extended into future
  const observedExt = [];
  if (reg) {
    const observedProjectionEnd = trendForecastReady
      ? (observedEta || RepsData.addDays(todayIso, observedWrongDirection ? 14 : 28))
      : latestEntry.date;
    const xProj = RepsData.daysBetween(trendStartDate, observedProjectionEnd);
    observedExt.push({ date: trendStartDate, value: reg.intercept });
    observedExt.push({ date: observedProjectionEnd, value: reg.intercept + reg.slope * xProj });
  }

  const bodyPath = chartData.map((b, i) => `${i === 0 ? "M" : "L"}${xFor(b.date).toFixed(1)},${yFor(b.value).toFixed(1)}`).join(" ");
  const planPath = planTrajectory.map((b, i) => `${i === 0 ? "M" : "L"}${xFor(b.date).toFixed(1)},${yFor(b.value).toFixed(1)}`).join(" ");
  const obsPath = observedExt.map((b, i) => `${i === 0 ? "M" : "L"}${xFor(b.date).toFixed(1)},${yFor(b.value).toFixed(1)}`).join(" ");

  // Month ticks
  const months = [];
  const seenM = new Set();
  for (let d = new Date(`${minDate}T00:00:00Z`); d <= new Date(`${maxDate}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const iso = d.toISOString().slice(0,10);
    const m = iso.slice(0, 7);
    if (!seenM.has(m)) {
      seenM.add(m);
      months.push({ date: iso, label: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }) });
    }
  }

  const yTicks = [vMin, Math.round((vMin+vMax)/2), vMax];

  return (
    <div className="panel phase-progress-card">
      <div className="panel-head phase-progress-head">
        <div>
          <h3>Phase progress</h3>
          <div className="kpi-label" style={{marginTop:2}}>
            {phase.label}
            {target != null && <> · target <span className="mono" style={{color:"var(--ink)"}}>{target}kg</span></>}
            {block && <> · <span className="mono" style={{color:"var(--muted)"}}>{block.label} from {RepsData.shortDate(blockStart)}</span></>}
          </div>
        </div>
        <span className={`chip ${phase.kcalDelta < 0 ? "good" : phase.kcalDelta > 0 ? "cool" : ""}`}>
          {phase.kcalDelta === 0 ? "maintain" : (phase.kcalDelta > 0 ? "+" : "") + phase.kcalDelta + " kcal"}
        </span>
      </div>

      {/* KPI tiles */}
      <div className="phase-metric-grid">
        <div className="phase-metric">
          <div className="kpi-label">Current</div>
          <div className="kpi-value tnum phase-metric-value">
            <span>{current.toFixed(1)}</span><span className="unit">kg</span>
          </div>
          <div className="mono phase-metric-foot">
            {RepsData.shortDate(latestEntry.date)}
          </div>
        </div>
        <div className="phase-metric">
          <div className="kpi-label">Target</div>
          <div className="kpi-value tnum phase-metric-value">
            <span>{target != null ? target.toFixed(1) : "—"}</span><span className="unit">kg</span>
          </div>
          <div className="mono phase-metric-foot">
            {targetFoot}
          </div>
        </div>
        <div className="phase-metric">
          <div className="kpi-label">Plan rate</div>
          <div className="kpi-value tnum phase-metric-value" style={{color: ratePerWeek < 0 ? "var(--good)" : ratePerWeek > 0 ? "var(--cool)" : "var(--muted)"}}>
            <span>{ratePerWeek > 0 ? "+" : ""}{ratePerWeek}</span><span className="unit">kg/wk</span>
          </div>
          <div className="mono phase-metric-foot">
            observed {rateLabel(observedRatePerWeek)} · {trendData.length} weights / {trendSpanDays}d
          </div>
        </div>
        <div className="phase-metric">
          <div className="kpi-label">Expected finish</div>
          <div className="kpi-value tnum phase-metric-value">
            <span>{etaDate ? RepsData.shortDate(etaDate) : "—"}</span>
          </div>
          <div className="mono phase-metric-foot">
            {etaWeeks != null ? `${etaWeeks.toFixed(1)} wks at plan` : phase.rate === 0 ? "maintain phase" : "wrong direction"}
          </div>
        </div>
        <div className="phase-metric">
          <div className="kpi-label">Target avg kcal</div>
          <div className="kpi-value tnum phase-metric-value">
            <span>{targetAvgKcal}</span>
          </div>
          <div className="mono phase-metric-foot" style={{color: kcalDelta == null ? "var(--muted)" : Math.abs(kcalDelta) <= 100 ? "var(--good)" : "var(--warn)"}}>
            {actualAvgKcal != null ? `actual ${actualAvgKcal} · ${signed(kcalDelta, 0)} vs target` : "no recent food log"}
          </div>
        </div>
      </div>

      <div className="phase-math-grid">
        <div className="phase-math-card">
          <div className="kpi-label">Evidence window</div>
          <div className="phase-math-value tnum">{trendData.length} <span>weights</span></div>
          <div className={`mono phase-math-foot ${trendForecastReady ? "good" : "warn"}`}>{dataWindowFoot}</div>
        </div>
        <div className="phase-math-card">
          <div className="kpi-label">Energy to target</div>
          <div className="phase-math-value tnum">{kcalLabel(energyToTargetKcal)} <span>kcal</span></div>
          <div className="mono phase-math-foot">
            {targetDistanceAbs != null ? `${targetDistanceAbs.toFixed(1)}kg × ${KCAL_PER_KG.toLocaleString("en-GB")}` : "set target"}
          </div>
        </div>
        <div className="phase-math-card">
          <div className="kpi-label">Food-implied rate</div>
          <div className="phase-math-value tnum">{actualAvgKcal != null ? rateLabel(foodImpliedRate) : "—"}</div>
          <div className={`mono phase-math-foot ${last14Kcal.length >= MIN_FOOD_DAYS ? "" : "warn"}`}>
            {actualAvgKcal != null
              ? `${last14Kcal.length}d logged · ${signed(actualVsMaintenance, 0)} kcal vs maintenance`
              : `need ${MIN_FOOD_DAYS}+ completed food days`}
          </div>
        </div>
        <div className="phase-math-card">
          <div className="kpi-label">Protein density</div>
          <div className="phase-math-value tnum">{proteinPerKg != null ? proteinPerKg.toFixed(2) : "—"} <span>g/kg</span></div>
          <div className="mono phase-math-foot">
            {actualAvgProtein != null
              ? `${Math.round(actualAvgProtein)}g/d · target ${targetProteinAvg != null ? Math.round(targetProteinAvg) : "—"}g`
              : "no recent protein log"}
          </div>
        </div>
        <div className="phase-math-card">
          <div className="kpi-label">Phase kcal math</div>
          <div className="phase-math-value tnum">{rateLabel(plannedEnergyRate)}</div>
          <div className="mono phase-math-foot">{signed(phase.kcalDelta, 0)} kcal/d ÷ {KCAL_PER_KG.toLocaleString("en-GB")} kcal/kg</div>
        </div>
        <div className="phase-math-card">
          <div className="kpi-label">Plan energy days</div>
          <div className="phase-math-value tnum">{planDaysByEnergy != null ? planDaysByEnergy.toFixed(0) : "—"} <span>days</span></div>
          <div className="mono phase-math-foot">
            {planDaysByEnergy != null ? `${(planDaysByEnergy / 7).toFixed(1)} wk from current weight` : "maintain phase"}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {target != null && (
        <div className="phase-progress-track">
          <div className="phase-progress-labels">
            <span className="mono">start <span>{start.toFixed(1)}kg</span> · {RepsData.shortDate(startDate)}</span>
            <span className="mono">{progressPct.toFixed(0)}% · current <span>{current.toFixed(1)}kg</span></span>
            <span className="mono">target <span>{target.toFixed(1)}kg</span></span>
          </div>
          <div className="bar-track" style={{height: 7, position: "relative"}}>
            <div className="bar-fill" style={{width: `${progressPct}%`}}></div>
            <div style={{position:"absolute", left:`${progressPct}%`, top:-2, bottom:-2, width:2, background:"var(--ink)"}}></div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="phase-chart-block">
        <div className="phase-legend">
          <span style={{display:"flex", alignItems:"center", gap:4}}><span style={{width:14, height:2, background:"var(--ink)"}}></span> Weight</span>
          <span style={{display:"flex", alignItems:"center", gap:4}}><span style={{width:14, height:2, background:"var(--accent)"}}></span> Plan trajectory</span>
          <span style={{display:"flex", alignItems:"center", gap:4}}><span style={{width:14, height:0, borderTop:"2px dashed var(--muted)"}}></span> Observed trend</span>
          {target != null && <span style={{display:"flex", alignItems:"center", gap:4}}><span style={{width:14, height:0, borderTop:"1px dotted var(--bad)"}}></span> Target</span>}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} className="phase-chart-svg">
          <defs>
            <clipPath id={clipId}>
              <rect x={padL} y={padT} width={innerW} height={innerH} />
            </clipPath>
          </defs>
          {/* Y grid */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={yFor(v)} y2={yFor(v)} className="chart-grid" />
              <text x={padL - 6} y={yFor(v) + 3} className="chart-axis" textAnchor="end">{v}</text>
            </g>
          ))}

          {/* Today vertical */}
          <line x1={xFor(todayIso)} x2={xFor(todayIso)} y1={padT} y2={padT + innerH} stroke="var(--hairline-2)" strokeDasharray="2 3" strokeWidth="1" />
          <text x={xFor(todayIso) + 4} y={padT + 10} className="chart-axis" fill="var(--muted)">today</text>

          {/* Target horizontal */}
          {target != null && (
            <>
              <line x1={padL} x2={width - padR} y1={yFor(target)} y2={yFor(target)} stroke="var(--bad)" strokeDasharray="2 3" strokeWidth="1" opacity="0.7" />
              <text x={width - padR + 4} y={yFor(target) + 3} className="chart-axis" fill="var(--bad)" fontWeight="600">{target}kg</text>
            </>
          )}

          {/* Plan trajectory */}
          {planPath && <path d={planPath} stroke="var(--accent)" strokeWidth="2" fill="none" clipPath={`url(#${clipId})`} />}

          {/* Observed trend (dashed) */}
          {obsPath && <path d={obsPath} stroke="var(--muted)" strokeWidth="1.2" fill="none" strokeDasharray="3 3" opacity="0.7" clipPath={`url(#${clipId})`} />}

          {/* Actual weight line */}
          <path d={bodyPath} stroke="var(--ink)" strokeWidth="1.6" fill="none" clipPath={`url(#${clipId})`} />

          {/* Current dot */}
          <circle cx={xFor(latestEntry.date)} cy={yFor(current)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />

          {/* ETA marker */}
          {etaDate && etaDate > todayIso && (
            <>
              <line x1={xFor(etaDate)} x2={xFor(etaDate)} y1={padT} y2={padT + innerH} stroke="var(--accent)" strokeDasharray="2 3" strokeWidth="0.8" opacity="0.5" />
              <text x={xFor(etaDate)} y={padT + innerH + 18} className="chart-axis" fill="var(--accent-ink)" fontWeight="600" textAnchor="middle">
                ETA {RepsData.shortDate(etaDate)}
              </text>
            </>
          )}

          {/* Month ticks */}
          {months.map((m, i) => (
            <text key={i} x={xFor(m.date)} y={height - 6} className="chart-axis" textAnchor="middle">{m.label}</text>
          ))}
        </svg>

        {/* Trend insight footer */}
        <div className="phase-insight">
          {target == null ? (
            <>Set a target weight above to see your finish ETA.</>
          ) : observedRatePerWeek === 0 ? (
            <>Not enough recent data to compute trend yet.</>
          ) : !trendForecastReady ? (
            <>
              Current scale slope is <strong className="mono">{rateLabel(observedRatePerWeek)}</strong>, but it is based on only
              <strong className="mono" style={{marginLeft:4}}>{trendData.length} weights over {trendSpanDays}d</strong>.
              The observed finish forecast is held until there are at least <strong className="mono">{MIN_FORECAST_WEIGHTS} weights</strong> across
              <strong className="mono" style={{marginLeft:4}}>{MIN_FORECAST_SPAN_DAYS}+ days</strong>, because first-week scale movement is often water, glycogen and gut content.
            </>
          ) : !observedEta ? (
            <>
              Observed trend is <strong className="mono">{rateLabel(observedRatePerWeek)}</strong>, but it does not currently point toward
              <strong className="mono" style={{marginLeft:4}}>{target}kg</strong>.
            </>
          ) : (
            <>
              At your <strong className="mono">{rateLabel(observedRatePerWeek)}</strong> observed pace,
              you'd hit <strong className="mono">{target}kg</strong> on
              <strong className="mono" style={{marginLeft:4}}>{observedEta ? RepsData.shortDate(observedEta) : "—"}</strong>
              {observedEta && etaDate && (
                <span style={{marginLeft: 8, color: "var(--muted)"}}>
                  ({observedEtaWeeks > etaWeeks ? "behind" : "ahead of"} plan by {Math.abs(observedEtaWeeks - etaWeeks).toFixed(1)} wk)
                </span>
              )}
              {observedWrongDirection && (
                <span style={{marginLeft: 8, color: "var(--warn)"}}>· trend going the wrong way for this phase</span>
              )}.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.PhaseProgress = PhaseProgress;
