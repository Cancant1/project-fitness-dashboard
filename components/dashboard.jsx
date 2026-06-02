/* global React, RepsData, RepsCharts, RepsIcons */
const { useMemo, useState } = React;
const { Sparkline, StackedBars, LineArea } = RepsCharts;
const RI = RepsIcons;

function Kpi({ label, value, unit, foot, spark, sparkAccent = false }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value tnum">
        <span>{value}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="kpi-foot">{foot}</div>
      {spark && <div className="kpi-spark"><Sparkline data={spark} width={140} height={22} accent={sparkAccent} /></div>}
    </div>
  );
}

function Delta({ value, suffix = "", positive = true }) {
  if (value === 0 || value == null) return <span className="delta flat">±0{suffix}</span>;
  const isUp = value > 0;
  const cls = (isUp === positive) ? "up" : "down";
  const abs = Math.abs(value);
  // Integer formatting for whole numbers (e.g. session counts), 1 decimal otherwise
  const text = Number.isInteger(value) ? String(abs) : abs.toFixed(1);
  return <span className={`delta ${cls}`}>{isUp ? "▲" : "▼"} {text}{suffix}</span>;
}

function macroTargetForDate(profile, date) {
  const day = RepsData.dayName(date);
  const fromMacros = profile.macros?.[day]?.kcal;
  if (fromMacros != null) return Number(fromMacros) || 0;
  return RepsData.nutritionTargets.kcal || 0;
}

function averageKcalTarget(profile, dates = []) {
  const sourceDates = dates.length ? dates : RepsData.weekdays.map((_, i) => RepsData.addDays(RepsData.mondayOf(RepsData.TODAY), i));
  const values = sourceDates.map(date => macroTargetForDate(profile, date)).filter(v => v > 0);
  return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : (RepsData.nutritionTargets.kcal || 0);
}

function loggedSetCount(sets = []) {
  return sets.filter(x => x.repsNumber || x.reps || x.durationMinutes || x.duration || x.weight != null).length;
}

