/* global window */
// Pure helpers for the Strength visualization page.
// Inputs come from window.RepsData.exerciseHistory(name) and RepsData.blockSummary().
(function () {
  const R = () => window.RepsData;

  // ---- PR detection ---------------------------------------------------------
  // Walk per-session entries chronologically; tag the points where the user
  // hit a new all-time best on top-set weight / total volume / estimated 1RM.
  function tagPRs(sessions) {
    let mw = -Infinity, mv = -Infinity, me = -Infinity;
    return sessions.map(s => {
      const isWeightPR = s.maxWeight > mw;
      const isVolumePR = s.volume > mv;
      const isE1rmPR = s.est1rm > me;
      if (isWeightPR) mw = s.maxWeight;
      if (isVolumePR) mv = s.volume;
      if (isE1rmPR) me = s.est1rm;
      return { ...s, isWeightPR, isVolumePR, isE1rmPR };
    });
  }

  // ---- Smart Y-axis bounds --------------------------------------------------
  // Avoid anchoring at zero when the data lives in a narrow band. Pad ~6% on
  // each side. Returns [min, max].
  function smartYBounds(sessions) {
    if (!sessions || !sessions.length) return [0, 100];
    let lo = Infinity, hi = -Infinity;
    for (const s of sessions) {
      if (s.maxWeight != null) { lo = Math.min(lo, s.maxWeight); hi = Math.max(hi, s.maxWeight); }
      if (s.est1rm != null) { lo = Math.min(lo, s.est1rm); hi = Math.max(hi, s.est1rm); }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 100];
    const range = Math.max(1, hi - lo);
    const pad = Math.max(1, range * 0.08);
    // Floor lo to nearest 0.5; ceil hi.
    const floor = Math.floor((lo - pad) * 2) / 2;
    const ceil = Math.ceil((hi + pad) * 2) / 2;
    return [floor, ceil];
  }

  // ---- Average working-set weight per session ------------------------------
  function avgSetWeight(session) {
    const sets = (session.sets || []).filter(x => x.weight != null);
    if (!sets.length) return null;
    return sets.reduce((s, x) => s + (x.weight || 0), 0) / sets.length;
  }

  // ---- Hero numbers ---------------------------------------------------------
  // Returns { delta, deltaLabel, prText, e1rm, sessions, span }
  function heroNumbers(name) {
    const history = R().exerciseHistory(name);
    if (!history || !history.sessions.length) return null;
    const tagged = tagPRs(history.sessions);
    const first = tagged[0], last = tagged[tagged.length - 1];
    const delta = (last.maxWeight - first.maxWeight) || 0;
    const peak = tagged.reduce((best, s) => (s.maxWeight > best.maxWeight ? s : best), tagged[0]);
    const peakVolume = tagged.reduce((best, s) => (s.volume > best.volume ? s : best), tagged[0]);
    const spanDays = R().daysBetween(first.date, last.date) || 0;
    const spanLabel = spanDays > 365
      ? `${(spanDays / 365).toFixed(1)} yr`
      : spanDays > 60
        ? `${Math.round(spanDays / 30)} mo`
        : `${spanDays} d`;
    return {
      delta,
      spanLabel,
      deltaLabel: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg over ${spanLabel}`,
      prText: `${peak.maxWeight}${peak.unit} × ${peak.topReps}`,
      prDate: peak.date,
      e1rm: Math.round(history.peak1rm),
      lastVolume: last.volume || 0,
      peakVolume: peakVolume.volume || 0,
      peakVolumeDate: peakVolume.date,
      volumeDelta: (last.volume || 0) - (first.volume || 0),
      sessions: tagged,
      totalSessions: history.totalSessions,
      first, last, peak
    };
  }

  // ---- Block ranges for visible-exercise window ---------------------------
  // Combines workbook blocks + customBlocks, applies overrides.
  function blockRanges(profile) {
    const overrides = (profile && profile.blockNames) || {};
    const startOverrides = (profile && profile.blockStartOverrides) || {};
    const weeksOverride = (profile && profile.blockWeeksOverride) || {};
    const ranges = [];
    if (profile?.hasHistory) {
      for (const b of R().blockSummary(profile)) {
        const originalStart = b.weeks[0]?.weekStart;
        const start = startOverrides[b.sheet] || originalStart;
        if (!start) continue;
        const weeks = weeksOverride[b.sheet] || b.weeks.length;
        const end = R().addDays(start, weeks * 7 - 1);
        ranges.push({
          id: b.sheet,
          label: overrides[b.sheet] || b.sheet.replace(/[()]/g, "").replace(/^Block /, "B"),
          start, end, source: "workbook"
        });
      }
    }
    for (const b of (profile?.customBlocks || [])) {
      ranges.push({
        id: b.id || b.name,
        label: b.name,
        start: b.startDate,
        end: R().addDays(b.startDate, (b.weeks || 8) * 7 - 1),
        source: "custom"
      });
    }
    return ranges.sort((a, b) => a.start.localeCompare(b.start));
  }

  // Which block does an ISO date fall into? Returns the block label or null.
  function blockFor(dateIso, ranges) {
    if (!dateIso) return null;
    for (const r of ranges) {
      if (r.start <= dateIso && dateIso <= r.end) return r.label;
    }
    return null;
  }

  // ---- Nearest-by-X point lookup -------------------------------------------
  // Given an array of points and a pixel-X accessor (receives the whole point),
  // find the nearest by x. Linear scan is fine for the dataset sizes we
  // care about (<= ~500).
  function nearestByX(points, xAccessor, mouseX) {
    if (!points || !points.length) return null;
    let best = points[0], bd = Infinity;
    for (const p of points) {
      const dx = Math.abs(xAccessor(p) - mouseX);
      if (dx < bd) { bd = dx; best = p; }
    }
    return best;
  }

  // ---- Compare two sessions (deltas) ---------------------------------------
  function compareSessions(a, b) {
    if (!a || !b) return null;
    return {
      weightDelta: a.maxWeight - b.maxWeight,
      e1rmDelta: a.est1rm - b.est1rm,
      volumeDelta: a.volume - b.volume,
      repsDelta: a.topReps - b.topReps
    };
  }

  // ---- Top exercises for picker --------------------------------------------
  // Returns an array of { name, group, totalSets, lastDate, sparkline } sorted by recency × frequency.
  function topExercisesForPicker(limit = 24) {
    const sessions = R().allSessions();
    const map = new Map();
    for (const s of sessions) {
      if (!s.entries) continue;
      for (const e of s.entries) {
        if (!e.exercise) continue;
        // Skip duration/conditioning items — strength chart is weight-vs-time.
        const setsWithWeight = (e.sets || []).filter(x => x.weight != null && (x.repsNumber || x.reps));
        if (!setsWithWeight.length) continue;
        const key = e.exercise;
        let row = map.get(key);
        if (!row) {
          row = { name: key, group: e.movementGroup || R().movementFor(key), totalSets: 0, lastDate: s.date, weights: [] };
          map.set(key, row);
        }
        row.totalSets += setsWithWeight.length;
        if (s.date > row.lastDate) row.lastDate = s.date;
        const maxW = Math.max(...setsWithWeight.map(x => x.weight || 0));
        row.weights.push({ date: s.date, w: maxW });
      }
    }
    const TODAY = R().TODAY;
    const out = Array.from(map.values()).map(r => {
      const daysSince = R().daysBetween(r.lastDate) ?? 999;
      // Build small sparkline (last 14 sessions)
      const recent = r.weights.slice(-14).map(x => x.w);
      return {
        ...r,
        daysSince,
        sparkline: recent,
        // Score: more sets + more recent = higher.
        score: r.totalSets * Math.exp(-daysSince / 60)
      };
    });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  // ---- Linear-regression projection ----------------------------------------
  // Fits y = a + b*x (x in days since first session) to top-set weights.
  // Returns { endDate, endValue, slopePerWeek, r2 } for `forwardDays` ahead, or null.
  function projectForward(sessions, forwardDays = 28) {
    const pts = sessions.filter(s => s.maxWeight != null);
    if (pts.length < 4) return null;
    const t0 = +new Date(pts[0].date + "T00:00:00Z");
    const xs = pts.map(p => (+new Date(p.date + "T00:00:00Z") - t0) / 86400000);
    const ys = pts.map(p => p.maxWeight);
    const n = xs.length;
    const xm = xs.reduce((s, v) => s + v, 0) / n;
    const ym = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0, ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xm) * (ys[i] - ym);
      den += (xs[i] - xm) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    const intercept = ym - slope * xm;
    for (let i = 0; i < n; i++) {
      ssTot += (ys[i] - ym) ** 2;
      ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    const lastDay = xs[xs.length - 1];
    const endDay = lastDay + forwardDays;
    const endValue = intercept + slope * endDay;
    return {
      endDate: new Date(t0 + endDay * 86400000),
      endValue,
      slopePerWeek: slope * 7,
      r2
    };
  }

  // ---- Rep buckets within a date window ------------------------------------
  // Returns an array of { bucket, count, sets } for slices of the donut.
  function repBucketsInRange(history, dateFrom, dateTo) {
    const buckets = [
      { id: "1-5", label: "1-5 reps", min: 1, max: 5, count: 0 },
      { id: "6-8", label: "6-8 reps", min: 6, max: 8, count: 0 },
      { id: "9-12", label: "9-12 reps", min: 9, max: 12, count: 0 },
      { id: "13-20", label: "13-20 reps", min: 13, max: 20, count: 0 },
      { id: "21+", label: "21+ reps", min: 21, max: Infinity, count: 0 }
    ];
    if (!history) return buckets;
    for (const s of history.sessions) {
      if (dateFrom && s.date < dateFrom) continue;
      if (dateTo && s.date > dateTo) continue;
      for (const set of (s.sets || [])) {
        const r = set.reps;
        if (!r) continue;
        const b = buckets.find(b => r >= b.min && r <= b.max);
        if (b) b.count++;
      }
    }
    return buckets;
  }

  // ---- 26-week heatmap cells ------------------------------------------------
  // Returns rows[7][26] of { date, sets } for the last 26 weeks ending today.
  // Empty days have sets=0.
  function heatmapCells(history, weeks = 26) {
    const TODAY = R().TODAY;
    const sundayOf = (iso) => {
      const monday = R().mondayOf(iso);
      return R().addDays(monday, 6);
    };
    const endSunday = sundayOf(TODAY);
    const startMonday = R().addDays(R().mondayOf(TODAY), -7 * (weeks - 1));
    // Count sets per date for the exercise
    const byDate = new Map();
    if (history) {
      for (const s of history.sessions) {
        byDate.set(s.date, (s.sets || []).length);
      }
    }
    const cols = [];
    for (let w = 0; w < weeks; w++) {
      const weekMonday = R().addDays(startMonday, w * 7);
      const col = [];
      for (let d = 0; d < 7; d++) {
        const dateIso = R().addDays(weekMonday, d);
        col.push({ date: dateIso, sets: byDate.get(dateIso) || 0, future: dateIso > TODAY });
      }
      cols.push(col);
    }
    return { cols, startMonday, endSunday };
  }

  // ---- Per-block series for small multiples --------------------------------
  // Returns [{ block, start, end, sessions }] where sessions is the chronological
  // subset of this exercise's sessions inside the block's date range.
  function perBlockSessions(history, ranges) {
    if (!history) return [];
    return ranges.map(r => ({
      block: r,
      start: r.start,
      end: r.end,
      sessions: history.sessions.filter(s => s.date >= r.start && s.date <= r.end)
    })).filter(b => b.sessions.length > 0);
  }

  window.RepsStrength = {
    tagPRs,
    smartYBounds,
    avgSetWeight,
    heroNumbers,
    blockRanges,
    blockFor,
    nearestByX,
    compareSessions,
    topExercisesForPicker,
    projectForward,
    repBucketsInRange,
    heatmapCells,
    perBlockSessions
  };
})();
