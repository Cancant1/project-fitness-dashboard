/* global window */
// Data shaping helpers — derives chart-ready data from FITNESS_DATA
(function () {
  const D = window.FITNESS_DATA || {};
  function localToday() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const TODAY = localToday();

  const weekdays = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const weekdayNames = {
    monday: "Mon", mon: "Mon",
    tuesday: "Tue", tue: "Tue", tues: "Tue",
    wednesday: "Wed", wed: "Wed",
    thursday: "Thu", thu: "Thu", thur: "Thu", thurs: "Thu",
    friday: "Fri", fri: "Fri",
    saturday: "Sat", sat: "Sat",
    sunday: "Sun", sun: "Sun"
  };
  function normalizeDayKey(value) {
    if (!value) return null;
    const key = String(value).trim().toLowerCase();
    return weekdayNames[key] || weekdayNames[key.slice(0, 3)] || null;
  }
  const movementFor = (name = "") => {
    const t = name.toLowerCase();
    if (/boxing|conditioning|cardio|run|cycle|bike|pt\b/.test(t)) return "Conditioning";
    if (/squat|leg|calf|lunge|morning|romanian|deadlift split|bulgarian/.test(t)) return "Legs";
    if (/press|dips|flye|pushdown|ext|lateral|bench|push/.test(t)) return "Push";
    if (/deadlift|row|pull|chin|curl|pulldown|face|rear/.test(t)) return "Pull";
    return "Other";
  };

  function mondayOf(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - day);
    return dt.toISOString().slice(0,10);
  }
  function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0,10);
  }
  function shortDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(dt);
  }
  function dayName(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return weekdays[(dt.getUTCDay() + 6) % 7];
  }
  function daysBetween(a, b = TODAY) {
    if (!a || !b) return null;
    const pa = a.split("-").map(Number);
    const pb = b.split("-").map(Number);
    const da = Date.UTC(pa[0], pa[1]-1, pa[2]);
    const db = Date.UTC(pb[0], pb[1]-1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  // Provide a hook so the app can inject locally-logged sessions (from React state).
  // This lets the dashboard, week strip, and exercise history see new sessions without re-architecting.
  window.__repsLocalSessions = window.__repsLocalSessions || [];
  function renamedExercise(name) {
    const renames = window.__repsExerciseRenames || {};
    let current = name;
    const seen = new Set();
    while (renames[current] && !seen.has(current)) {
      seen.add(current);
      current = renames[current];
    }
    return current;
  }

  function applyExerciseRenames(session) {
    const entries = (session.entries || []).map(e => ({
      ...e,
      exercise: renamedExercise(e.exercise)
    }));
    return { ...session, entries };
  }

  function activeRoutineDays() {
    return window.__repsPlannedRoutine || window.PLANNED_ROUTINE || [];
  }

  function routineDayForSession(session = {}) {
    return normalizeDayKey(session.routineDay || session.nominalDay || session.day);
  }

  function plannedDateForSession(session = {}) {
    if (session.plannedDate) return session.plannedDate;
    const routineDay = routineDayForSession(session);
    if (!routineDay) return session.date || null;
    const weekStart = session.plannedWeekStart || session.weekStart || (session.date ? mondayOf(session.date) : null);
    if (!weekStart) return session.date || null;
    const idx = weekdays.indexOf(routineDay);
    return idx >= 0 ? addDays(weekStart, idx) : (session.date || null);
  }

  function decorateSessionSchedule(session = {}) {
    const routineDay = routineDayForSession(session);
    const plannedDate = plannedDateForSession(session);
    return {
      ...session,
      routineDay: session.routineDay || routineDay || undefined,
      plannedDate: session.plannedDate || plannedDate || undefined,
      plannedWeekStart: session.plannedWeekStart || (plannedDate ? mondayOf(plannedDate) : undefined),
      actualWeekStart: session.date ? mondayOf(session.date) : undefined
    };
  }

  function loggedSetHasResult(set = {}) {
    return (set.repsNumber != null && String(set.repsNumber).trim() !== "") ||
      (set.reps != null && String(set.reps).trim() !== "") ||
      set.durationMinutes || set.duration || set.note;
  }

  function loggedSetCount(sets = []) {
    return (sets || []).filter(loggedSetHasResult).length;
  }

  function sessionSetCount(session = {}) {
    if ((session.entries || []).length > 0) {
      return (session.entries || []).reduce((sum, entry) => sum + loggedSetCount(entry.sets || []), 0);
    }
    const explicit = Number(session.performedSetCount);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return 0;
  }

  function sessionUpdatedMs(session = {}) {
    const ms = Date.parse(session.updatedAt || session.savedAt || session.createdAt || "");
    return Number.isFinite(ms) ? ms : 0;
  }

  function sessionDataScore(session = {}) {
    const performed = session.status === "performed" ? 1 : 0;
    const detail = (session.entries || []).reduce((sum, entry) =>
      sum + (entry.sets || []).reduce((setSum, set) =>
        setSum +
        (set.repsNumber != null || set.reps != null ? 20 : 0) +
        (set.durationMinutes || set.duration ? 20 : 0) +
        (set.weight != null ? 3 : 0) +
        (set.rpe ? 2 : 0) +
        (set.note ? 5 : 0), 0), 0);
    return (sessionSetCount(session) * 10000) + (detail * 10) + ((session.entries || []).length) + performed;
  }

  function betterSession(current, candidate) {
    if (!current) return candidate;
    if (!candidate) return current;
    const currentSets = sessionSetCount(current);
    const candidateSets = sessionSetCount(candidate);
    if (candidateSets !== currentSets) return candidateSets > currentSets ? candidate : current;
    const currentTime = sessionUpdatedMs(current);
    const candidateTime = sessionUpdatedMs(candidate);
    if (candidateTime !== currentTime && currentTime && candidateTime) {
      return candidateTime > currentTime ? candidate : current;
    }
    const currentScore = sessionDataScore(current);
    const candidateScore = sessionDataScore(candidate);
    if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
    if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current;
    return current;
  }

  function localSessionKey(session = {}) {
    const plannedDate = plannedDateForSession(session);
    const routineDay = routineDayForSession(session);
    if (plannedDate && routineDay) return `slot:${plannedDate}:${routineDay}`;
    if (session.id) return `id:${session.id}`;
    return `date:${session.date || ""}:${session.split || session.nominalDay || ""}`;
  }

  function uniqueLocalSessions(local, deleted, includeDeleted) {
    const bySlot = new Map();
    for (const s of local || []) {
      if (!s?.date) continue;
      if (!includeDeleted && deleted.has(s.id)) continue;
      const key = localSessionKey(s);
      bySlot.set(key, betterSession(bySlot.get(key), s));
    }
    return Array.from(bySlot.values());
  }

  function bestSession(sessions = []) {
    return (sessions || []).reduce((best, session) => betterSession(best, session), null);
  }

  const allSessions = (options = {}) => {
    const useWorkbook = window.__repsUseWorkbookHistory !== false;
    const edits = window.__repsSessionEdits || {};
    const deleted = new Set(window.__repsDeletedSessionIds || []);
    const local = uniqueLocalSessions(window.__repsLocalSessions || [], deleted, !!options.includeDeleted);
    const localDates = new Set(local.map(s => edits[s.id]?.date || s.date));
    const workbook = useWorkbook
      ? (D.workouts?.sessions || [])
        .filter(s => s.performedSetCount > 0)
        .filter(s => !localDates.has(s.date))
      : [];
    return [...workbook, ...local]
      .filter(s => options.includeDeleted || !deleted.has(s.id))
      .map(s => ({ ...s, ...(edits[s.id] || {}) }))
      .map(decorateSessionSchedule)
      .map(applyExerciseRenames)
      .sort((a,b) => a.date.localeCompare(b.date));
  };

  function isPerformedSession(session = {}) {
    return session.date <= TODAY && session.status !== "skipped" && sessionSetCount(session) > 0;
  }

  function normalizedMovement(group, name) {
    return ["Push", "Pull", "Legs", "Other", "Conditioning"].includes(group) ? group : movementFor(name);
  }

  function exerciseCatalog(customExercises = window.__repsCustomExercises || [], hiddenExercises = window.__repsHiddenExercises || []) {
    const counts = {};
    const addExercise = (name, patch = {}) => {
      const clean = renamedExercise(String(name || "").trim());
      if (!clean) return null;
      counts[clean] ||= {
        name: clean,
        sets: 0,
        group: normalizedMovement(patch.group, clean),
        lastDate: null,
        lastWeight: null,
        lastUnit: patch.unit || "kg",
        lastReps: null,
        custom: false,
        compound: isCompoundName(clean),
        unit: patch.unit || "kg"
      };
      const incomingGroup = normalizedMovement(patch.group || counts[clean].group, clean);
      const group = !patch.custom && incomingGroup === "Other" && counts[clean].group !== "Other"
        ? counts[clean].group
        : incomingGroup;
      counts[clean] = {
        ...counts[clean],
        ...patch,
        name: clean,
        group,
        unit: patch.unit || counts[clean].unit || counts[clean].lastUnit || "kg",
        lastUnit: patch.lastUnit || patch.unit || counts[clean].lastUnit || counts[clean].unit || "kg",
        compound: patch.compound ?? counts[clean].compound ?? isCompoundName(clean)
      };
      return counts[clean];
    };

    for (const routine of activeRoutineDays()) {
      for (const ex of routine.exercises || []) {
        addExercise(ex.name, {
          group: ex.rule === "safety" ? "Conditioning" : movementFor(ex.name),
          unit: ex.unit || "kg",
          targetSets: ex.sets,
          targetReps: ex.reps,
          rule: ex.rule,
          track: ex.track,
          duration: ex.duration
        });
      }
    }

    for (const s of allSessions()) {
      for (const e of s.entries || []) {
        const row = addExercise(e.exercise, {
          group: normalizedMovement(e.movementGroup, e.exercise),
          custom: false
        });
        if (!row) continue;
        const performed = (e.sets || []).filter(loggedSetHasResult).length;
        row.sets += performed;
        if (!row.lastDate || s.date > row.lastDate) {
          row.lastDate = s.date;
          const lastSet = (e.sets || []).filter(loggedSetHasResult).slice(-1)[0];
          if (lastSet) {
            row.lastWeight = lastSet.weight;
            row.lastUnit = lastSet.unit || row.unit;
            row.lastReps = lastSet.repsNumber || lastSet.reps;
            row.durationMinutes = lastSet.durationMinutes || lastSet.duration || row.durationMinutes;
          }
        }
      }
    }

    for (const ex of customExercises || []) {
      addExercise(ex.name, {
        group: ex.group || "Other",
        unit: ex.unit || "kg",
        compound: !!ex.compound,
        custom: true
      });
    }

    const hidden = new Set((hiddenExercises || []).map(renamedExercise));
    return Object.values(counts)
      .filter(e => !hidden.has(e.name))
      .sort((a,b) => (b.sets - a.sets) || a.name.localeCompare(b.name));
  }

  // Weekly volume (last 14 weeks)
  function weeklyVolume() {
    const map = {};
    for (const s of allSessions().filter(isPerformedSession)) {
      const wk = mondayOf(s.date);
      map[wk] ||= { week: wk, label: shortDate(wk), Push: 0, Pull: 0, Legs: 0, Other: 0, total: 0 };
      let categorized = 0;
      for (const e of s.entries || []) {
        const mv = e.movementGroup || movementFor(e.exercise);
        const sets = loggedSetCount(e.sets || []);
        const bucket = ["Push", "Pull", "Legs"].includes(mv) ? mv : "Other";
        map[wk][bucket] += sets;
        categorized += sets;
      }
      const total = sessionSetCount(s);
      if (categorized < total) map[wk].Other += total - categorized;
      map[wk].total += total;
    }
    return Object.values(map).sort((a,b)=>a.week.localeCompare(b.week));
  }

  function bodyData() {
    return (D.body?.daily || []).filter(b => b.weight != null).map(b => ({
      label: shortDate(b.date), date: b.date, value: b.weight
    }));
  }

  function caloriesData() {
    return (D.body?.daily || []).filter(b => b.kcal != null).map(b => ({
      label: shortDate(b.date), date: b.date, value: b.kcal
    }));
  }

  function proteinData() {
    return (D.body?.daily || []).filter(b => b.protein != null).map(b => ({
      label: shortDate(b.date), date: b.date, value: b.protein
    }));
  }

  function localNutritionData(profile, field = "kcal", days = 14, positiveOnly = true, options = {}) {
    const excludeToday = !!options.excludeToday;
    const foodByDate = (profile && profile.foodByDate) || {};
    const overrides = (profile && profile.dailyOverrides) || {};
    const hasOverrideField = (ov) => Object.prototype.hasOwnProperty.call(ov || {}, field);
    const cutoff = days ? addDays(TODAY, -days + (excludeToday ? 0 : 1)) : "0000-01-01";
    const dates = new Set([
      ...Object.keys(foodByDate),
      ...Object.entries(overrides)
        .filter(([, ov]) => hasOverrideField(ov))
        .map(([date]) => date)
    ]);

    return Array.from(dates)
      .filter(date => date >= cutoff && date <= TODAY && (!excludeToday || date !== TODAY))
      .map(date => {
        const ov = overrides[date] || {};
        const hasOverride = hasOverrideField(ov);
        const override = ov[field];
        const entries = foodByDate[date] || [];
        const value = hasOverride
          ? (override == null ? null : Number(override))
          : entries.length
            ? entries.reduce((sum, item) => sum + (Number(item[field]) || 0), 0)
            : null;
        if (value == null || !Number.isFinite(value)) return null;
        if (positiveOnly && value <= 0) return null;
        return { label: shortDate(date), date, value };
      })
      .filter(Boolean)
      .sort((a,b) => a.date.localeCompare(b.date));
  }

  function localWeightData(profile, days = 28) {
    const cutoff = days ? addDays(TODAY, -days + 1) : "0000-01-01";
    const local = (profile?.weightEntries || window.__repsLocalWeightEntries || [])
      .filter(w => w.date >= cutoff && w.date <= TODAY)
      .map(w => ({ date: w.date, value: Number(w.weight), label: shortDate(w.date), note: w.note }));
    const map = new Map(local.filter(w => Number.isFinite(w.value)).map(w => [w.date, w]));
    for (const [date, ov] of Object.entries(profile?.dailyOverrides || {})) {
      if (date < cutoff || date > TODAY || !Object.prototype.hasOwnProperty.call(ov || {}, "weight")) continue;
      if (ov.weight == null) {
        map.delete(date);
        continue;
      }
      const value = Number(ov.weight);
      if (Number.isFinite(value)) map.set(date, { date, value, label: shortDate(date), note: ov.note });
    }
    return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
  }

  function recentSessions(n = 8) {
    return allSessions().slice(-n).reverse();
  }

  function latest(arr, key) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i][key] != null) return arr[i];
    }
    return null;
  }

  function blockSummary(profile = null) {
    const rows = D.workouts?.blockSummaries || [];
    if (profile && !profile.hasHistory) return [];
    const hidden = new Set(profile?.hiddenBlockSheets || []);
    return rows.filter(b => !hidden.has(b.sheet));
  }

  function currentTrainingBlock(profile, date = TODAY) {
    const ranges = [];
    const addRange = (range) => {
      if (!range || !range.start || !range.end) return;
      ranges.push(range);
    };

    for (const b of (profile?.customBlocks || [])) {
      addRange({
        id: b.id,
        label: b.name || "Custom block",
        start: b.startDate,
        end: addDays(b.startDate, (b.weeks || 8) * 7 - 1),
        source: "custom",
        goal: b.goal || ""
      });
    }

    if (profile?.hasHistory) {
      const planRows = D.plan?.calendar || [];
      planRows.forEach((row, i) => {
        const nextStart = planRows[i + 1]?.startDate;
        addRange({
          id: `plan-${i}`,
          label: [row.round, row.week].filter(Boolean).join(" · ") || row.phase || "Plan block",
          start: row.startDate,
          end: nextStart ? addDays(nextStart, -1) : addDays(row.startDate, 6),
          source: "plan",
          phase: row.phase,
          note: row.notes
        });
      });

      const overrides = profile.blockNames || {};
      const startOverrides = profile.blockStartOverrides || {};
      const weeksOverride = profile.blockWeeksOverride || {};
      for (const b of blockSummary(profile)) {
        const originalStart = b.weeks?.[0]?.weekStart;
        const start = startOverrides[b.sheet] || originalStart;
        const weeks = weeksOverride[b.sheet] || b.weeks?.length || 0;
        addRange({
          id: b.sheet,
          label: overrides[b.sheet] || b.sheet.replace(/[()]/g, "").replace(/^Block /, "B"),
          start,
          end: weeks ? addDays(start, weeks * 7 - 1) : start,
          source: "workbook"
        });
      }
    }

    if (!ranges.length) return null;
    const sourceRank = { custom: 0, plan: 1, workbook: 2 };
    const containing = ranges
      .filter(r => r.start <= date && date <= r.end)
      .sort((a, b) =>
        (sourceRank[a.source] ?? 9) - (sourceRank[b.source] ?? 9) ||
        b.start.localeCompare(a.start)
      )[0];
    if (containing) return containing;
    ranges.sort((a, b) => a.start.localeCompare(b.start));
    const past = ranges.filter(r => r.start <= date).slice(-1)[0];
    return past || ranges[0];
  }

  function topExercises() {
    return D.summary?.topExercisesByLoggedSets || [];
  }

  function useSessionForProgression(session = {}) {
    return session.status !== "deload" &&
      !session.ignoreForProgression &&
      !session.excludeFromProgression;
  }

  function useEntryForProgression(session = {}, entry = {}) {
    return useSessionForProgression(session) &&
      !entry.ignoreForProgression &&
      !entry.excludeFromProgression;
  }

  function exerciseLastSeen(name) {
    // Find latest session with this exercise
    const sessions = allSessions();
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      const e = s.entries.find(x => x.exercise === name && useEntryForProgression(s, x));
      if (e) {
        const set = (e.sets || []).filter(loggedSetHasResult).slice(-1)[0];
        return {
          date: s.date,
          weight: set?.weight,
          unit: set?.unit,
          reps: set?.repsNumber || set?.reps,
          durationMinutes: set?.durationMinutes || set?.duration,
          sets: e.sets?.length || 0
        };
      }
    }
    return null;
  }

  function exerciseSetTrend(name, points = 8) {
    const target = renamedExercise(String(name || "").trim());
    if (!target) return [];
    const byWeek = {};
    for (const s of allSessions()) {
      const entry = (s.entries || []).find(e => e.exercise === target);
      if (!entry) continue;
      const sets = (entry.sets || []).filter(loggedSetHasResult).length;
      if (!sets) continue;
      const week = s.weekStart || mondayOf(s.date);
      byWeek[week] = (byWeek[week] || 0) + sets;
    }
    return Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-points)
      .map(([, sets]) => sets);
  }

  function normTargetValue(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function targetMatchesExercise(entry = {}, exercise = {}) {
    if (!exercise) return false;
    const plannedSets = Number(exercise.sets);
    const entrySets = Number(entry.targetSets);
    const setsMatch = Number.isFinite(plannedSets) && Number.isFinite(entrySets) && plannedSets === entrySets;
    const repsMatch = normTargetValue(entry.targetReps) && normTargetValue(entry.targetReps) === normTargetValue(exercise.reps);
    const unit = exercise.unit || "";
    const entryUnit = (entry.sets || []).find(s => s.unit)?.unit || "";
    const unitMatch = !unit || !entryUnit || unit === entryUnit;
    return setsMatch && repsMatch && unitMatch;
  }

  function entrySnapshot(session, entry, beforeDate, matchLevel = "exercise", allowProgression = true) {
    const rawSets = (entry.sets || []).filter(loggedSetHasResult);
    if (!rawSets.length) return null;
    return {
      date: session.date,
      weekStart: session.weekStart || mondayOf(session.date),
      plannedDate: plannedDateForSession(session),
      routineDay: routineDayForSession(session),
      daysAgo: daysBetween(session.date, beforeDate),
      split: session.split || session.nominalDay || "",
      sessionRpe: session.dailyMetrics?.rpe ?? null,
      targetSets: entry.targetSets ?? null,
      targetReps: entry.targetReps ?? null,
      matchLevel,
      allowProgression,
      sets: rawSets.map(x => ({
        weight: x.weight ?? null,
        unit: x.unit || "kg",
        reps: x.repsNumber || x.reps || null,
        durationMinutes: x.durationMinutes || x.duration || null,
        rpe: x.rpe || null,
        note: x.note || null
      }))
    };
  }

  // Returns the most relevant prior session entry for `name`, strictly before
  // `beforeDate` (ISO). When routine context is supplied, prefer the same
  // routine slot before falling back to same target, then baseline-only history.
  function exerciseLastWeek(name, beforeDate, options = {}) {
    const target = renamedExercise(String(name || "").trim());
    if (!target || !beforeDate) return null;
    const routineDay = normalizeDayKey(options.routineDay || options.exercise?.routineDay);
    const exercise = options.exercise || null;
    const buckets = {
      slotTarget: [],
      slot: [],
      target: [],
      exercise: []
    };
    const sessions = allSessions();
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (!s.date || s.date >= beforeDate) continue;
      if (s.status === "skipped") continue;
      const e = (s.entries || []).find(x => x.exercise === target && useEntryForProgression(s, x));
      if (!e) continue;
      const sameSlot = routineDay && routineDayForSession(s) === routineDay;
      const sameTarget = targetMatchesExercise(e, exercise);
      const level = sameSlot && sameTarget ? "slotTarget" : sameSlot ? "slot" : sameTarget ? "target" : "exercise";
      const snap = entrySnapshot(s, e, beforeDate, level, level !== "exercise");
      if (!snap) continue;
      buckets[level].push(snap);
    }
    return buckets.slotTarget[0] || buckets.slot[0] || buckets.target[0] || buckets.exercise[0] || null;
  }

  // Parse a planned rep target like "8-12", "10", "8 - 12", "6 to 10" into {min,max}.
  function parseRepRange(reps) {
    if (reps == null) return null;
    const text = String(reps).trim();
    if (!text) return null;
    const range = text.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (range) return { min: Number(range[1]), max: Number(range[2]) };
    const one = text.match(/(\d+)/);
    if (one) return { min: Number(one[1]), max: Number(one[1]) };
    return null;
  }

  const PROGRESSION_RULE_TRIGGERS = {
    first_set_top_final_in_range: "Set 1 top + final in range",
    all_sets_top: "All sets hit top",
    hold_if_final_drops: "Hold if final set drops"
  };

  const DEFAULT_PROGRESSION_RULES = {
    compound: {
      label: "Compound",
      trigger: "first_set_top_final_in_range",
      incrementKg: 2.5,
      incrementLbs: 5,
      repDropWarningPct: 30
    },
    hypertrophy: {
      label: "Hypertrophy",
      trigger: "all_sets_top",
      incrementKg: 2.5,
      incrementLbs: 5,
      repDropWarningPct: 30
    },
    safety: {
      label: "Safety",
      trigger: "hold_if_final_drops",
      incrementKg: 0,
      incrementLbs: 0,
      repDropWarningPct: 30
    }
  };

  function normalizedProgressionRules(rules = {}) {
    return Object.fromEntries(Object.entries(DEFAULT_PROGRESSION_RULES).map(([key, defaults]) => {
      const current = rules?.[key] || {};
      const trigger = PROGRESSION_RULE_TRIGGERS[current.trigger] ? current.trigger : defaults.trigger;
      return [key, {
        ...defaults,
        ...current,
        trigger,
        label: String(current.label || defaults.label).trim() || defaults.label,
        incrementKg: Number.isFinite(Number(current.incrementKg)) ? Number(current.incrementKg) : defaults.incrementKg,
        incrementLbs: Number.isFinite(Number(current.incrementLbs)) ? Number(current.incrementLbs) : defaults.incrementLbs,
        repDropWarningPct: Number.isFinite(Number(current.repDropWarningPct)) ? Number(current.repDropWarningPct) : defaults.repDropWarningPct
      }];
    }));
  }

  function progressionRuleLabel(ruleKey, rules = null) {
    const all = normalizedProgressionRules(rules);
    return all[ruleKey]?.label || DEFAULT_PROGRESSION_RULES[ruleKey]?.label || "Hypertrophy";
  }

  function progressionTriggerLabel(trigger) {
    return PROGRESSION_RULE_TRIGGERS[trigger] || PROGRESSION_RULE_TRIGGERS.all_sets_top;
  }

  // Computes a coached suggestion for `exercise` based on the progression rule
  // cards (compound / hypertrophy / safety) and last week's actual entry.
  // Returns { tone, headline, sub, suggestedWeight, suggestedReps, deltaLabel } or null.
  function progressionSuggestion(exercise, lastEntry, options = {}) {
    if (!exercise) return null;
    const rule = DEFAULT_PROGRESSION_RULES[exercise.rule] ? exercise.rule : "hypertrophy";
    const ruleConfig = normalizedProgressionRules(options.rules)[rule];
    const range = parseRepRange(exercise.reps);
    const durationMode = exercise.track === "duration" ||
      (exercise.rule === "safety" && /min|hour|hr|boxing|pt/i.test(`${exercise.name} ${exercise.reps}`));

    if (durationMode) {
      if (!lastEntry || !lastEntry.sets.length) {
        return {
          tone: "neutral",
          headline: `${exercise.sets} × ${exercise.reps}`,
          sub: "First session — log duration as you go",
          suggestedReps: exercise.reps
        };
      }
      const last = lastEntry.sets[lastEntry.sets.length - 1];
      return {
        tone: "neutral",
        headline: `${last.durationMinutes || exercise.duration || "?"} min`,
        sub: "Match or extend slightly",
        suggestedReps: exercise.reps
      };
    }

    if (!lastEntry || !lastEntry.sets.length) {
      return {
        tone: "neutral",
        headline: `${exercise.sets} × ${exercise.reps}`,
        sub: "No prior data — set a baseline",
        suggestedReps: exercise.reps
      };
    }

    const sets = lastEntry.sets;
    const firstSet = sets[0];
    const finalSet = sets[sets.length - 1];
    const topWeight = Math.max(...sets.map(s => Number(s.weight) || 0));
    const unit = firstSet.unit || "kg";
    const lastWeight = Number(firstSet.weight) || topWeight || 0;
    const increment = Number(unit === "lbs" ? ruleConfig.incrementLbs : ruleConfig.incrementKg) || 0;
    const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
    const rangeLabel = range ? (range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`) : `${firstSet.reps ?? exercise.reps ?? "?"}`;

    if (lastEntry.allowProgression === false) {
      return {
        tone: "neutral",
        headline: `${fmt(lastWeight)}${unit} × ${rangeLabel}`,
        sub: "Different slot/target — baseline only",
        suggestedWeight: lastWeight,
        suggestedReps: exercise.reps
      };
    }

    if (!range) {
      return {
        tone: "neutral",
        headline: `${fmt(lastWeight)}${unit} × ${firstSet.reps ?? "?"}`,
        sub: "Match last week",
        suggestedWeight: lastWeight,
        suggestedReps: exercise.reps
      };
    }

    const firstReps = Number(firstSet?.reps) || 0;
    const finalReps = Number(finalSet?.reps) || 0;
    const firstHitTop = firstReps >= range.max;
    const finalInRange = finalReps >= range.min;
    const allHitTop = sets.every(s => (Number(s.reps) || 0) >= range.max);
    const dropPct = Math.max(1, Math.min(95, Number(ruleConfig.repDropWarningPct) || 30));
    const finalDropped = firstReps > 0 && finalReps < firstReps * (1 - dropPct / 100);

    if (ruleConfig.trigger === "hold_if_final_drops") {
      if (finalDropped) return {
        tone: "warn",
        headline: `Hold ${fmt(lastWeight)}${unit}`,
        sub: `Reps fell >${dropPct}% last week — match, don't push`,
        suggestedWeight: lastWeight,
        suggestedReps: exercise.reps
      };
      return {
        tone: "neutral",
        headline: `${fmt(lastWeight)}${unit} · steady`,
        sub: `${ruleConfig.label} — match or extend`,
        suggestedWeight: lastWeight,
        suggestedReps: exercise.reps
      };
    }

    if (ruleConfig.trigger === "first_set_top_final_in_range") {
      if (firstHitTop && finalInRange && increment > 0) {
        const next = lastWeight + increment;
        return {
          tone: "good",
          headline: `${fmt(next)}${unit} × ${rangeLabel}`,
          sub: `+${increment}${unit} — set 1 hit ${range.max}, final stayed in range`,
          deltaLabel: `+${increment}${unit}`,
          suggestedWeight: next,
          suggestedReps: exercise.reps
        };
      }
      const why = firstHitTop && finalInRange && increment <= 0
        ? "Progression increment is 0 — hold steady"
        : !firstHitTop
        ? `Hit ${range.max} on set 1 to bump next week`
        : `Final set dropped under ${range.min}`;
      return {
        tone: "neutral",
        headline: `${fmt(lastWeight)}${unit} × ${rangeLabel}`,
        sub: why,
        suggestedWeight: lastWeight,
        suggestedReps: exercise.reps
      };
    }

    // all_sets_top (default hypertrophy behavior)
    if (allHitTop && increment > 0) {
      const next = lastWeight + increment;
      return {
        tone: "good",
        headline: `${fmt(next)}${unit} × ${rangeLabel}`,
        sub: `+${increment}${unit} — all sets hit ${range.max}`,
        deltaLabel: `+${increment}${unit}`,
        suggestedWeight: next,
        suggestedReps: exercise.reps
      };
    }
    return {
      tone: "neutral",
      headline: `${fmt(lastWeight)}${unit} × ${rangeLabel}`,
      sub: allHitTop && increment <= 0
        ? "Progression increment is 0 — hold steady"
        : `Hit ${range.max} reps on every set to bump`,
      suggestedWeight: lastWeight,
      suggestedReps: exercise.reps
    };
  }

  // Full progression history for a single exercise
  function exerciseHistory(name) {
    const sessions = allSessions();
    const perSession = [];
    let allSets = [];
    const notes = [];

    for (const s of sessions) {
      const entry = s.entries.find(e => e.exercise === name);
      if (!entry) continue;
      const sets = (entry.sets || []).filter(x => x.repsNumber || x.reps);
      if (!sets.length) continue;
      const maxW = Math.max(...sets.map(x => x.weight || 0));
      const totalReps = sets.reduce((sum, x) => sum + (x.repsNumber || x.reps || 0), 0);
      const volume = sets.reduce((sum, x) => sum + ((x.weight || 0) * (x.repsNumber || x.reps || 0)), 0);
      // Best estimated 1RM via Epley: w * (1 + reps/30)
      const est1rm = Math.max(...sets.map(x => (x.weight || 0) * (1 + (x.repsNumber || x.reps || 0) / 30)));
      const topSet = sets.find(x => x.weight === maxW) || sets[0];
      perSession.push({
        date: s.date, weekStart: s.weekStart, split: s.split,
        unit: topSet.unit || "kg",
        maxWeight: maxW, topReps: topSet.repsNumber || topSet.reps,
        totalReps, totalSets: sets.length, volume, est1rm,
        sets: sets.map((x, i) => ({
          n: i + 1, weight: x.weight, unit: x.unit, reps: x.repsNumber || x.reps, note: x.note
        }))
      });
      allSets = allSets.concat(sets);
      (entry.notes || []).forEach(n => notes.push({ date: s.date, text: n }));
      if (entry.sets) {
        entry.sets.forEach(x => { if (x.note) notes.push({ date: s.date, text: x.note }); });
      }
    }

    if (!perSession.length) return null;

    const peakWeight = Math.max(...perSession.map(p => p.maxWeight));
    const peakWeightSession = perSession.find(p => p.maxWeight === peakWeight);
    const peakVolume = Math.max(...perSession.map(p => p.volume));
    const peakVolumeSession = perSession.find(p => p.volume === peakVolume);
    const peak1rm = Math.max(...perSession.map(p => p.est1rm));

    // Rep distribution histogram
    const repBuckets = { "1-5":0, "6-8":0, "9-12":0, "13-20":0, "21+":0 };
    allSets.forEach(s => {
      const r = s.repsNumber || s.reps || 0;
      if (r <= 5) repBuckets["1-5"]++;
      else if (r <= 8) repBuckets["6-8"]++;
      else if (r <= 12) repBuckets["9-12"]++;
      else if (r <= 20) repBuckets["13-20"]++;
      else repBuckets["21+"]++;
    });

    // Day of week distribution
    const dowBuckets = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
    perSession.forEach(p => {
      const d = dayName(p.date);
      if (d in dowBuckets) dowBuckets[d]++;
    });

    return {
      name,
      group: movementFor(name),
      sessions: perSession,
      totalSets: allSets.length,
      totalSessions: perSession.length,
      firstSeen: perSession[0].date,
      lastSeen: perSession[perSession.length - 1].date,
      peakWeight, peakWeightSession,
      peakVolume, peakVolumeSession,
      peak1rm,
      repBuckets, dowBuckets,
      notes
    };
  }

  // Build planned week: from seed program (push-legs-pull-boxing-fullbody)
  const PLANNED_WEEK = [
    { day: "Mon", title: "Push",      type: "push", focus: "Pressing + flye + triceps", exercises: ["Incline DB Press","Neutral DB Bench","Cable Pushdown","Cable Flye","OH Cable Ext"] },
    { day: "Tue", title: "Legs",      type: "legs", focus: "Squat, RDL, curls, calves",  exercises: ["Squat","Romanian Deadlift","Lying Leg Curl","Calf Raise","Knee Raise"] },
    { day: "Wed", title: "Pull",      type: "pull", focus: "Pullup, row, biceps",        exercises: ["Weighted Pullup","Seated Cable Row","Lat Pulldown","Bayesian Curl","Hammer Curl"] },
    { day: "Thu", title: "Boxing",    type: "box",  focus: "1hr PT — real fatigue",      exercises: ["Boxing PT"] },
    { day: "Fri", title: "Full Body", type: "full", focus: "DL + row + bench + arms",    exercises: ["Deadlift","CS Row","Neutral DB Bench","Cable Lateral","Cable Curl"] },
    { day: "Sat", title: "Vanity",    type: "opt",  focus: "Optional — feel good only",  exercises: ["Cable Lateral","Rear Delt Fly","Bayesian Curl"], optional: true },
    { day: "Sun", title: "Rest",      type: "rest", focus: "No lifting",                 exercises: [], optional: true }
  ];

  function plannedFor(day) {
    const key = normalizeDayKey(day) || day;
    const routine = activeRoutineDays().find(x => normalizeDayKey(x.day) === key);
    if (routine) {
      return {
        day: routine.day,
        title: routine.title,
        type: routine.type,
        focus: routine.focus,
        optional: routine.optional,
        exercises: (routine.exercises || []).map(ex => renamedExercise(ex.name || ex))
      };
    }
    // If the user has an active routine at all, keep using that custom schedule.
    if (activeRoutineDays().length > 0) return null;
    // No profile routine at all: return null so the UI shows blank.
    return null;
  }

  function sessionForDate(date, options = {}) {
    const routineDay = normalizeDayKey(options.routineDay);
    const sessions = allSessions().filter(s =>
      s.date === date &&
      s.status !== "skipped" &&
      sessionSetCount(s) > 0
    );
    if (!sessions.length) return null;
    const sameRoutine = routineDay
      ? bestSession(sessions.filter(s => routineDayForSession(s) === routineDay))
      : null;
    return sameRoutine || bestSession(sessions.filter(s => s.status === "performed")) || bestSession(sessions);
  }

  function sessionForRoutineSlot(plannedDate, routineDay) {
    const day = normalizeDayKey(routineDay) || (plannedDate ? dayName(plannedDate) : null);
    const matches = allSessions().filter(s =>
      plannedDateForSession(s) === plannedDate &&
      (!day || routineDayForSession(s) === day) &&
      s.status !== "skipped" &&
      sessionSetCount(s) > 0
    );
    return bestSession(matches.filter(s => s.status === "performed")) || bestSession(matches);
  }

  function sessionStatusForDay(date) {
    const s = sessionForDate(date);
    if (s) {
      const plannedDate = plannedDateForSession(s);
      return {
        sets: sessionSetCount(s),
        exercises: s.entries?.length || 0,
        type: s.split || s.nominalDay,
        status: s.status,
        entries: s.entries,
        session: s,
        routineDay: routineDayForSession(s),
        plannedDate,
        movedIn: !!plannedDate && plannedDate !== s.date,
        movedTo: null
      };
    }
    const routine = plannedFor(dayName(date));
    const moved = sessionForRoutineSlot(date, routine?.day || dayName(date));
    if (moved && moved.date !== date) {
      return {
        sets: 0,
        exercises: moved.entries?.length || 0,
        type: moved.split || routine?.title || moved.nominalDay,
        status: "moved",
        entries: moved.entries,
        session: moved,
        routineDay: routineDayForSession(moved) || routine?.day,
        plannedDate: date,
        movedIn: false,
        movedTo: moved.date
      };
    }
    return null;
  }

  // 14-week sparkline data per movement
  function sparklineFor(movement) {
    return weeklyVolume().slice(-14).map(w => w[movement] || 0);
  }

  function weightSparkline() {
    return bodyData().slice(-30).map(b => b.value);
  }

  function streakDays() {
    const dates = [...new Set(allSessions().map(s => s.date).filter(d => d <= TODAY))].sort();
    if (!dates.length) return 0;
    return Math.max(0, daysBetween(dates[dates.length-1]));
  }

  function thisWeekStart(iso = TODAY) { return mondayOf(iso); }

  const isCompoundName = (name = "") => {
    const t = name.toLowerCase();
    return /squat|deadlift|bench press|overhead press|pullup|pull-up|chin-up|chin up|barbell row|incline (db |dumbbell |dumbell )?press|romanian deadlift|rdl|good morning|seated cable row|chest-supported row|chest supported row|hip thrust|clean|snatch|lat pulldown/.test(t);
  };

  const TDEE_KCAL_PER_KG = 7700;
  const TDEE_MIN_WEIGHT_DAYS = 5;
  const TDEE_MIN_SPAN_DAYS = 7;
  const TDEE_MIN_KCAL_DAYS = 3;

  function roundToIncrement(value, increment = 25) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    return Math.round(Number(value) / increment) * increment;
  }

  function mergedWeightData(profile, days = null, options = {}) {
    const endDate = options.endDate || TODAY;
    const excludeToday = !!options.excludeToday;
    const maxDate = excludeToday ? addDays(endDate, -1) : endDate;
    const cutoff = days ? addDays(endDate, -days + (excludeToday ? 0 : 1)) : "0000-01-01";
    const map = new Map();

    if (profile?.hasHistory) {
      for (const b of D.body?.daily || []) {
        if (!b.date || b.weight == null || b.date < cutoff || b.date > maxDate) continue;
        const value = Number(b.weight);
        if (Number.isFinite(value)) map.set(b.date, { date: b.date, value, label: shortDate(b.date) });
      }
    }

    const localWeights = profile?.weightEntries || window.__repsLocalWeightEntries || [];
    for (const w of localWeights) {
      if (!w.date || w.date < cutoff || w.date > maxDate) continue;
      const value = Number(w.weight);
      if (Number.isFinite(value)) {
        map.set(w.date, { date: w.date, value, label: shortDate(w.date), note: w.note });
      }
    }

    for (const [date, ov] of Object.entries(profile?.dailyOverrides || {})) {
      if (date < cutoff || date > maxDate || !Object.prototype.hasOwnProperty.call(ov || {}, "weight")) continue;
      if (ov.weight == null) {
        map.delete(date);
        continue;
      }
      const value = Number(ov.weight);
      if (Number.isFinite(value)) map.set(date, { date, value, label: shortDate(date), note: ov.note });
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  function mergedNutritionData(profile, field = "kcal", days = 14, positiveOnly = true, options = {}) {
    const endDate = options.endDate || TODAY;
    const excludeToday = !!options.excludeToday;
    const maxDate = excludeToday ? addDays(endDate, -1) : endDate;
    const cutoff = days ? addDays(endDate, -days + (excludeToday ? 0 : 1)) : "0000-01-01";
    const map = new Map();

    if (profile?.hasHistory) {
      for (const b of D.body?.daily || []) {
        if (!b.date || b[field] == null || b.date < cutoff || b.date > maxDate) continue;
        const value = Number(b[field]);
        if (Number.isFinite(value)) map.set(b.date, { date: b.date, value, label: shortDate(b.date), source: "workbook" });
      }
    }

    for (const [date, entries] of Object.entries(profile?.foodByDate || {})) {
      if (date < cutoff || date > maxDate || !(entries || []).length) continue;
      const value = entries.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
      if (Number.isFinite(value)) map.set(date, { date, value, label: shortDate(date), source: "food" });
    }

    for (const [date, ov] of Object.entries(profile?.dailyOverrides || {})) {
      if (date < cutoff || date > maxDate || !Object.prototype.hasOwnProperty.call(ov || {}, field)) continue;
      if (ov[field] == null) {
        map.delete(date);
        continue;
      }
      const value = Number(ov[field]);
      if (Number.isFinite(value)) map.set(date, { date, value, label: shortDate(date), source: "override" });
    }

    return Array.from(map.values())
      .filter(d => !positiveOnly || d.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function weightTrend(rows) {
    const points = (rows || []).filter(d => d?.date && Number.isFinite(Number(d.value)));
    if (points.length < 2) return null;
    const startDate = points[0].date;
    const endDate = points[points.length - 1].date;
    const spanDays = daysBetween(startDate, endDate) || 0;
    if (spanDays <= 0) return null;

    const xs = points.map(d => daysBetween(startDate, d.date));
    const ys = points.map(d => Number(d.value));
    const xMean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const yMean = ys.reduce((s, v) => s + v, 0) / ys.length;
    const denom = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
    if (!denom) return null;
    const slope = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) / denom;
    return {
      slope,
      intercept: yMean - slope * xMean,
      startDate,
      endDate,
      spanDays
    };
  }

  function tdeeConfidence(counts, windowDays, ready) {
    if (!ready) return { level: "insufficient", label: "need data", score: 0 };
    const spanScore = Math.min(1, counts.spanDays / Math.max(TDEE_MIN_SPAN_DAYS, windowDays - 4));
    const weightScore = Math.min(1, counts.weightDays / Math.max(TDEE_MIN_WEIGHT_DAYS, Math.ceil(windowDays / 2)));
    const kcalScore = Math.min(1, counts.kcalDays / Math.max(TDEE_MIN_KCAL_DAYS, Math.ceil(windowDays * 0.55)));
    const score = Math.round((spanScore * 0.35 + weightScore * 0.3 + kcalScore * 0.35) * 100);
    const level = score >= 80 ? "high" : score >= 55 ? "medium" : "low";
    return { level, label: `${level} confidence`, score };
  }

  function adaptiveTdeeEstimate(profile, options = {}) {
    const windowDays = Number(options.windowDays) || 28;
    const phaseId = options.phaseId || profile?.phase || "maintain";
    const phase = window.RepsState?.PHASES?.[phaseId] || { label: "Maintain", rate: 0, kcalDelta: 0 };
    const weights = mergedWeightData(profile, windowDays);
    const kcalRows = mergedNutritionData(profile, "kcal", windowDays, true, { excludeToday: true });
    const trend = weightTrend(weights);
    const counts = {
      weightDays: weights.length,
      kcalDays: kcalRows.length,
      spanDays: trend?.spanDays || (weights.length >= 2 ? (daysBetween(weights[0].date, weights[weights.length - 1].date) || 0) : 0)
    };
    const requirements = {
      minWeightDays: TDEE_MIN_WEIGHT_DAYS,
      minSpanDays: TDEE_MIN_SPAN_DAYS,
      minKcalDays: TDEE_MIN_KCAL_DAYS
    };
    const missing = [];
    if (counts.weightDays < TDEE_MIN_WEIGHT_DAYS) missing.push(`${TDEE_MIN_WEIGHT_DAYS - counts.weightDays} more weigh-ins`);
    if (counts.spanDays < TDEE_MIN_SPAN_DAYS) missing.push(`${TDEE_MIN_SPAN_DAYS}+ day weight span`);
    if (counts.kcalDays < TDEE_MIN_KCAL_DAYS) missing.push(`${TDEE_MIN_KCAL_DAYS - counts.kcalDays} more food days`);

    const avgKcal = kcalRows.length ? kcalRows.reduce((s, d) => s + d.value, 0) / kcalRows.length : null;
    const ready = !!trend && missing.length === 0 && avgKcal != null;
    const tdee = ready ? Math.round(avgKcal - trend.slope * TDEE_KCAL_PER_KG) : null;
    const adaptiveMaintenanceKcal = ready ? roundToIncrement(tdee, 25) : null;
    const recommendedTargetKcal = ready ? roundToIncrement(adaptiveMaintenanceKcal + phase.kcalDelta, 25) : null;
    const weeklyRateKg = trend ? Math.round(trend.slope * 700) / 100 : null;
    const confidence = tdeeConfidence(counts, windowDays, ready);

    return {
      ready,
      windowDays,
      startDate: addDays(TODAY, -windowDays + 1),
      endDate: TODAY,
      tdee,
      adaptiveMaintenanceKcal,
      recommendedTargetKcal,
      avgKcal: avgKcal == null ? null : Math.round(avgKcal),
      weeklyRateKg,
      weightChangePerDay: trend?.slope ?? null,
      phaseId,
      phaseLabel: phase.label,
      phaseRateKgPerWeek: phase.rate,
      phaseKcalDelta: phase.kcalDelta,
      counts,
      requirements,
      confidence,
      reason: ready ? "" : missing.join(" · "),
      weightData: weights,
      kcalData: kcalRows
    };
  }

  function macroTargetsForAdaptiveTdee(profile, estimate, dayKeys = weekdays) {
    if (!profile || !estimate?.ready) return null;
    const macros = profile.macros || {};
    const values = dayKeys.map(day => Number(macros[day]?.kcal)).filter(Number.isFinite);
    const currentAvg = values.length
      ? values.reduce((s, v) => s + v, 0) / values.length
      : estimate.recommendedTargetKcal;
    const shift = estimate.recommendedTargetKcal - currentAvg;
    const nextMacros = { ...macros };
    dayKeys.forEach(day => {
      const current = Number(macros[day]?.kcal);
      const base = Number.isFinite(current) ? current : currentAvg;
      nextMacros[day] = {
        ...(macros[day] || {}),
        kcal: roundToIncrement(base + shift, 25)
      };
    });
    return {
      macros: nextMacros,
      currentAvgKcal: Math.round(currentAvg),
      targetAvgKcal: estimate.recommendedTargetKcal,
      shiftKcal: Math.round(shift)
    };
  }

  // Average bodyweight from last N days of data (merged historical + local weight entries)
  function avgBodyweight(days = 14) {
    const cutoff = addDays(TODAY, -days);
    // Historical body data
    const hist = (D.body?.daily || [])
      .filter(b => b.weight != null && b.date >= cutoff)
      .map(b => ({ date: b.date, value: b.weight }));
    // Local weight entries (from profile state, injected via window)
    const local = (window.__repsLocalWeightEntries || [])
      .filter(w => w.date >= cutoff)
      .map(w => ({ date: w.date, value: w.weight }));
    // Merge: local overrides same date
    const map = new Map(hist.map(b => [b.date, b.value]));
    for (const w of local) map.set(w.date, w.value);
    const vals = Array.from(map.values());
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  // Backwards-compatible TDEE estimation for KPI cards.
  function tdeeEstimate(profile) {
    const estimate = adaptiveTdeeEstimate(profile, { windowDays: 28 });
    if (!estimate.ready) return null;
    return {
      tdee: estimate.adaptiveMaintenanceKcal,
      avgKcal: estimate.avgKcal,
      weeklyRateKg: estimate.weeklyRateKg,
      daysUsed: estimate.counts.weightDays,
      spanDays: estimate.counts.spanDays,
      kcalDaysUsed: estimate.counts.kcalDays,
      recommendedTargetKcal: estimate.recommendedTargetKcal,
      confidence: estimate.confidence.level,
      confidenceScore: estimate.confidence.score
    };
  }

  window.RepsData = {
    TODAY,
    weekdays,
    movementFor,
    renamedExercise,
    exerciseCatalog,
    isCompoundName,
    mondayOf, addDays, shortDate, dayName, daysBetween,
    normalizeDayKey, routineDayForSession, plannedDateForSession,
    allSessions, loggedSetCount, sessionSetCount, weeklyVolume, bodyData, caloriesData, proteinData,
    localNutritionData, localWeightData, mergedWeightData, mergedNutritionData,
    recentSessions, blockSummary, currentTrainingBlock, topExercises,
    exerciseLastSeen, exerciseLastWeek, exerciseSetTrend, exerciseHistory, latest,
    parseRepRange, progressionSuggestion,
    defaultProgressionRules: DEFAULT_PROGRESSION_RULES,
    progressionRuleTriggers: PROGRESSION_RULE_TRIGGERS,
    normalizedProgressionRules, progressionRuleLabel, progressionTriggerLabel,
    plannedFor, sessionForDate, sessionForRoutineSlot, sessionStatusForDay,
    sparklineFor, weightSparkline,
    streakDays, thisWeekStart,
    avgBodyweight, adaptiveTdeeEstimate, macroTargetsForAdaptiveTdee, tdeeEstimate, roundToIncrement,
    PLANNED_WEEK,
    notableNotes: (D.workouts?.notableNotes || []).slice(0, 16),
    nutritionTargets: D.nutrition?.targets || { kcal: 2500, protein: 180 },
    foodItems: (D.nutrition?.foodItems?.length ? D.nutrition.foodItems : window.REPS_FOOD_CATALOG) || [],
    summary: D.summary || {},
    exercises: (D.workouts?.exercises || [])
  };
})();