function sessionSetCount(session = {}) {
  const explicit = Number(session.performedSetCount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (session.entries || []).reduce((sum, entry) => sum + loggedSetCount(entry.sets || []), 0);
}

function isPerformedSession(session = {}) {
  return session.date <= RepsData.TODAY && session.status !== "skipped" && sessionSetCount(session) > 0;
}

function buildWeeklyVolumeSeries(sessions = [], endWeekStart = RepsData.thisWeekStart(), weeks = 12) {
  const starts = Array.from({ length: weeks }, (_, i) => RepsData.addDays(endWeekStart, (i - weeks + 1) * 7));
  const map = new Map(starts.map(week => [week, {
    week,
    label: RepsData.shortDate(week),
    Push: 0,
    Pull: 0,
    Legs: 0,
    Other: 0,
    total: 0
  }]));

  const firstWeek = starts[0];
  const lastDate = RepsData.addDays(endWeekStart, 6);
  for (const session of sessions.filter(isPerformedSession)) {
    if (session.date < firstWeek || session.date > lastDate) continue;
    const week = RepsData.mondayOf(session.date);
    const row = map.get(week);
    if (!row) continue;

    const sessionTotal = sessionSetCount(session);
    let categorized = 0;
    for (const entry of session.entries || []) {
      const movement = entry.movementGroup || RepsData.movementFor(entry.exercise);
      const bucket = ["Push", "Pull", "Legs"].includes(movement) ? movement : "Other";
      const sets = loggedSetCount(entry.sets || []);
      row[bucket] += sets;
      categorized += sets;
    }
    if (categorized < sessionTotal) row.Other += sessionTotal - categorized;
    row.total += sessionTotal;
  }
  return Array.from(map.values());
}

function formatWeightRecency(days) {
  if (days == null) return "";
  if (days === 0) return "logged today";
  if (days === 1) return "1d old";
  return `${days}d old`;
}

function typeClassForSessionName(name = "") {
  const text = String(name).toLowerCase();
  if (text.includes("push")) return "push";
  if (text.includes("pull")) return "pull";
  if (text.includes("leg") || text.includes("squat") || text.includes("hinge")) return "legs";
  if (text.includes("box")) return "box";
  if (text.includes("full")) return "full";
  return "opt";
}

function WeekStrip({ weekStart }) {
  const today = RepsData.TODAY;
  const days = RepsData.weekdays.map((d, i) => {
    const date = RepsData.addDays(weekStart, i);
    return { day: d, date, planned: RepsData.plannedFor(d), logged: RepsData.sessionStatusForDay(date) };
  });

  return (
    <div className="week-strip">
      {days.map((d, i) => {
        const isToday = d.date === today;
        const isPast = d.date < today;
        const isLogged = d.logged && d.logged.status !== "skipped" && d.logged.sets > 0;
        const isMovedAway = d.logged?.status === "moved";
        const displayPlanned = d.planned || (d.logged?.movedIn ? {
          title: d.logged.type || "Session",
          type: typeClassForSessionName(d.logged.type),
          optional: false,
          exercises: []
        } : null);
        return (
          <div key={i} className={`week-day ${isToday ? "is-today" : ""} ${isPast ? "is-past" : ""} ${displayPlanned?.type === "rest" ? "is-rest" : ""}`}>
            <div className="wd-head">
              <span className="wd-name">{d.day}</span>
              <span className="wd-date mono">{d.date.slice(8,10)}/{d.date.slice(5,7)}</span>
            </div>
            <div className="wd-plan">
              {displayPlanned ? (
                <>
                  <span className={`plan-type ${displayPlanned.type}`}>{displayPlanned.title}</span>
                  {d.logged?.movedIn && <span className="mono" style={{marginLeft:6, color:"var(--muted)", fontSize:10}}>from {d.logged.routineDay}</span>}
                  {!displayPlanned.optional && (displayPlanned.exercises || []).length > 0 && (
                    <div style={{marginTop: 6, color: "var(--muted)", fontSize: 11}}>
                      {(displayPlanned.exercises || []).slice(0,2).map(e => typeof e === "string" ? e : e.name).join(" · ")}
                    </div>
                  )}
                </>
              ) : <span className="plan-type opt">—</span>}
            </div>
            <div className="wd-status">
              <span className={`dot ${isLogged ? "ok" : (isPast && d.planned && d.planned.type !== "rest" && !isMovedAway) ? "skip" : "planned"}`}></span>
              {isLogged ? (
                <span className="mono">{d.logged.sets} sets · {d.logged.exercises} ex{d.logged.movedIn ? ` · ${d.logged.routineDay}` : ""}</span>
              ) : d.logged?.status === "skipped" ? (
                <span className="mono">skipped</span>
              ) : isMovedAway ? (
                <span className="mono">moved {RepsData.shortDate(d.logged.movedTo)}</span>
              ) : !d.planned ? (
                <span className="mono">—</span>
              ) : isPast && d.planned.type !== "rest" ? (
                <span className="mono">missed</span>
              ) : isToday ? (
                <span className="mono">today</span>
              ) : d.planned.type === "rest" ? (
                <span className="mono">rest</span>
              ) : (
                <span className="mono">planned</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ setView }) {
  const app = window.RepsState.useApp();
  const profile = app.activeProfile;
  const hasHistory = !!profile.hasHistory;

  const sessions = useMemo(() => RepsData.allSessions(), [profile]);
  const performedSessions = useMemo(() => sessions.filter(isPerformedSession), [sessions]);
  const defaultWeekStart = RepsData.thisWeekStart();
  const weeklyVol = useMemo(() => buildWeeklyVolumeSeries(performedSessions, defaultWeekStart, 12), [performedSessions, defaultWeekStart]);
  const bodyD = useMemo(() => {
    // Merge order (later wins): historical → weightEntries (Body "Log weight" modal)
    // → dailyOverrides (inline edits in Body's Daily log table). Mirrors the same
    // precedence used in views.jsx so the dashboard never lags behind the Body view.
    const hist = hasHistory ? RepsData.bodyData() : [];
    const localWeights = profile.weightEntries || [];
    const dailyOverrides = profile.dailyOverrides || {};
    const map = new Map(hist.map(b => [b.date, b]));
    for (const w of localWeights) {
      map.set(w.date, { date: w.date, value: w.weight, label: RepsData.shortDate(w.date) });
    }
    for (const [date, ov] of Object.entries(dailyOverrides)) {
      if (ov && Object.prototype.hasOwnProperty.call(ov, "weight")) {
        if (ov.weight == null) {
          map.delete(date);
        } else {
          map.set(date, { date, value: ov.weight, label: RepsData.shortDate(date) });
        }
      }
    }
    return Array.from(map.values())
      .sort((a,b) => a.date.localeCompare(b.date))
      .slice(-45);
  }, [hasHistory, profile]);
  const kcalSummary = useMemo(() => {
    const local = RepsData.mergedNutritionData?.(profile, "kcal", 14, true, { excludeToday: true })
      || RepsData.localNutritionData?.(profile, "kcal", 14, true, { excludeToday: true })
      || [];
    return { data: local, source: "logged" };
  }, [profile]);
  const kcalD = kcalSummary.data;
  const kcalAverage = kcalD.length
    ? Math.round(kcalD.reduce((s, d) => s + d.value, 0) / kcalD.length)
    : "—";
  const kcalTarget = averageKcalTarget(profile, kcalD.map(d => d.date));
  const kcalFoot = `${kcalD.length}d ${kcalSummary.source}`;
  const recentPerformedSessions = useMemo(() => performedSessions.slice(-6).reverse(), [performedSessions]);
  const tdee = useMemo(() => RepsData.adaptiveTdeeEstimate ? RepsData.adaptiveTdeeEstimate(profile, { windowDays: 28 }) : null, [profile]);
  const summary = {
    performedSessionCount: performedSessions.length
  };
  const [weekStart, setWeekStart] = useState(defaultWeekStart);

  const latestWeight = bodyD[bodyD.length - 1];
  const prevWeight = bodyD[bodyD.length - 2];
  const weightDelta = latestWeight && prevWeight ? latestWeight.value - prevWeight.value : 0;
  const daysSinceWeight = latestWeight ? RepsData.daysBetween(latestWeight.date) : null;
  const weightRecency = formatWeightRecency(daysSinceWeight);

  const thisWeekVol = weeklyVol.find(w => w.week === defaultWeekStart) || { total: 0 };
  const lastWeekVol = weeklyVol.find(w => w.week === RepsData.addDays(defaultWeekStart, -7)) || { total: 0 };
  const thisTotal = thisWeekVol.total || 0;
  const lastTotal = lastWeekVol.total || 0;
  const volSpark = weeklyVol.map(w => w.total || 0);

  // 6-week session count delta (vs prior 6 weeks)
  const cutoff6wk = RepsData.addDays(RepsData.TODAY, -42);
  const cutoff12wk = RepsData.addDays(RepsData.TODAY, -84);
  const recent6wkCount = performedSessions.filter(s => s.date >= cutoff6wk).length;
  const prior6wkCount = performedSessions.filter(s => s.date >= cutoff12wk && s.date < cutoff6wk).length;
  const sessionDelta = recent6wkCount - prior6wkCount;

  // Find the user's current block — the block whose date range contains TODAY, or the latest one.
  // Considers both historical workbook blocks and user-created customBlocks; respects renames and duration overrides.
  const currentBlockLabel = useMemo(() => {
    const today = RepsData.TODAY;
    const overrides = profile.blockNames || {};
    const startOverrides = profile.blockStartOverrides || {};
    const weeksOverride = profile.blockWeeksOverride || {};
    const ranges = [];
    if (hasHistory) {
      for (const b of RepsData.blockSummary(profile)) {
        const start = startOverrides[b.sheet] || b.weeks[0].weekStart;
        const weeks = weeksOverride[b.sheet] || b.weeks.length;
        ranges.push({
          start,
          end: RepsData.addDays(start, weeks * 7 - 1),
          label: overrides[b.sheet] || b.sheet.replace(/[()]/g, "").replace(/^Block /, "B")
        });
      }
    }
    for (const b of (profile.customBlocks || [])) {
      ranges.push({
        start: b.startDate,
        end: RepsData.addDays(b.startDate, (b.weeks || 8) * 7 - 1),
        label: b.name
      });
    }
    if (!ranges.length) return null;
    ranges.sort((a, b) => a.start.localeCompare(b.start));
    const containing = ranges.find(r => r.start <= today && today <= r.end);
    return (containing || ranges[ranges.length - 1]).label;
  }, [hasHistory, profile]);

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">
            Week of <span className="mono">{RepsData.shortDate(weekStart)}</span>
            {currentBlockLabel && <> · {currentBlockLabel}</>}
            {profile.phase && window.RepsState?.PHASES?.[profile.phase] && <> · {window.RepsState.PHASES[profile.phase].label.split(" · ")[0]}</>}
            {!hasHistory && <> · <span className="mono">{profile.name}</span></>}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn sm" onClick={() => setView?.("export")}><span className="icon"><RI.Download /></span> Export</button>
          <button className="btn primary sm" onClick={() => setView?.("log")}><span className="icon"><RI.Plus /></span> Log workout</button>
        </div>
      </div>

      {!hasHistory && performedSessions.length === 0 && (
        <div className="panel" style={{borderColor:"var(--accent-line)", background:"var(--accent-soft)"}}>
          <div className="panel-body" style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap: 16}}>
            <div>
              <h3 style={{margin:0, fontSize:"var(--t-md)", fontWeight:500, color:"var(--accent-ink)"}}>Fresh profile — no data yet</h3>
              <div className="kpi-label" style={{marginTop:4, color:"var(--accent-ink)"}}>
                Log your first workout to see weekly volume, bodyweight trends and recent sessions appear here.
              </div>
            </div>
            <button className="btn primary sm" onClick={() => setView?.("log")}><span className="icon"><RI.Plus /></span> Log first workout</button>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="kpi-row">
        <Kpi
          label="Sessions / 6 wk"
          value={recent6wkCount}
          foot={<><Delta value={sessionDelta} suffix=" vs prior" /> <span style={{marginLeft:"auto"}}>{summary.performedSessionCount} all-time</span></>}
          spark={weeklyVol.map(w => performedSessions.filter(s => RepsData.mondayOf(s.date) === w.week).length)}
        />
        <Kpi
          label="Weekly volume"
          value={thisTotal}
          unit="sets"
          foot={<><Delta value={thisTotal - lastTotal} suffix=" sets" /> <span className="mono">vs last wk</span></>}
          spark={volSpark}
          sparkAccent
        />
        <Kpi
          label="Bodyweight"
          value={latestWeight ? latestWeight.value.toFixed(1) : "—"}
          unit="kg"
          foot={<>
            {prevWeight ? <Delta value={weightDelta} suffix="kg" positive={false} /> : <span className="delta flat">first log</span>}
            {prevWeight && <span className="mono">since {RepsData.shortDate(prevWeight.date)}</span>}
            {weightRecency && <span style={{marginLeft:"auto"}} className="mono">{weightRecency}</span>}
          </>}
          spark={bodyD.slice(-30).map(b => b.value)}
        />
        <Kpi
          label="Avg kcal · 14d"
          value={kcalAverage}
          unit="kcal"
          foot={<><span className="mono">target {kcalTarget}</span><span style={{marginLeft:"auto"}} className="mono">{kcalFoot}</span></>}
          spark={kcalD.map(d=>d.value)}
        />
        <Kpi
          label="Adaptive TDEE · 28d"
          value={tdee?.ready ? tdee.adaptiveMaintenanceKcal : "—"}
          unit={tdee?.ready ? "kcal" : ""}
          foot={tdee?.ready
            ? <><span className="mono">{tdee.weeklyRateKg > 0 ? "+" : ""}{tdee.weeklyRateKg} kg/wk · {tdee.confidence.level}</span><span style={{marginLeft:"auto"}} className="mono">{tdee.counts.kcalDays}d food</span></>
            : <span className="mono">{tdee?.reason || "need 5 weights over 7d + 3 food days"}</span>}
        />
      </div>

      {/* Week strip */}
      <div>
        <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:8}}>
          <div style={{display:"flex", alignItems:"baseline", gap:10}}>
            <h3 style={{margin:0, fontSize:"var(--t-lg)", fontWeight:500}}>This week</h3>
            <span className="mono" style={{color:"var(--muted)", fontSize:11}}>
              {RepsData.shortDate(weekStart)} → {RepsData.shortDate(RepsData.addDays(weekStart,6))}
            </span>
          </div>
          <div style={{display:"flex", gap:4}}>
            <button className="btn ghost sm icon-only" onClick={() => setWeekStart(RepsData.addDays(weekStart, -7))}><RI.ChevronLeft /></button>
            <button className="btn ghost sm" onClick={() => setWeekStart(defaultWeekStart)}>This week</button>
            <button className="btn ghost sm icon-only" onClick={() => setWeekStart(RepsData.addDays(weekStart, 7))}><RI.Chevron /></button>
          </div>
        </div>
        <WeekStrip weekStart={weekStart} />
      </div>

      {/* Charts row */}
      <div className="grid-2 uneven">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Weekly set volume</h3>
              <div className="kpi-label" style={{marginTop:2}}>Last 12 weeks · Push / Pull / Legs</div>
            </div>
            <div className="chips">
              <span className="chip" style={{background:"oklch(70% 0.06 30 / 0.18)", color:"oklch(50% 0.08 30)", border:"none"}}><span className="dot" style={{background:"oklch(70% 0.06 30)"}}></span>Push</span>
              <span className="chip" style={{background:"oklch(72% 0.05 245 / 0.18)", color:"oklch(50% 0.06 245)", border:"none"}}><span className="dot" style={{background:"oklch(72% 0.05 245)"}}></span>Pull</span>
              <span className="chip" style={{background:"oklch(74% 0.06 150 / 0.18)", color:"oklch(50% 0.07 150)", border:"none"}}><span className="dot" style={{background:"oklch(74% 0.06 150)"}}></span>Legs</span>
            </div>
          </div>
          <div className="panel-body chart-card">
            <StackedBars data={weeklyVol} width={700} height={200} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Bodyweight</h3>
              <div className="kpi-label" style={{marginTop:2}}>Daily · {bodyD.length} entries</div>
            </div>
            <span className="chip">{app.activeProfile.targetWeight != null ? `target ${app.activeProfile.targetWeight.toFixed(1)}kg` : "set target in Settings"}</span>
          </div>
          <div className="panel-body chart-card">
            <LineArea data={bodyD} width={420} height={200} target={app.activeProfile.targetWeight} />
          </div>
        </div>
      </div>

      {/* Recent sessions */}
      <div>
        <div className="panel">
          <div className="panel-head">
            <h3>Recent sessions</h3>
            <button className="btn ghost sm" onClick={() => setView?.("sessions")}>View all <RI.Chevron /></button>
          </div>
          <div className="panel-body tight">
            <table className="tab">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Top lift</th>
                  <th className="num">Sets</th>
                  <th className="num">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPerformedSessions.map((s, i) => {
                  const top = s.entries[0];
                  const topSet = top?.sets?.[0];
                  const topSetText = topSet?.durationMinutes || topSet?.duration
                    ? `${topSet.durationMinutes || topSet.duration} min`
                    : topSet ? `${topSet.weight}${topSet.unit} × ${topSet.repsNumber || topSet.reps}` : "";
                  return (
                    <tr key={i}>
                      <td className="mono muted">{RepsData.shortDate(s.date)}</td>
                      <td>
                        <span style={{fontWeight:500}}>{s.split || s.nominalDay}</span>
                        <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{s.nominalDay} · w{s.weekNumber}</div>
                      </td>
                      <td>
                        {top && <>
                          <div style={{fontSize:12}}>{top.exercise}</div>
                          {topSetText && <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{topSetText}</div>}
                        </>}
                      </td>
                      <td className="num">{s.performedSetCount}</td>
                      <td className="num"><span className="chip good">done</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

window.RepsDashboard = Dashboard;
