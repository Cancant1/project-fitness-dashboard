/* global React, RepsData */
// Per-muscle weekly volume vs MEV/MAV/MRV landmarks (Phase 4).
// Effective sets: primary muscle 1.0 × working sets, secondary 0.5 ×.
// Warm-up-typed sets are excluded. Rendered on the Strength page.
(function () {
  const { useMemo, useState } = React;

  // Weekly effective-set landmarks, loosely after the RP volume guidelines.
  // [MEV, MAV, MRV] — below MEV barely maintains, MEV..MAV grows, past MRV is junk.
  const LANDMARKS = {
    "Chest":       [6, 14, 22],
    "Front delts": [0, 8, 14],
    "Side delts":  [6, 16, 26],
    "Rear delts":  [4, 12, 22],
    "Triceps":     [4, 12, 18],
    "Biceps":      [4, 14, 20],
    "Forearms":    [0, 8, 16],
    "Lats":        [6, 14, 22],
    "Upper back":  [4, 12, 20],
    "Lower back":  [2, 6, 10],
    "Quads":       [6, 12, 18],
    "Hamstrings":  [4, 10, 16],
    "Glutes":      [2, 8, 16],
    "Calves":      [4, 10, 16],
    "Abs":         [0, 8, 16]
  };
  const MUSCLES = Object.keys(LANDMARKS);

  // Pattern rules, first match wins: [regex, primary[], secondary[]].
  const MUSCLE_RULES = [
    [/boxing|conditioning|cardio|\brun\b|cycle|bike|\bpt\b/i, [], []],
    [/incline.*(press|bench)/i, ["Chest", "Front delts"], ["Triceps"]],
    [/\bdip\b|dips/i, ["Triceps", "Chest"], ["Front delts"]],
    [/bench|chest.*press|db press|push-?up/i, ["Chest"], ["Triceps", "Front delts"]],
    [/flye|\bfly\b|pec.?deck|crossover/i, ["Chest"], []],
    [/overhead.*press|\bohp\b|shoulder.*press|arnold|military/i, ["Front delts"], ["Triceps", "Side delts"]],
    [/lateral/i, ["Side delts"], []],
    [/rear.?delt|face.?pull|reverse.?fly/i, ["Rear delts"], ["Upper back"]],
    [/pushdown|tricep|skull|extension.*(overhead|cable)|oh.*ext/i, ["Triceps"], []],
    [/hammer.*curl|reverse.*curl/i, ["Biceps", "Forearms"], []],
    [/curl(?!.*leg)/i, ["Biceps"], []],
    [/pull-?up|chin-?up|pulldown/i, ["Lats"], ["Biceps", "Upper back"]],
    [/shrug/i, ["Upper back"], []],
    [/\brow\b|pendlay/i, ["Upper back", "Lats"], ["Biceps", "Rear delts"]],
    [/romanian|\brdl\b|good.?morning|hip.?hinge/i, ["Hamstrings", "Glutes"], ["Lower back"]],
    [/deadlift/i, ["Glutes", "Hamstrings"], ["Lower back", "Upper back", "Quads", "Forearms"]],
    [/leg.?curl|ham.*curl|nordic/i, ["Hamstrings"], []],
    [/leg.?ext/i, ["Quads"], []],
    [/hip.?thrust|glute/i, ["Glutes"], ["Hamstrings"]],
    [/squat|leg.?press|lunge|step.?up/i, ["Quads", "Glutes"], ["Hamstrings"]],
    [/calf/i, ["Calves"], []],
    [/crunch|\babs?\b|knee.?raise|leg.?raise|plank|rollout|woodchop|pallof/i, ["Abs"], []]
  ];

  function musclesFor(name = "") {
    for (const [re, primary, secondary] of MUSCLE_RULES) {
      if (re.test(name)) return { primary, secondary };
    }
    return { primary: [], secondary: [] };
  }

  function loggedSetHasResult(set = {}) {
    return (set.repsNumber != null && String(set.repsNumber).trim() !== "") ||
      (set.reps != null && String(set.reps).trim() !== "") ||
      set.durationMinutes || set.duration || set.note;
  }

  function computeWeek(weekStart) {
    const D = RepsData;
    const weekEnd = D.addDays(weekStart, 6);
    const tally = Object.fromEntries(MUSCLES.map(m => [m, 0]));
    const untagged = new Map();
    let sessionCount = 0;
    for (const s of D.allSessions()) {
      if (s.date < weekStart || s.date > weekEnd) continue;
      if (s.status === "skipped" || s.date > D.TODAY) continue;
      let counted = false;
      for (const e of s.entries || []) {
        const working = (e.sets || []).filter(x => loggedSetHasResult(x) && x.type !== "warmup").length;
        if (!working) continue;
        counted = true;
        const { primary, secondary } = musclesFor(e.exercise);
        if (!primary.length && !secondary.length) {
          if (!/boxing|conditioning|cardio|\brun\b|cycle|bike|\bpt\b/i.test(e.exercise)) {
            untagged.set(e.exercise, (untagged.get(e.exercise) || 0) + working);
          }
          continue;
        }
        for (const m of primary) { if (m in tally) tally[m] += working; }
        for (const m of secondary) { if (m in tally) tally[m] += working * 0.5; }
      }
      if (counted) sessionCount += 1;
    }
    const rows = MUSCLES.map(m => {
      const sets = Math.round(tally[m] * 2) / 2;
      const [mev, mav, mrv] = LANDMARKS[m];
      const status = sets <= 0 ? "none"
        : sets < mev ? "low"
        : sets <= mav ? "good"
        : sets <= mrv ? "high"
        : "over";
      return { muscle: m, sets, mev, mav, mrv, status };
    });
    return { rows, untagged: [...untagged.entries()], sessionCount };
  }

  const STATUS_LABEL = {
    low: "below MEV",
    good: "productive",
    high: "high",
    over: "over MRV"
  };

  function MuscleVolumePanel() {
    const app = window.RepsState.useApp();
    const thisWeek = RepsData.mondayOf(RepsData.TODAY);
    const [weekStart, setWeekStart] = useState(thisWeek);
    const data = useMemo(() => computeWeek(weekStart), [weekStart, app.activeProfile]);
    const trained = data.rows.filter(r => r.sets > 0);
    const untrained = data.rows.filter(r => r.sets <= 0);
    const scaleMax = Math.max(...data.rows.map(r => Math.max(r.mrv, r.sets))) * 1.08;
    const pct = (v) => `${Math.min(100, (v / scaleMax) * 100)}%`;
    const weekLabel = `${RepsData.shortDate(weekStart)} – ${RepsData.shortDate(RepsData.addDays(weekStart, 6))}`;

    return (
      <div className="panel mv-panel">
        <div className="panel-head">
          <div>
            <h3>Muscle volume</h3>
            <div className="kpi-label" style={{ marginTop: 2 }}>
              Effective working sets / week · secondary counts ×0.5 · warm-ups excluded
            </div>
          </div>
          <div className="mv-week-nav">
            <button className="btn ghost sm icon-only" onClick={() => setWeekStart(w => RepsData.addDays(w, -7))} title="Previous week" aria-label="Previous week">‹</button>
            <button className="btn ghost sm" onClick={() => setWeekStart(thisWeek)} disabled={weekStart === thisWeek}>This week</button>
            <button className="btn ghost sm icon-only" onClick={() => setWeekStart(w => RepsData.addDays(w, 7))} disabled={weekStart >= thisWeek} title="Next week" aria-label="Next week">›</button>
            <span className="panel-head-meta">{weekLabel} · {data.sessionCount} sessions</span>
          </div>
        </div>
        <div className="panel-body">
          {trained.length === 0 ? (
            <div className="records-empty">No lifting logged this week yet.</div>
          ) : (
            <div className="mv-rows">
              {trained.map(r => (
                <div key={r.muscle} className="mv-row">
                  <span className="mv-name">{r.muscle}</span>
                  <div className="mv-bar" role="img"
                       aria-label={`${r.muscle}: ${r.sets} effective sets — ${STATUS_LABEL[r.status]}. MEV ${r.mev}, MAV ${r.mav}, MRV ${r.mrv}.`}
                       title={`MEV ${r.mev} · MAV ${r.mav} · MRV ${r.mrv}`}>
                    <span className="mv-zone mv-zone-grow" style={{ left: pct(r.mev), width: `calc(${pct(r.mav)} - ${pct(r.mev)})` }}></span>
                    <span className="mv-zone mv-zone-high" style={{ left: pct(r.mav), width: `calc(${pct(r.mrv)} - ${pct(r.mav)})` }}></span>
                    <span className={`mv-fill is-${r.status}`} style={{ width: pct(r.sets) }}></span>
                    <span className="mv-tick" style={{ left: pct(r.mev) }}></span>
                    <span className="mv-tick" style={{ left: pct(r.mav) }}></span>
                    <span className="mv-tick mv-tick-mrv" style={{ left: pct(r.mrv) }}></span>
                  </div>
                  <span className="mv-sets mono tnum">{r.sets}</span>
                  <span className={`chip mv-chip is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </div>
              ))}
            </div>
          )}
          {untrained.length > 0 && trained.length > 0 && (
            <div className="mv-untrained">
              <span className="panel-head-meta">not trained:</span>
              {untrained.map(r => <span key={r.muscle} className="chip">{r.muscle}</span>)}
            </div>
          )}
          {data.untagged.length > 0 && (
            <div className="mv-untagged">
              <span className="panel-head-meta">unrecognised (not counted):</span>
              {data.untagged.map(([name, sets]) => <span key={name} className="chip warn">{name} · {sets}</span>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  window.RepsMuscleVolume = { Panel: MuscleVolumePanel, musclesFor, LANDMARKS };
})();
