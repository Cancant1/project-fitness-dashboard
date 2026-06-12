/* global React, RepsData, RepsIcons, RepsStrength */
// Records & PRs view — trophy case, streaks, year heatmap.
// All date math uses RepsData's ISO-string helpers (mondayOf/addDays/daysBetween)
// so the heatmap is immune to local-timezone drift.
(function () {
  const { useMemo, useState } = React;
  const RI = window.RepsIcons;

  // ---- local copies of internal helpers (not exported by helpers.js) ----
  function loggedSetCount(sets = []) {
    return sets.filter(x =>
      (x.repsNumber != null && String(x.repsNumber).trim() !== "") ||
      (x.reps != null && String(x.reps).trim() !== "") ||
      x.durationMinutes || x.duration || x.note
    ).length;
  }
  function sessionSetCount(session = {}) {
    if ((session.entries || []).length > 0) {
      return (session.entries || []).reduce((sum, e) => sum + loggedSetCount(e.sets || []), 0);
    }
    const explicit = Number(session.performedSetCount);
    return Number.isFinite(explicit) && explicit > 0 ? explicit : 0;
  }
  function isPerformedSession(s = {}) {
    return s.date <= RepsData.TODAY && s.status !== "skipped" && sessionSetCount(s) > 0;
  }

  const ACTIVE_WEEK_MIN = 2; // sessions/week for a week to count toward the streak

  // ---- data assembly ----
  function buildRecordsData() {
    const D = RepsData;
    const performed = D.allSessions().filter(isPerformedSession);

    // Lifetime totals
    let totalSets = 0, totalVolume = 0;
    const setsByDate = new Map();
    const sessionsByWeek = new Map();
    for (const s of performed) {
      const n = sessionSetCount(s);
      totalSets += n;
      setsByDate.set(s.date, (setsByDate.get(s.date) || 0) + n);
      const wk = D.mondayOf(s.date);
      sessionsByWeek.set(wk, (sessionsByWeek.get(wk) || 0) + 1);
      for (const e of s.entries || []) {
        for (const set of e.sets || []) totalVolume += D.setVolumeKg(set);
      }
    }

    // Streaks (whole weeks; the in-progress week only counts once it qualifies)
    const currentWeek = D.mondayOf(D.TODAY);
    let current = 0, longest = 0;
    if (performed.length) {
      const firstWeek = D.mondayOf(performed[0].date);
      let run = 0;
      for (let wk = firstWeek; wk <= currentWeek; wk = D.addDays(wk, 7)) {
        if ((sessionsByWeek.get(wk) || 0) >= ACTIVE_WEEK_MIN) {
          run += 1;
          if (run > longest) longest = run;
        } else if (wk !== currentWeek) {
          run = 0;
        }
      }
      let wk = currentWeek;
      if ((sessionsByWeek.get(wk) || 0) < ACTIVE_WEEK_MIN) wk = D.addDays(wk, -7); // week in progress
      for (; wk >= firstWeek; wk = D.addDays(wk, -7)) {
        if ((sessionsByWeek.get(wk) || 0) >= ACTIVE_WEEK_MIN) current += 1;
        else break;
      }
    }

    // Per-lift records + PR events
    const lifts = [];
    const prEvents = [];
    for (const ex of D.exerciseCatalog()) {
      if (!ex.sets) continue;
      const h = D.exerciseHistory(ex.name);
      if (!h || !(h.peakWeight > 0)) continue; // skip duration-only work (boxing etc.)
      const tagged = RepsStrength.tagPRs(h.sessions);
      let lastPrDate = null, prCount = 0;
      tagged.forEach((s, i) => {
        if (i === 0 || !(s.maxWeight > 0)) return; // first session is a baseline, not a PR
        const kinds = [];
        if (s.isWeightPR) kinds.push("weight");
        if (s.isE1rmPR) kinds.push("e1rm");
        if (s.isVolumePR) kinds.push("volume");
        if (!kinds.length) return;
        prCount += 1;
        if (kinds.includes("weight") || kinds.includes("e1rm")) lastPrDate = s.date;
        prEvents.push({
          date: s.date, exercise: ex.name, group: h.group, kinds,
          maxWeight: s.maxWeight, topReps: s.topReps, est1rm: s.est1rm, volume: s.volume
        });
      });
      lifts.push({
        name: ex.name,
        group: h.group,
        compound: !!ex.compound,
        totalSets: h.totalSets,
        totalSessions: h.totalSessions,
        best: h.peakWeightSession,
        e1rm: h.peak1rm,
        peakVolume: h.peakVolume,
        lastSeen: h.lastSeen,
        lastPrDate,
        prCount,
        daysSincePr: lastPrDate ? D.daysBetween(lastPrDate) : null
      });
    }
    // Compounds first (the lifts records are "about"), then isolation; e1RM within each.
    lifts.sort((a, b) =>
      (b.compound - a.compound) ||
      ((Number.isFinite(b.e1rm) ? b.e1rm : 0) - (Number.isFinite(a.e1rm) ? a.e1rm : 0)));
    prEvents.sort((a, b) => b.date.localeCompare(a.date));

    const yearStart = `${D.TODAY.slice(0, 4)}-01-01`;
    return {
      performedCount: performed.length,
      totalSets,
      totalVolume,
      liftCount: lifts.length,
      lifts,
      prEvents,
      prsThisYear: prEvents.filter(p => p.date >= yearStart).length,
      setsByDate,
      streak: { current, longest },
      firstDate: performed.length ? performed[0].date : null
    };
  }

  // ---- year heatmap (GitHub-style, Monday rows, 53 week columns) ----
  function YearHeatmap({ setsByDate }) {
    const D = RepsData;
    const WEEKS = 53;
    const CELL = 11, GAP = 2, STEP = CELL + GAP;
    const LEFT = 26, TOP = 16;
    const startMonday = D.addDays(D.mondayOf(D.TODAY), -7 * (WEEKS - 1));
    const cols = [];
    const monthLabels = [];
    let prevMonth = null;
    for (let w = 0; w < WEEKS; w++) {
      const monday = D.addDays(startMonday, w * 7);
      const month = monday.slice(5, 7);
      if (month !== prevMonth) {
        if (prevMonth !== null) {
          monthLabels.push({ x: LEFT + w * STEP, label: D.shortDate(monday).split(" ")[1] });
        }
        prevMonth = month;
      }
      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = D.addDays(monday, d);
        if (date > D.TODAY) break;
        const sets = setsByDate.get(date) || 0;
        const lvl = sets === 0 ? 0 : sets < 10 ? 1 : sets < 18 ? 2 : sets < 26 ? 3 : 4;
        days.push({ date, sets, lvl, d });
      }
      cols.push({ monday, days, w });
    }
    const width = LEFT + WEEKS * STEP;
    const height = TOP + 7 * STEP;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="records-heatmap" role="img"
           aria-label="Training sets per day, last 12 months">
        {monthLabels.map((m, i) => (
          <text key={i} x={m.x} y={10} className="chart-axis">{m.label}</text>
        ))}
        {["Mon", "Wed", "Fri"].map((lab, i) => (
          <text key={lab} x={0} y={TOP + (i * 2) * STEP + CELL - 2} className="chart-axis">{lab}</text>
        ))}
        {cols.map(col => col.days.map(cell => (
          <rect key={cell.date} x={LEFT + col.w * STEP} y={TOP + cell.d * STEP}
                width={CELL} height={CELL} rx="2.5"
                className={`hm-cell hm-l${cell.lvl}`}>
            <title>{`${cell.date} · ${cell.sets} sets`}</title>
          </rect>
        )))}
      </svg>
    );
  }

  // ---- formatting ----
  const fmtKg = (v) => v == null || !Number.isFinite(v) ? "—" : (Math.round(v * 10) / 10).toLocaleString("en-GB");
  const fmtSet = (w, reps) => {
    const r = Number(reps);
    return Number.isFinite(r) && r > 0 ? `${fmtKg(w)}kg × ${r}` : `${fmtKg(w)}kg`;
  };
  const fmtTonnes = (v) => `${(v / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}`;
  const kindLabel = { weight: "weight", e1rm: "e1RM", volume: "volume" };

  function PrBadge({ kinds }) {
    const main = kinds.includes("weight") ? "weight" : kinds.includes("e1rm") ? "e1rm" : "volume";
    const cls = main === "weight" ? "accent" : main === "e1rm" ? "cool" : "good";
    return <span className={`chip ${cls}`}>{kinds.map(k => kindLabel[k]).join(" + ")} PR</span>;
  }

  function RecordsView({ setView }) {
    const app = window.RepsState.useApp();
    const [showAllLifts, setShowAllLifts] = useState(false);
    const data = useMemo(buildRecordsData, [app.activeProfile]);
    const D = RepsData;

    if (!data.performedCount) {
      return (
        <div className="view">
          <div className="page-head">
            <div>
              <h1 className="page-title">Records</h1>
              <div className="page-sub">All-time bests, streaks and consistency</div>
            </div>
          </div>
          <div className="panel"><div className="panel-body records-empty">
            No sessions logged yet — records appear after your first workout.
          </div></div>
        </div>
      );
    }

    const recentPRs = data.prEvents.filter(p => (D.daysBetween(p.date) ?? 99) <= 60).slice(0, 14);
    const droughts = data.lifts
      .filter(l => l.compound && l.totalSessions >= 4 && l.daysSincePr != null)
      .sort((a, b) => b.daysSincePr - a.daysSincePr)
      .slice(0, 4);
    const liftRows = showAllLifts ? data.lifts : data.lifts.slice(0, 12);

    return (
      <div className="view records-view">
        <div className="page-head">
          <div>
            <h1 className="page-title">Records</h1>
            <div className="page-sub">
              All-time bests · since {D.shortDate(data.firstDate)} · {data.liftCount} lifts tracked
            </div>
          </div>
        </div>

        <div className="kpi-row records-kpis">
          <div className="kpi">
            <div className="kpi-label">Week streak</div>
            <div className="kpi-value tnum"><span>{data.streak.current}</span><span className="unit">wk</span></div>
            <div className="kpi-foot">{ACTIVE_WEEK_MIN}+ sessions / week</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Longest streak</div>
            <div className="kpi-value tnum"><span>{data.streak.longest}</span><span className="unit">wk</span></div>
            <div className="kpi-foot">all-time</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">PRs this year</div>
            <div className="kpi-value tnum"><span>{data.prsThisYear}</span></div>
            <div className="kpi-foot">{data.prEvents.length} all-time</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Sessions</div>
            <div className="kpi-value tnum"><span>{data.performedCount}</span></div>
            <div className="kpi-foot">{data.totalSets.toLocaleString("en-GB")} sets</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Lifetime volume</div>
            <div className="kpi-value tnum"><span>{fmtTonnes(data.totalVolume)}</span><span className="unit">t</span></div>
            <div className="kpi-foot">kg × reps, all lifts</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Training consistency</h3>
              <div className="kpi-label" style={{ marginTop: 2 }}>Sets per day · last 12 months</div>
            </div>
            <div className="records-hm-legend chart-axis">
              less
              {[0, 1, 2, 3, 4].map(l => <span key={l} className={`hm-swatch hm-l${l}`} />)}
              more
            </div>
          </div>
          <div className="panel-body records-heatmap-wrap">
            <YearHeatmap setsByDate={data.setsByDate} />
          </div>
        </div>

        <div className="grid-2 uneven records-grid">
          <div className="panel">
            <div className="panel-head">
              <h3>Lift records</h3>
              <span className="panel-head-meta">best converted to kg · Epley e1RM</span>
            </div>
            <div className="panel-body tight">
              <table className="tab records-table">
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th>Best set</th>
                    <th className="num">e1RM</th>
                    <th className="num">Best vol</th>
                    <th className="num">PRs</th>
                    <th>Last PR</th>
                  </tr>
                </thead>
                <tbody>
                  {liftRows.map(l => (
                    <tr key={l.name}>
                      <td>
                        <span style={{ fontWeight: 550 }}>{l.name}</span>
                        <div className="records-sub mono">
                          <span className={`plan-type ${l.group.toLowerCase() === "push" ? "push" : l.group.toLowerCase() === "pull" ? "pull" : l.group.toLowerCase() === "legs" ? "legs" : "opt"}`}>{l.group}</span>
                          {l.compound && <span className="records-compound">compound</span>}
                        </div>
                      </td>
                      <td>
                        <span className="mono tnum">{fmtSet(l.best.maxWeight, l.best.topReps)}</span>
                        <div className="records-sub mono">{D.shortDate(l.best.date)}</div>
                      </td>
                      <td className="num">{Number.isFinite(l.e1rm) ? Math.round(l.e1rm) : "—"}</td>
                      <td className="num">{fmtKg(l.peakVolume)}</td>
                      <td className="num">{l.prCount}</td>
                      <td>
                        {l.lastPrDate ? (
                          <>
                            <span className="mono tnum">{D.shortDate(l.lastPrDate)}</span>
                            {l.daysSincePr <= 14
                              ? <span className="chip good records-chip">hot</span>
                              : l.daysSincePr > 42 && (D.daysBetween(l.lastSeen) ?? 99) <= 28
                                ? <span className="chip warn records-chip">{l.daysSincePr}d dry</span>
                                : null}
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.lifts.length > 12 && (
                <div className="records-show-all">
                  <button className="btn ghost sm" onClick={() => setShowAllLifts(v => !v)}>
                    {showAllLifts ? "Show top 12" : `Show all ${data.lifts.length} lifts`}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="records-side">
            <div className="panel">
              <div className="panel-head"><h3>Recent PRs</h3><span className="panel-head-meta">last 60 days</span></div>
              <div className="panel-body tight">
                {recentPRs.length ? (
                  <div className="records-feed">
                    {recentPRs.map((p, i) => (
                      <div key={i} className="records-feed-row">
                        <div className="records-feed-main">
                          <span className="records-feed-name">{p.exercise}</span>
                          <span className="mono tnum records-feed-val">{fmtSet(p.maxWeight, p.topReps)}</span>
                        </div>
                        <div className="records-feed-meta">
                          <PrBadge kinds={p.kinds} />
                          <span className="mono">{D.shortDate(p.date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="records-empty">No PRs in the last 60 days — the next one is loading.</div>
                )}
              </div>
            </div>

            {droughts.length > 0 && (
              <div className="panel">
                <div className="panel-head"><h3>Longest without a PR</h3><span className="panel-head-meta">compounds</span></div>
                <div className="panel-body records-droughts">
                  {droughts.map(l => (
                    <div key={l.name} className="records-drought-row">
                      <span>{l.name}</span>
                      <span className="mono tnum">{l.daysSincePr}d</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Small accessor for the dashboard teaser card.
  function latestPR() {
    const data = buildRecordsData();
    return data.prEvents.length ? data.prEvents[0] : null;
  }

  window.RepsRecords = { View: RecordsView, latestPR };
})();
