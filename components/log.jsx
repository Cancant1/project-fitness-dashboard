/* global React, RepsData, RepsIcons, PLANNED_ROUTINE */
const { useState, useMemo } = React;
const LIcons = RepsIcons;

function isDurationExercise(exercise = {}) {
  return exercise.track === "duration" ||
    (exercise.rule === "safety" && /min|hour|hr|boxing|pt/i.test(`${exercise.name} ${exercise.reps}`));
}

function durationFromTarget(exercise = {}) {
  if (exercise.duration != null) return String(exercise.duration);
  const m = String(exercise.reps || "").match(/(\d+(?:\.\d+)?)\s*(min|m|hour|hr|h)/i);
  if (!m) return "";
  const value = Number(m[1]);
  return /hour|hr|h/i.test(m[2]) ? String(value * 60) : String(value);
}

function targetFromCatalogItem(item) {
  if (!item) return "3 × 8-12";
  const sets = item.targetSets || 3;
  const reps = item.targetReps || (item.duration ? `${item.duration} min` : "8-12");
  return `${sets} × ${reps}`;
}

// Compact one-line summary of last week's sets for the collapsed exercise row.
// Reads from RepsData.exerciseLastWeek so it considers only entries strictly
// before the current session's week, matching the visible weekly table.
// to the left of "this week".
function LastWeekCell({ exerciseName, beforeDate }) {
  const last = window.RepsData.exerciseLastWeek?.(exerciseName, beforeDate);
  if (!last) {
    return (
      <div className="ex-lastweek empty">
        <div className="ex-lw-head">LAST</div>
        <div className="ex-lw-body">no history</div>
      </div>
    );
  }
  const parts = last.sets.map(s => {
    if (s.durationMinutes) return `${s.durationMinutes}m`;
    if (s.weight == null && s.reps == null) return "—";
    const w = s.weight == null ? "?" : s.weight;
    const r = s.reps == null ? "?" : s.reps;
    return `${w}×${r}`;
  });
  return (
    <div className="ex-lastweek">
      <div className="ex-lw-head">
        LAST · <span className="ex-lw-date">{window.RepsData.shortDate(last.date)}</span>
      </div>
      <div className="ex-lw-body mono" title={parts.join(", ")}>
        {parts.join("  ·  ")}
      </div>
    </div>
  );
}

// Coached suggestion for this week, derived from the progression rule
// (compound / hypertrophy / safety) and last week's actual sets.
function ThisWeekCell({ exercise, lastEntry }) {
  const sg = window.RepsData.progressionSuggestion?.(exercise, lastEntry);
  if (!sg) {
    return (
      <div className="ex-suggest">
        <div className="ex-sg-head">THIS WEEK</div>
        <div className="ex-sg-body mono">{exercise.sets} × {exercise.reps}</div>
      </div>
    );
  }
  const arrow = sg.tone === "good" ? "↑" : sg.tone === "warn" ? "↓" : "→";
  return (
    <div className={`ex-suggest tone-${sg.tone || "neutral"}`}>
      <div className="ex-sg-head">
        THIS WEEK{sg.deltaLabel ? <> · <span className="ex-sg-delta">{arrow} {sg.deltaLabel}</span></> : null}
      </div>
      <div className="ex-sg-body mono">{sg.headline}</div>
      <div className="ex-sg-sub">{sg.sub}</div>
    </div>
  );
}

const LOG_RULE_KEYS = ["compound", "hypertrophy", "safety"];

function normalizedRulesForProfile(profile = {}) {
  return window.RepsData.normalizedProgressionRules
    ? window.RepsData.normalizedProgressionRules(profile.progressionRules || {})
    : (profile.progressionRules || window.RepsState?.DEFAULT_PROGRESSION_RULES || {});
}

function progressionRuleOptions(profile = {}) {
  const rules = normalizedRulesForProfile(profile);
  return LOG_RULE_KEYS.map(key => ({ key, label: rules[key]?.label || key }));
}

function ruleUsageCounts(routineDays = []) {
  const counts = Object.fromEntries(LOG_RULE_KEYS.map(key => [key, 0]));
  (routineDays || []).forEach(day => (day.exercises || []).forEach(ex => {
    const key = LOG_RULE_KEYS.includes(ex.rule) ? ex.rule : "hypertrophy";
    counts[key] += 1;
  }));
  return counts;
}

function ruleTriggerLabel(trigger) {
  return window.RepsData.progressionTriggerLabel
    ? window.RepsData.progressionTriggerLabel(trigger)
    : trigger;
}

function ProgressionRuleStudio({ profile, updateProfile, routineDays = [], compact = false, title = "Progression Studio" }) {
  const rules = normalizedRulesForProfile(profile);
  const defaults = window.RepsData.defaultProgressionRules || window.RepsState?.DEFAULT_PROGRESSION_RULES || {};
  const triggers = window.RepsData.progressionRuleTriggers || {
    first_set_top_final_in_range: "Set 1 top + final in range",
    all_sets_top: "All sets hit top",
    hold_if_final_drops: "Hold if final set drops"
  };
  const usage = ruleUsageCounts(routineDays);
  const saveRules = (next) => updateProfile?.(profile.id, { progressionRules: next });
  const updateRule = (key, patch) => saveRules({ ...rules, [key]: { ...rules[key], ...patch } });
  const resetRule = (key) => saveRules({ ...rules, [key]: { ...(defaults[key] || rules[key]) } });

  return (
    <div className={`progression-studio ${compact ? "is-compact" : ""}`}>
      <div className="body-band-head progression-studio-head">
        <div>
          <h2>{title}</h2>
          <div className="body-band-sub">Profile presets · routines choose one rule per exercise</div>
        </div>
      </div>
      <div className="progression-rule-grid">
        {LOG_RULE_KEYS.map(key => {
          const rule = rules[key] || defaults[key] || {};
          return (
            <div key={key} className={`progression-rule-card rule-${key}`}>
              <div className="progression-rule-card-head">
                <input
                  value={rule.label || key}
                  onChange={e => updateRule(key, { label: e.target.value })}
                  aria-label={`${key} rule label`} />
                <span className="chip">{usage[key] || 0} used</span>
              </div>
              <label>
                <span>Trigger</span>
                <select value={rule.trigger} onChange={e => updateRule(key, { trigger: e.target.value })}>
                  {Object.entries(triggers).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="progression-rule-numbers">
                <label>
                  <span>kg step</span>
                  <input type="number" step="0.5" min="0" value={rule.incrementKg}
                    onChange={e => updateRule(key, { incrementKg: Number(e.target.value) || 0 })} />
                </label>
                <label>
                  <span>lbs step</span>
                  <input type="number" step="1" min="0" value={rule.incrementLbs}
                    onChange={e => updateRule(key, { incrementLbs: Number(e.target.value) || 0 })} />
                </label>
                <label>
                  <span>drop %</span>
                  <input type="number" step="5" min="1" max="95" value={rule.repDropWarningPct}
                    onChange={e => updateRule(key, { repDropWarningPct: Number(e.target.value) || 30 })} />
                </label>
              </div>
              <div className="progression-rule-foot">
                <span>{ruleTriggerLabel(rule.trigger)}</span>
                <button className="btn ghost sm" onClick={() => resetRule(key)}>Reset</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.RepsProgressionRuleStudio = ProgressionRuleStudio;
window.RepsProgressionRuleOptions = progressionRuleOptions;

let _setIdCounter = 0;
const nextSetId = () => "s-" + (++_setIdCounter);
function registerSetId(id) {
  const match = /^s-(\d+)$/.exec(String(id || ""));
  if (match) _setIdCounter = Math.max(_setIdCounter, Number(match[1]) || 0);
}

function normalizeSetIds(sets = []) {
  const seen = new Set();
  return (sets || []).map((set = {}) => {
    let id = set.id ? String(set.id) : "";
    const normalizedSet = set._prefilled && !set._edited && set._done !== true
      ? { ...set, weight: "", reps: "", duration: "" }
      : set;
    if (id && !seen.has(id)) {
      seen.add(id);
      registerSetId(id);
      return id === normalizedSet.id ? normalizedSet : { ...normalizedSet, id };
    }
    do {
      id = nextSetId();
    } while (seen.has(id));
    seen.add(id);
    return { ...normalizedSet, id };
  });
}

function normalizeSavedSetsByExercise(setsByExercise = {}, exercises = [], beforeDate = "", routineDay = "") {
  const exerciseMap = new Map((exercises || []).map(ex => [ex._key, ex]));
  return Object.fromEntries(
    Object.entries(setsByExercise || {}).map(([key, sets]) => {
      const exercise = exerciseMap.get(key) || {};
      const lastEntry = exercise.name
        ? window.RepsData.exerciseLastWeek?.(exercise.name, beforeDate, { exercise, routineDay })
        : null;
      return [key, normalizeDraftSetsForExercise(Array.isArray(sets) ? sets : [], exercise, lastEntry)];
    })
  );
}

// Seed new set rows with last week's unit only. The Last column already shows
// previous values; Actual starts blank so it only contains what was done today.
function buildInitialSets(planned, lastEntry) {
  const durationMode = isDurationExercise(planned);
  const lastSets = (lastEntry && Array.isArray(lastEntry.sets)) ? lastEntry.sets : [];
  const fallback = (lastEntry && !Array.isArray(lastEntry.sets)) ? lastEntry : null;
  const count = Math.max(planned.sets || 0, lastSets.length || 0, 1);
  return Array.from({ length: count }, (_, i) => {
    const ls = lastSets[i] || fallback || null;
    return {
      id: nextSetId(),
      weight: "",
      reps: "",
      unit: planned.unit || ls?.unit || (durationMode ? "min" : "kg"),
      duration: "",
      rpe: "",
      note: "",
      _prefilled: !!ls,
      _edited: false
    };
  });
}

// Renders a compact "what you did last week for this exact set #" reference
// cell at the left of each input row.
function LastSetRef({ lastSet, durationMode }) {
  if (!lastSet) return <div className="set-cell lastref empty">—</div>;
  if (durationMode) {
    const d = lastSet.durationMinutes || lastSet.duration;
    return <div className="set-cell lastref"><span className="mono">{d ? `${d}m` : "—"}</span></div>;
  }
  if (lastSet.weight == null && lastSet.reps == null) {
    return <div className="set-cell lastref empty">—</div>;
  }
  const w = lastSet.weight == null ? "?" : lastSet.weight;
  const r = lastSet.reps == null ? "?" : lastSet.reps;
  return <div className="set-cell lastref"><span className="mono">{w}×{r}</span></div>;
}

function formatLastSetValue(lastSet, durationMode) {
  if (!lastSet) return "—";
  if (durationMode) {
    const d = lastSet.durationMinutes || lastSet.duration;
    return d ? `${d}m` : "—";
  }
  if (lastSet.weight == null && lastSet.reps == null) return "—";
  const w = lastSet.weight == null ? "?" : lastSet.weight;
  const r = lastSet.reps == null ? "?" : lastSet.reps;
  return `${w}×${r}`;
}

function formatLastEntrySets(lastEntry, durationMode) {
  const sets = lastEntry?.sets || [];
  if (!sets.length) return "";
  return sets.map(s => formatLastSetValue(s, durationMode)).join(" / ");
}

function formatTopSetValue(lastEntry, durationMode) {
  const sets = lastEntry?.sets || [];
  if (!sets.length) return "—";
  if (durationMode) return formatLastSetValue(sets[sets.length - 1], true);
  const top = sets.reduce((best, set) => {
    const bestWeight = Number(best?.weight) || 0;
    const setWeight = Number(set?.weight) || 0;
    if (setWeight !== bestWeight) return setWeight > bestWeight ? set : best;
    return (Number(set?.reps) || 0) > (Number(best?.reps) || 0) ? set : best;
  }, sets[0]);
  return formatLastSetValue(top, false);
}

function progressionNoteLine(exercise, lastEntry, suggestion) {
  if (!suggestion) return "";
  const durationMode = isDurationExercise(exercise);
  const lastSets = formatLastEntrySets(lastEntry, durationMode);
  if (!lastSets) {
    return `No prior data: start with ${suggestion.headline}. ${suggestion.sub}`;
  }
  return `Because last week was ${lastSets}, this week: ${suggestion.headline}. ${suggestion.sub}`;
}

function clipboardInitialSets(exercise, lastEntry) {
  const durationMode = isDurationExercise(exercise);
  const lastSets = (lastEntry && Array.isArray(lastEntry.sets)) ? lastEntry.sets : [];
  const count = Math.max(exercise.sets || 0, lastSets.length || 0, 1);
  return Array.from({ length: count }, (_, i) => {
    const ls = lastSets[i] || null;
    return {
      weight: "",
      reps: "",
      unit: exercise.unit || ls?.unit || (durationMode ? "min" : "kg"),
      duration: "",
      rpe: "",
      note: "",
      _prefilled: !!ls,
      _edited: false
    };
  });
}

function clipboardSetDone(set = {}, durationMode) {
  if (durationMode) return !!(set.duration || set.reps || set.rpe || set.note);
  return set.weight !== "" || !!set.reps || !!set.note || !!set.rpe;
}

function clipboardSetEntered(set = {}, durationMode) {
  return (!!set._done && clipboardSetDone(set, durationMode)) ||
    !!set._edited ||
    (!set._prefilled && clipboardSetDone(set, durationMode));
}

function setAccepted(set = {}, durationMode) {
  if (set._done === true) return clipboardSetDone(set, durationMode);
  if (set._done === false) return false;
  return (!!set._edited || !set._prefilled) && clipboardSetDone(set, durationMode);
}

function setMatchesLastSet(set = {}, lastSet = null, durationMode) {
  if (!lastSet) return false;
  if (durationMode) {
    return String(set.duration ?? "") === String(lastSet.durationMinutes ?? lastSet.duration ?? "") &&
      String(set.reps ?? "") === "";
  }
  return String(set.weight ?? "") === String(lastSet.weight ?? "") &&
    String(set.reps ?? "") === String(lastSet.reps ?? "") &&
    String(set.unit || "kg") === String(lastSet.unit || set.unit || "kg");
}

function normalizeDraftSetsForExercise(sets = [], exercise = {}, lastEntry = null) {
  const durationMode = isDurationExercise(exercise);
  const lastSets = (lastEntry && Array.isArray(lastEntry.sets)) ? lastEntry.sets : [];
  return normalizeSetIds(sets).map((set, i) => {
    if (!set._prefilled || set._done === true) return set;
    const hasManualDetail = !!String(set.rpe || "").trim() || !!String(set.note || "").trim();
    const isOldPrefill = !set._edited && setMatchesLastSet(set, lastSets[i] || null, durationMode);
    return !hasManualDetail && isOldPrefill
      ? { ...set, weight: "", reps: "", duration: "", _edited: false }
      : set;
  });
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function attrEscape(value) {
  return htmlEscape(value).replace(/"/g, "&quot;");
}

function sheetsValueAttr(value) {
  const text = String(value ?? "");
  const json = attrEscape(JSON.stringify({ 1: 2, 2: text }));
  return ` data-sheets-value="${json}"`;
}

function inlineStyle(parts) {
  return Object.entries(parts)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

const LOG_CLIPBOARD_COLS = ["Exercise", "Target", "Last wk", "#", "Weight", "Unit", "Reps", "RPE", "Note"];
const LOG_CLIPBOARD_WIDTHS = [210, 150, 95, 36, 82, 58, 66, 56, 230];
const LOG_CLIPBOARD_COL_COUNT = LOG_CLIPBOARD_COLS.length;
const LOG_CLIPBOARD_COLGROUP = LOG_CLIPBOARD_WIDTHS.map(width => `<col style="width:${width}px">`).join("");
const LOG_CLIPBOARD_COLORS = {
  bg: "#fbf8f1",
  surface: "#fbf8f1",
  surface2: "#efeadf",
  ink: "#1a1814",
  ink2: "#3a3630",
  muted: "#75706a",
  faint: "#a8a39c",
  hairline: "#e1dccf",
  hairline2: "#d4cdbe",
  accentSoft: "#f8ead8",
  accentLine: "#ead3ba",
  accentInk: "#7a4418",
  good: "#2f8a5a",
  goodSoft: "#e3f4ea",
  warn: "#9a6a17",
  bad: "#a24635"
};

function clipboardCell(value, options = {}) {
  const {
    tag = "td",
    colspan,
    base = {},
    style = {},
    html,
    className = ""
  } = options;
  const attrs = [
    className ? `class="${attrEscape(className)}"` : "",
    colspan ? `colspan="${colspan}"` : "",
    sheetsValueAttr(value),
    `style="${attrEscape(inlineStyle({ ...base, ...style }))}"`
  ].filter(Boolean).join(" ");
  return `<${tag} ${attrs}>${html ?? htmlEscape(value)}</${tag}>`;
}

function tsvCell(value) {
  return String(value ?? "").replace(/\t|\r?\n/g, " ").trim();
}

async function copyRichTextToClipboard({ html, text }) {
  if (navigator.clipboard?.write && window.ClipboardItem && window.Blob) {
    try {
      const item = new window.ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      });
      await navigator.clipboard.write([item]);
      return;
    } catch (e) {
      // Some embedded or non-secure contexts expose the API but reject writes.
      // Continue to the selection fallback so the user still gets rich HTML.
    }
  }

  const selection = window.getSelection?.();
  if (selection && document.body) {
    const holder = document.createElement("div");
    holder.contentEditable = "true";
    holder.style.position = "fixed";
    holder.style.left = "-10000px";
    holder.style.top = "0";
    holder.style.opacity = "0";
    holder.innerHTML = html;
    document.body.appendChild(holder);

    const range = document.createRange();
    range.selectNodeContents(holder);
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      if (document.execCommand("copy")) {
        selection.removeAllRanges();
        document.body.removeChild(holder);
        return;
      }
    } finally {
      selection.removeAllRanges();
      if (holder.parentNode) document.body.removeChild(holder);
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (e) {
      // Fall through to the legacy textarea copy path.
    }
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy command failed");
  } finally {
    document.body.removeChild(ta);
  }
}

function ruleLabel(exercise = {}, rules = null) {
  const key = typeof exercise === "string"
    ? exercise
    : (LOG_RULE_KEYS.includes(exercise.rule) ? exercise.rule : "hypertrophy");
  return window.RepsData.progressionRuleLabel
    ? window.RepsData.progressionRuleLabel(key, rules)
    : (key === "compound" ? "Compound" : key === "safety" ? "Safety" : "Hypertrophy");
}

function exerciseFromLoggedEntry(entry = {}, index = 0, date = "") {
  const firstSet = (entry.sets || [])[0] || {};
  return {
    _key: loggedEntryKey(entry, index, date),
    name: entry.exercise,
    sets: entry.targetSets || (entry.sets || []).length || 1,
    reps: entry.targetReps || (firstSet.durationMinutes || firstSet.duration ? `${firstSet.durationMinutes || firstSet.duration} min` : "8-12"),
    unit: firstSet.unit || "kg",
    rule: firstSet.durationMinutes || firstSet.duration ? "safety" : (entry.movementGroup === "Conditioning" ? "safety" : "hypertrophy"),
    track: firstSet.durationMinutes || firstSet.duration ? "duration" : undefined,
    duration: firstSet.durationMinutes || firstSet.duration || undefined
  };
}

function loggedEntryKey(entry = {}, index = 0, date = "") {
  return entry.logKey || entry._key || `l-${date}-${index}`;
}

function setsFromLoggedEntry(entry = {}) {
  return (entry.sets || []).map((s) => ({
    id: nextSetId(),
    weight: s.weight ?? "",
    reps: s.durationMinutes || s.duration ? "" : (s.reps ?? s.repsNumber ?? ""),
    unit: s.unit || (s.durationMinutes || s.duration ? "min" : "kg"),
    duration: s.durationMinutes ?? s.duration ?? "",
    rpe: s.rpe || "",
    note: s.note || "",
    _prefilled: false,
    _done: true,
    _edited: true
  }));
}

function loggedSessionForDate(date, routineDay = null) {
  if (window.RepsData.sessionForDate) {
    return window.RepsData.sessionForDate(date, { routineDay });
  }
  const normalizedDay = window.RepsData.normalizeDayKey?.(routineDay);
  const sessions = window.RepsData.allSessions?.() || [];
  const matches = sessions.filter(s =>
    s.date === date &&
    (!normalizedDay || window.RepsData.normalizeDayKey?.(s.routineDay || s.nominalDay) === normalizedDay) &&
    s.status !== "skipped" &&
    (s.entries || []).some(e => (e.sets || []).length > 0)
  );
  return matches.find(s => s.status === "performed") || matches[0] || null;
}

function loggedEntryIndexFromKey(key, date, entries = []) {
  const explicitIndex = entries.findIndex((entry, index) => loggedEntryKey(entry, index, date) === key);
  if (explicitIndex >= 0) return explicitIndex;
  const prefix = `l-${date}-`;
  if (!String(key || "").startsWith(prefix)) return null;
  const index = Number(String(key).slice(prefix.length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function reorderedLoggedEntriesForKeys(session = {}, orderedKeys = []) {
  if (!session) return null;
  const entries = session.entries || [];
  if (!entries.length) return null;
  const next = [];
  const used = new Set();
  for (const key of orderedKeys) {
    const index = loggedEntryIndexFromKey(key, session.date, entries);
    if (index == null || !entries[index] || used.has(index)) continue;
    next.push({ ...entries[index], logKey: loggedEntryKey(entries[index], index, session.date) });
    used.add(index);
  }
  entries.forEach((entry, index) => {
    if (!used.has(index)) next.push({ ...entry, logKey: loggedEntryKey(entry, index, session.date) });
  });
  if (next.length !== entries.length) return null;
  return next.some((entry, index) => entry !== entries[index]) ? next : null;
}

function routineSessionMovedAwayFromDate(profile = {}, plannedDate, routineDay) {
  const moved = window.RepsData.sessionForRoutineSlot?.(plannedDate, routineDay);
  if (moved && moved.date !== plannedDate) return true;
  const edits = profile.sessionEdits || {};
  return (profile.loggedSessions || []).some(s => {
    const editedDate = edits[s.id]?.date;
    const editedPlannedDate = edits[s.id]?.plannedDate || s.plannedDate;
    const normalized = window.RepsData.normalizeDayKey?.(edits[s.id]?.routineDay || s.routineDay || s.nominalDay);
    return (editedPlannedDate || s.date) === plannedDate &&
      (!routineDay || normalized === window.RepsData.normalizeDayKey?.(routineDay)) &&
      editedDate && editedDate !== plannedDate;
  });
}

function SetRow({ set, idx, exercise, lastSet, onChange, onRemove, avgBW, targetLabel, finished, canRemoveSet, first, setsCount, suggestion, progressionRules, skipNextTargets, onToggleSkipNextTargets, onDragStart, onDragEnd, onRemoveExercise, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const durationMode = isDurationExercise(exercise);
  const isBW = !durationMode && set.unit === "bw";
  const [noteOpen, setNoteOpen] = useState(!!set.note);
  const accepted = setAccepted(set, durationMode);
  const edited = !!set._edited;
  const prefilled = !!set._prefilled && !edited && !accepted;
  const patchEdited = (patch) => onChange({ ...patch, _edited: true });
  const markEdited = () => { if (!set._edited) onChange({ _edited: true }); };
  const hasNote = !!String(set.note || "").trim();
  const toggleDone = () => {
    const next = !accepted;
    if (next) {
      onChange({ _done: true, _edited: true });
      return;
    }
    const keepEdited = clipboardSetDone(set, durationMode) && !setMatchesLastSet(set, lastSet, durationMode);
    onChange({ _done: false, _edited: keepEdited });
  };

  return (
    <div className={`sheet-set-row ${first ? "is-first" : ""} ${durationMode ? "duration" : ""} ${prefilled ? "is-prefilled" : ""} ${edited ? "is-edited" : ""} ${accepted ? "is-done" : ""} ${finished && accepted ? "is-finished" : ""}`}>
      <div className="sheet-exercise-cell">
        {first && (
          <>
            <button
              className="drag-grip"
              type="button"
              title="Drag exercise"
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              aria-label={`Move ${exercise.name}`}>
              <span></span>
            </button>
            <div className="sheet-exercise-copy">
              <div className="sheet-ex-title">{exercise.name}</div>
              <div className="sheet-ex-subline">
                <span>{ruleLabel(exercise, progressionRules)}</span>
                <span>{setsCount} set{setsCount === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div className="sheet-mobile-move" aria-label={`Move ${exercise.name}`}>
              <button type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move up" aria-label={`Move ${exercise.name} up`}>
                <LIcons.ChevronUp />
              </button>
              <button type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move down" aria-label={`Move ${exercise.name} down`}>
                <LIcons.ChevronDown />
              </button>
            </div>
            <button
              className={`sheet-skip-button ${skipNextTargets ? "is-on" : ""}`}
              type="button"
              aria-pressed={!!skipNextTargets}
              title="Keep this exercise logged, but skip it for next target suggestions."
              onClick={() => onToggleSkipNextTargets?.(!skipNextTargets)}>
              <LIcons.Trend />
            </button>
          </>
        )}
      </div>
      <div className={`sheet-target-cell tone-${suggestion?.tone || "neutral"}`}>
        {first ? (
          <>
            <strong>{exercise.sets} × {exercise.reps}{exercise.unit ? ` · ${exercise.unit}` : ""}</strong>
            {suggestion && (
              <span title={suggestion.sub}>
                {suggestion.headline}{suggestion.deltaLabel ? ` · ${suggestion.deltaLabel}` : ""}
              </span>
            )}
          </>
        ) : (
          <span>{targetLabel}</span>
        )}
      </div>
      <div className="sheet-last-cell mono">{formatLastSetValue(lastSet, durationMode)}</div>
      <div className="sheet-set-index mono">{idx}</div>
      <div className="sheet-actual-group">
        <input
          className="sheet-weight-input"
          value={durationMode ? (set.duration ?? "") : set.weight}
          placeholder={durationMode ? "min" : isBW ? "+kg" : "kg"}
          aria-label={`${exercise.name} set ${idx} ${durationMode ? "minutes" : "weight"}`}
          onFocus={markEdited}
          onChange={e => patchEdited(durationMode ? { duration: e.target.value } : { weight: e.target.value })} />
        {durationMode ? (
          <span className="sheet-unit-pill">min</span>
        ) : (
          <select value={set.unit} aria-label={`${exercise.name} set ${idx} unit`} onFocus={markEdited} onChange={e => patchEdited({ unit: e.target.value })}>
            <option value="kg">kg</option>
            <option value="lbs">lbs</option>
            <option value="bw">bw</option>
          </select>
        )}
        <input
          className="sheet-reps-input"
          value={set.reps}
          placeholder="reps"
          aria-label={`${exercise.name} set ${idx} reps`}
          onFocus={markEdited}
          onChange={e => patchEdited({ reps: e.target.value })} />
        {isBW && avgBW != null && (
          <span className="sheet-bw">
            ={((Number(set.weight) || 0) + avgBW).toFixed(1)}kg
          </span>
        )}
      </div>
      <div className="sheet-rpe-cell">
        <input
          value={set.rpe}
          placeholder="rpe"
          aria-label={`${exercise.name} set ${idx} RPE`}
          onFocus={markEdited}
          onChange={e => patchEdited({ rpe: e.target.value })} />
      </div>
      <button
        className={`sheet-done-toggle ${accepted ? "is-done" : ""}`}
        type="button"
        aria-pressed={accepted}
        title={accepted ? "Set accepted" : "Accept this set"}
        onClick={toggleDone}>
        {accepted ? <LIcons.Check /> : <span></span>}
      </button>
      <div className="sheet-row-actions">
        <button
          className={`btn ghost icon-only sheet-note-toggle ${noteOpen || hasNote ? "is-on" : ""}`}
          type="button"
          title={hasNote ? "Edit set note" : "Add set note"}
          onClick={() => setNoteOpen(v => !v)}>
          <LIcons.Edit />
        </button>
        <button
          className="btn ghost icon-only"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (first) {
              if (confirm(`Remove ${exercise.name} from this session?`)) onRemoveExercise?.();
              return;
            }
            onRemove?.();
          }}
          disabled={!first && !canRemoveSet}
          title={first ? "Remove exercise" : canRemoveSet ? "Remove set" : "Keep at least one set"}>
          <LIcons.X />
        </button>
      </div>
      {(noteOpen || hasNote) && (
        <div className="sheet-note-panel">
          <span>Note</span>
          <input
            value={set.note}
            placeholder="form cue, pain, equipment, tempo..."
            aria-label={`${exercise.name} set ${idx} note`}
            onFocus={markEdited}
            onChange={e => patchEdited({ note: e.target.value })} />
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ exercise, sets, index, totalExercises, onUpdateSets, onRemove, avgBW, beforeDate, routineDay, finished, skipNextTargets, onToggleSkipNextTargets, dragging, onDragStart, onDragOver, onDrop, onDragEnd, onMoveUp, onMoveDown, progressionRules }) {
  const durationMode = isDurationExercise(exercise);
  const lastEntry = window.RepsData.exerciseLastWeek?.(exercise.name, beforeDate, { exercise, routineDay });
  const suggestion = window.RepsData.progressionSuggestion?.(exercise, lastEntry, { rules: progressionRules });
  const targetSummary = `${exercise.sets} × ${exercise.reps}${exercise.unit ? ` · ${exercise.unit}` : ""}`;
  const nextSummary = suggestion?.headline || targetSummary;

  const updateSet = (id, patch) => {
    onUpdateSets(sets.map(s => s.id === id ? { ...s, ...patch } : s));
  };
  const removeSet = (id) => {
    onUpdateSets(sets.filter(s => s.id !== id));
  };
  const addSet = () => {
    const last = sets[sets.length - 1];
    onUpdateSets([...sets, {
      id: nextSetId(),
      weight: "",
      reps: durationMode ? "" : "",
      unit: durationMode ? "min" : (last?.unit || "kg"),
      duration: "",
      rpe: "",
      note: "",
      _prefilled: false,
      _edited: false
    }]);
  };

  return (
    <div
      className={`log-ex-group ${dragging ? "is-dragging" : ""}`}
      onDragOver={onDragOver}
      onDrop={onDrop}>
      {sets.map((set, i) => (
        <SetRow
          key={`${set.id || "set"}-${i}`}
          set={set}
          idx={i + 1}
          exercise={exercise}
          lastSet={lastEntry?.sets?.[i] || null}
          avgBW={avgBW}
          first={i === 0}
          setsCount={sets.length}
          suggestion={i === 0 ? suggestion : null}
          progressionRules={progressionRules}
          skipNextTargets={skipNextTargets}
          onToggleSkipNextTargets={onToggleSkipNextTargets}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={index > 0}
          canMoveDown={index < totalExercises - 1}
          targetLabel={i === 0 ? nextSummary : `${exercise.reps}${exercise.unit ? ` · ${exercise.unit}` : ""}`}
          finished={finished}
          onChange={(patch) => updateSet(set.id, patch)}
          onRemove={() => removeSet(set.id)}
          onRemoveExercise={onRemove}
          canRemoveSet={sets.length > 1}
        />
      ))}
      <button className="sheet-add-set" onClick={addSet}>
        <LIcons.Plus /> Add set
      </button>
    </div>
  );
}

function WeekStrip({ weekStart, selectedDate, onPickDate, onWeekShift, onToday }) {
  const today = window.RepsData.TODAY;
  return (
    <div className="log-week-strip">
      <button className="btn ghost sm icon-only" onClick={() => onWeekShift(-1)} title="Previous week"><LIcons.ChevronLeft /></button>
      <div className="log-week-days">
        {window.RepsData.weekdays.map((d, i) => {
          const date = window.RepsData.addDays(weekStart, i);
          const planned = (window.PLANNED_ROUTINE || []).find(p => p.day === d);
          const sessionStatus = window.RepsData.sessionStatusForDay(date);
          const hasSession = !!sessionStatus && sessionStatus.status !== "skipped" && sessionStatus.sets > 0;
          const isMovedAway = sessionStatus?.status === "moved";
          const isSelected = selectedDate === date;
          const isToday = date === today;
          const title = sessionStatus?.movedIn ? sessionStatus.type : planned ? planned.title : "Rest";
          return (
            <button
              key={d}
              onClick={() => onPickDate(date, sessionStatus || { routineDay: d })}
              title={`${d} ${window.RepsData.shortDate(date)} · ${title}${hasSession ? ` · ${sessionStatus.sets} sets` : isMovedAway ? ` · moved to ${window.RepsData.shortDate(sessionStatus.movedTo)}` : ""}`}
              className={`log-week-day ${isSelected ? "is-selected" : ""} ${isToday ? "is-today" : ""} ${hasSession ? "has-session" : ""} ${isMovedAway ? "is-moved" : ""}`}>
              <span className="day">{d}</span>
              <span className="date">{date.slice(8, 10)}</span>
              <span className="title">{title}</span>
              <span className="marker">
                {hasSession ? <span className="marker-dot" /> : isMovedAway ? <span className="marker-moved" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <button className="btn ghost sm" onClick={onToday}>Today</button>
      <button className="btn ghost sm icon-only" onClick={() => onWeekShift(1)} title="Next week"><LIcons.Chevron /></button>
    </div>
  );
}

function RulesSummary({ rules, usage, expanded, onToggle, profile, updateProfile, routineDays }) {
  return (
    <div className={`log-rules-compact ${expanded ? "is-expanded" : ""}`}>
      <div className="log-rules-row">
        <div className="log-rules-label">Rules</div>
        <div className="log-rule-chips">
          {LOG_RULE_KEYS.map(key => (
            <span key={key} className="chip">
              {rules[key]?.label || key}
              <span className="n">{usage[key] || 0}</span>
            </span>
          ))}
        </div>
        <button className="btn ghost sm" onClick={onToggle}>{expanded ? "Hide rules" : "Edit rules"}</button>
      </div>
      {expanded && (
        <ProgressionRuleStudio
          profile={profile}
          updateProfile={updateProfile}
          routineDays={routineDays}
          compact
          title="Progression rules" />
      )}
    </div>
  );
}

function LogView() {
  const app = window.RepsState.useApp();
  const progressionRules = normalizedRulesForProfile(app.activeProfile);
  const ruleOptions = progressionRuleOptions(app.activeProfile);
  const todayIso = window.RepsData.TODAY;
  const todayDay = window.RepsData.dayName(todayIso);
  const exerciseCatalog = useMemo(
    () => window.RepsData.exerciseCatalog(app.activeProfile.customExercises || [], app.activeProfile.hiddenExercises || []),
    [app.activeProfile]
  );
  const [selectedDay, setSelectedDay] = useState(todayDay);
  const [sessionDate, setSessionDate] = useState(todayIso);
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const [skipProgressionKeys, setSkipProgressionKeys] = useState(new Set());
  // Status was previously a dropdown (performed/planned/partial/...). It's now
  // implicit: anything you log is "performed". The green dot on the week strip
  // is the visual indicator.
  const sessionStatus = "performed";
  const [finishStatus, setFinishStatus] = useState("");
  const [extraExercises, setExtraExercises] = useState([]);
  const [removedKeys, setRemovedKeys] = useState(new Set());
  const [exerciseOrder, setExerciseOrder] = useState([]);
  const [dragKey, setDragKey] = useState(null);
  const [setsByExercise, setSetsByExercise] = useState({});
  const [newExName, setNewExName] = useState("");
  const [newExTarget, setNewExTarget] = useState("3 × 8-12");
  const [newExUnit, setNewExUnit] = useState("kg");
  const [newExRule, setNewExRule] = useState("hypertrophy");
  const [hydratedPlanKey, setHydratedPlanKey] = useState("");
  const [rulesExpanded, setRulesExpanded] = useState(false);

  // The Monday of the week containing the selected date — used for week navigation
  const currentWeekStart = window.RepsData.mondayOf(sessionDate);
  const selectedDayIndex = window.RepsData.weekdays.indexOf(selectedDay);
  const plannedDate = selectedDayIndex >= 0
    ? window.RepsData.addDays(currentWeekStart, selectedDayIndex)
    : sessionDate;
  const planHydrationKey = `${app.activeProfile.id}:${selectedDay}:${sessionDate}`;

  const avgBW = useMemo(() => {
    if (window.RepsData.avgBodyweight) return window.RepsData.avgBodyweight(14);
    return null;
  }, [app.activeProfile]);

  const applyCatalogChoice = (name) => {
    const item = exerciseCatalog.find(e => e.name === name);
    setNewExName(name);
    if (!item) return;
    setNewExTarget(targetFromCatalogItem(item));
    setNewExUnit(item.unit || item.lastUnit || "kg");
    setNewExRule(item.rule || (item.compound ? "compound" : item.group === "Conditioning" ? "safety" : "hypertrophy"));
  };

  const planned = (window.PLANNED_ROUTINE || []).find(s => s.day === selectedDay)
    || { day: selectedDay, title: "Rest", type: "rest", focus: "", exercises: [] };

  const hydrateLoggedSession = (session) => {
    const logDate = session?.date || sessionDate;
    const dayForSession = window.RepsData.normalizeDayKey?.(session?.routineDay || session?.nominalDay) || selectedDay;
    const plannedForDate = (window.PLANNED_ROUTINE || []).find(s => s.day === dayForSession)
      || { exercises: [] };
    const loggedExercises = (session.entries || []).map((entry, i) =>
      exerciseFromLoggedEntry(entry, i, logDate)
    );
    const loggedSets = {};
    const skipped = new Set();
    (session.entries || []).forEach((entry, i) => {
      const key = loggedEntryKey(entry, i, logDate);
      loggedSets[key] = setsFromLoggedEntry(entry);
      if (session.ignoreForProgression || entry.ignoreForProgression) skipped.add(key);
    });
    const plannedKeys = (plannedForDate.exercises || []).map((_, i) => `p-${dayForSession}-${i}`);
    setExtraExercises(loggedExercises);
    setRemovedKeys(new Set(plannedKeys));
    setExerciseOrder(loggedExercises.map(ex => ex._key));
    setSetsByExercise(loggedSets);
    setRpe(session.dailyMetrics?.rpe ?? "");
    setNotes(session.dayNote || "");
    setSkipProgressionKeys(skipped);
  };

  // Hydrate from persisted per-date plan + any logged session at this date
  React.useEffect(() => {
    setHydratedPlanKey("");
    const existingLogged = loggedSessionForDate(sessionDate, selectedDay);
    const movedAway = routineSessionMovedAwayFromDate(app.activeProfile, plannedDate, selectedDay);
    const planMap = app.activeProfile.sessionPlansByDate || {};
    const savedPlanRaw = planMap[sessionDate] || (sessionDate !== plannedDate ? planMap[plannedDate] : null);
    const savedPlan = movedAway ? null : savedPlanRaw;
    if (movedAway && savedPlanRaw) {
      app.clearSessionPlan?.(sessionDate);
    }

    if (existingLogged) {
      hydrateLoggedSession(existingLogged);
    } else if (savedPlan) {
      const savedExercises = [
        ...(planned.exercises || []).map((e, i) => ({ ...e, name: window.RepsData.renamedExercise(e.name), _key: `p-${selectedDay}-${i}` })),
        ...(savedPlan.extraExercises || []).map((e, i) => ({ ...e, _key: e._key || `e-${i}` }))
      ];
      setExtraExercises(savedPlan.extraExercises || []);
      setRemovedKeys(new Set(savedPlan.removedKeys || []));
      setExerciseOrder(savedPlan.exerciseOrder || []);
      setSetsByExercise(normalizeSavedSetsByExercise(savedPlan.setsByExercise || {}, savedExercises, currentWeekStart, selectedDay));
      setRpe(savedPlan.rpe || "");
      setNotes(savedPlan.notes || "");
      const legacySkipKeys = [
        ...(planned.exercises || []).map((_, i) => `p-${selectedDay}-${i}`),
        ...(savedPlan.extraExercises || []).map((e, i) => e._key || `e-${i}`)
      ];
      setSkipProgressionKeys(new Set(savedPlan.skipProgressionKeys || (savedPlan.ignoreForProgression ? legacySkipKeys : [])));
    } else {
      setExtraExercises([]);
      setRemovedKeys(new Set());
      setExerciseOrder([]);
      setSetsByExercise({});
      setRpe("");
      setNotes("");
      setSkipProgressionKeys(new Set());
    }
    setHydratedPlanKey(planHydrationKey);
  }, [planHydrationKey]);

  const baseExercises = [
    ...(planned.exercises || []).map((e, i) => ({ ...e, name: window.RepsData.renamedExercise(e.name), _key: `p-${selectedDay}-${i}` })),
    ...extraExercises.map((e, i) => ({ ...e, _key: e._key || `e-${i}` }))
  ].filter(e => !removedKeys.has(e._key));
  const baseExerciseKeys = baseExercises.map(ex => ex._key);
  const allExercises = (() => {
    const index = new Map(baseExercises.map((ex, i) => [ex._key, i]));
    const order = new Map(exerciseOrder.map((key, i) => [key, i]));
    return [...baseExercises].sort((a, b) => {
      const aOrder = order.has(a._key) ? order.get(a._key) : exerciseOrder.length + index.get(a._key);
      const bOrder = order.has(b._key) ? order.get(b._key) : exerciseOrder.length + index.get(b._key);
      return aOrder - bOrder;
    });
  })();
  const exerciseKeys = allExercises.map(ex => ex._key).join("|");

  React.useEffect(() => {
    const keys = baseExerciseKeys;
    setExerciseOrder(prev => {
      const next = [...prev.filter(key => keys.includes(key)), ...keys.filter(key => !prev.includes(key))];
      return next.length === prev.length && next.every((key, i) => key === prev[i]) ? prev : next;
    });
  }, [baseExerciseKeys.join("|")]);

  React.useEffect(() => {
    setSetsByExercise(prev => {
      const next = { ...prev };
      let changed = false;
      for (const ex of allExercises) {
        if (!next[ex._key]) {
          // Use last week's row only to decide set count and unit. Actual
          // values stay blank because the Last column already shows history.
          const lastWeek = window.RepsData.exerciseLastWeek?.(ex.name, currentWeekStart, { exercise: ex, routineDay: selectedDay });
          const last = lastWeek || window.RepsData.exerciseLastSeen(ex.name);
          next[ex._key] = buildInitialSets(ex, last);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [exerciseKeys, selectedDay, currentWeekStart]);

  // Persist plan adjustments to the profile whenever they change
  React.useEffect(() => {
    if (hydratedPlanKey !== planHydrationKey) return;
    const customExerciseOrder = exerciseOrder.length > 0 &&
      exerciseOrder.some((key, i) => key !== baseExerciseKeys[i]);
    const hasTouchedSet = Object.values(setsByExercise).some(arr =>
      (arr || []).some(s =>
        s._edited ||
        s._done === true ||
        s._done === false ||
        s.rpe !== "" ||
        s.note !== "" ||
        (!s._prefilled && (s.weight !== "" || s.reps !== "" || s.duration !== ""))
      )
    );
    const hasContent =
      extraExercises.length > 0 ||
      removedKeys.size > 0 ||
      customExerciseOrder ||
      rpe ||
      notes ||
      skipProgressionKeys.size > 0 ||
      hasTouchedSet;
    const hasSavedPlan = !!(app.activeProfile.sessionPlansByDate || {})[sessionDate];
    if (hasContent) {
      app.updateSessionPlan?.(sessionDate, {
        extraExercises,
        removedKeys: Array.from(removedKeys),
        exerciseOrder: customExerciseOrder || extraExercises.length > 0 ? exerciseOrder : [],
        setsByExercise,
        rpe,
        notes,
        routineDay: selectedDay,
        plannedDate,
        skipProgressionKeys: Array.from(skipProgressionKeys),
        ignoreForProgression: false,
        status: "performed"
      });
    } else if (hasSavedPlan) {
      app.clearSessionPlan?.(sessionDate);
    }
  }, [extraExercises, removedKeys, exerciseOrder, setsByExercise, rpe, notes, skipProgressionKeys, sessionDate, plannedDate, selectedDay, baseExerciseKeys.join("|"), hydratedPlanKey, planHydrationKey]);

  const handleSelectDay = (day) => {
    setSelectedDay(day);
    const idx = window.RepsData.weekdays.indexOf(day);
    if (idx >= 0) setSessionDate(window.RepsData.addDays(currentWeekStart, idx));
  };

  const handleDateChange = (date, status = null) => {
    setSessionDate(date);
    const routineDay = window.RepsData.normalizeDayKey?.(status?.routineDay);
    if (routineDay) setSelectedDay(routineDay);
  };

  const handleWeekShift = (offset) => {
    const nextWeekStart = window.RepsData.addDays(currentWeekStart, offset * 7);
    const idx = window.RepsData.weekdays.indexOf(selectedDay);
    setSessionDate(idx >= 0 ? window.RepsData.addDays(nextWeekStart, idx) : window.RepsData.addDays(sessionDate, offset * 7));
  };

  // Copy the visible week as a styled HTML table plus TSV fallback. Google
  // Sheets prefers the HTML clipboard item, so pasted cells keep the same
  // Log-grid structure, borders, muted/prefilled cells and edited highlights.
  const [copyState, setCopyState] = useState("");
  const buildClipboardModelForDate = (date) => {
    const dayName = window.RepsData.dayName(date);
    const plannedForDate = (window.PLANNED_ROUTINE || []).find(s => s.day === dayName)
      || { day: dayName, title: "Rest", type: "rest", focus: "", exercises: [] };

    if (date === sessionDate) {
      return {
        date,
        day: selectedDay,
        routineDay: selectedDay,
        title: planned.title || plannedForDate.title || "Rest",
        focus: planned.focus || plannedForDate.focus || "",
        exercises: allExercises,
        setsByKey: setsByExercise,
        skipKeys: skipProgressionKeys,
        rpe,
        notes,
        finished: sessionFinished
      };
    }

    const existingLogged = loggedSessionForDate(date);
    if (existingLogged) {
      const routineDay = window.RepsData.normalizeDayKey?.(existingLogged.routineDay || existingLogged.nominalDay) || dayName;
      const routinePlanned = (window.PLANNED_ROUTINE || []).find(s => s.day === routineDay) || plannedForDate;
      const loggedExercises = (existingLogged.entries || []).map((entry, i) =>
        exerciseFromLoggedEntry(entry, i, date)
      );
      const loggedSets = {};
      const skipped = new Set();
      (existingLogged.entries || []).forEach((entry, i) => {
        const key = loggedEntryKey(entry, i, date);
        loggedSets[key] = setsFromLoggedEntry(entry);
        if (existingLogged.ignoreForProgression || entry.ignoreForProgression) skipped.add(key);
      });
      return {
        date,
        day: routineDay,
        routineDay,
        title: existingLogged.split || routinePlanned.title || "Session",
        focus: routinePlanned.focus || "",
        exercises: loggedExercises,
        setsByKey: loggedSets,
        skipKeys: skipped,
        rpe: existingLogged.dailyMetrics?.rpe ?? "",
        notes: existingLogged.dayNote || "",
        finished: true
      };
    }

    const movedAway = routineSessionMovedAwayFromDate(app.activeProfile, date, dayName);
    const savedPlan = movedAway ? null : (app.activeProfile.sessionPlansByDate || {})[date];
    const base = [
      ...(plannedForDate.exercises || []).map((e, i) => ({
        ...e,
        name: window.RepsData.renamedExercise(e.name),
        _key: `p-${dayName}-${i}`
      })),
      ...((savedPlan?.extraExercises || []).map((e, i) => ({
        ...e,
        name: window.RepsData.renamedExercise(e.name),
        _key: e._key || `e-${i}`
      })))
    ].filter(e => !(new Set(savedPlan?.removedKeys || [])).has(e._key));
    const index = new Map(base.map((ex, i) => [ex._key, i]));
    const order = new Map((savedPlan?.exerciseOrder || []).map((key, i) => [key, i]));
    const exercises = [...base].sort((a, b) => {
      const aOrder = order.has(a._key) ? order.get(a._key) : (savedPlan?.exerciseOrder || []).length + index.get(a._key);
      const bOrder = order.has(b._key) ? order.get(b._key) : (savedPlan?.exerciseOrder || []).length + index.get(b._key);
      return aOrder - bOrder;
    });
    const setsByKey = {};
    exercises.forEach(ex => {
      const savedSets = savedPlan?.setsByExercise?.[ex._key];
      const last = window.RepsData.exerciseLastWeek?.(ex.name, currentWeekStart, { exercise: ex, routineDay: dayName });
      setsByKey[ex._key] = savedSets ? normalizeDraftSetsForExercise(savedSets, ex, last) : clipboardInitialSets(ex, last);
    });

    return {
      date,
      day: dayName,
      routineDay: dayName,
      title: plannedForDate.title || "Rest",
      focus: plannedForDate.focus || "",
      exercises,
      setsByKey,
      skipKeys: new Set(savedPlan?.skipProgressionKeys || []),
      rpe: savedPlan?.rpe || "",
      notes: savedPlan?.notes || "",
      finished: false
    };
  };

  const buildLogClipboard = () => {
    const c = LOG_CLIPBOARD_COLORS;
    const baseCell = {
      border: `1px solid ${c.hairline}`,
      padding: "4px 6px",
      height: "26px",
      "vertical-align": "middle",
      "font-family": '"Geist", Arial, sans-serif',
      "font-size": "12px",
      color: c.ink,
      background: c.surface,
      "mso-number-format": '"\\@"'
    };
    const mono = {
      "font-family": '"Geist Mono", "JetBrains Mono", monospace',
      "font-variant-numeric": "tabular-nums"
    };
    const mutedSmall = {
      ...mono,
      color: c.muted,
      "font-size": "10px"
    };
    const headerCell = {
      ...baseCell,
      ...mono,
      background: c.surface2,
      color: c.muted,
      "font-size": "10px",
      "font-weight": "600",
      "text-transform": "uppercase",
      "letter-spacing": "0.05em"
    };
    const rows = [];
    const textRows = [];
    const dates = plannedRoutine.length > 0
      ? window.RepsData.weekdays.map((_, i) => window.RepsData.addDays(currentWeekStart, i))
      : [sessionDate];
    const models = dates.map(buildClipboardModelForDate);

    models.forEach((model, modelIndex) => {
      const title = `${model.day} — ${model.title || "Rest"}${model.focus ? ` · ${model.focus}` : ""}`;
      const meta = [
        app.activeProfile.name,
        window.RepsData.shortDate(model.date),
        model.rpe ? `RPE ${model.rpe}` : "",
        model.notes ? `Notes: ${model.notes}` : ""
      ].filter(Boolean).join(" · ");

      if (modelIndex > 0) {
        rows.push(`<tr>${clipboardCell("", { colspan: LOG_CLIPBOARD_COL_COUNT, base: baseCell, style: { height: "8px", padding: "0", background: c.bg, border: "0" } })}</tr>`);
        textRows.push([]);
      }

      rows.push(`<tr>${clipboardCell(title, {
        colspan: LOG_CLIPBOARD_COL_COUNT,
        base: baseCell,
        style: { background: c.surface2, color: c.ink, "font-weight": "600", "font-size": "14px", border: `1px solid ${c.hairline2}` }
      })}</tr>`);
      rows.push(`<tr>${clipboardCell(meta, {
        colspan: LOG_CLIPBOARD_COL_COUNT,
        base: baseCell,
        style: { color: c.muted, "font-size": "11px", background: c.surface }
      })}</tr>`);
      rows.push(`<tr>${LOG_CLIPBOARD_COLS.map(label => clipboardCell(label, { tag: "th", base: headerCell })).join("")}</tr>`);

      textRows.push([title]);
      textRows.push([meta]);
      textRows.push(LOG_CLIPBOARD_COLS);

      if (!model.exercises.length) {
        rows.push(`<tr>${clipboardCell("(rest day)", {
          colspan: LOG_CLIPBOARD_COL_COUNT,
          base: baseCell,
          style: { color: c.muted, background: c.surface }
        })}</tr>`);
        textRows.push(["(rest day)", "", "", "", "", "", "", "", ""]);
        return;
      }

      model.exercises.forEach(ex => {
        const durationMode = isDurationExercise(ex);
        const lastEntry = window.RepsData.exerciseLastWeek?.(ex.name, currentWeekStart, { exercise: ex, routineDay: model.routineDay || model.day });
        const suggestion = window.RepsData.progressionSuggestion?.(ex, lastEntry, { rules: progressionRules });
        const progressionNote = progressionNoteLine(ex, lastEntry, suggestion);
        const setRows = model.setsByKey[ex._key]?.length
          ? model.setsByKey[ex._key]
          : clipboardInitialSets(ex, lastEntry);
        const target = `${ex.sets ?? ""} × ${ex.reps ?? ""}${ex.unit ? ` · ${ex.unit}` : ""}`;
        const skipLabel = model.skipKeys?.has(ex._key) ? " · skip next" : "";

        setRows.forEach((set, i) => {
          const first = i === 0;
          const edited = !!set._edited;
          const prefilled = !!set._prefilled && !edited;
          const entered = clipboardSetEntered(set, durationMode);
          const inputStyle = edited
            ? { background: c.accentSoft, border: `1px solid ${c.accentLine}` }
            : prefilled
              ? { background: c.surface2, color: c.muted, border: `1px dashed ${c.hairline2}` }
              : { background: c.bg };
          const setNumStyle = model.finished && entered
            ? { ...mono, "text-align": "center", background: c.goodSoft, color: c.good, "font-weight": "600" }
            : { ...mono, "text-align": "center", background: c.surface2, color: c.muted };
          const lastValue = formatLastSetValue(lastEntry?.sets?.[i] || null, durationMode);
          const weightValue = durationMode ? (set.duration ?? "") : (set.weight ?? "");
          const unitValue = durationMode ? "min" : (set.unit || "kg");
          const repsValue = durationMode ? (set.reps ?? "") : (set.reps ?? "");
          const exerciseHtml = first ? [
            `<div style="${attrEscape(inlineStyle({ color: c.ink, "font-weight": "600", "white-space": "nowrap" }))}">${htmlEscape(ex.name)}</div>`,
            `<div style="${attrEscape(inlineStyle(mutedSmall))}">${htmlEscape(ruleLabel(ex, progressionRules) + skipLabel)}</div>`
          ].join("") : "";
          const targetHtml = first ? [
            `<div style="${attrEscape(inlineStyle({ ...mono, color: c.ink2 }))}">${htmlEscape(target)}</div>`,
            suggestion ? `<div style="${attrEscape(inlineStyle({ ...mutedSmall, color: suggestion.tone === "good" ? c.good : suggestion.tone === "warn" ? c.warn : c.muted }))}">${htmlEscape(suggestion.headline)}</div>` : ""
          ].join("") : "";

          rows.push(`<tr>${
            [
              clipboardCell(first ? `${ex.name} ${ruleLabel(ex, progressionRules)}` : "", { base: baseCell, html: exerciseHtml }),
              clipboardCell(first ? `${target}${suggestion ? ` ${suggestion.headline}` : ""}` : "", { base: baseCell, html: targetHtml }),
              clipboardCell(lastValue, { base: baseCell, style: { ...mono, "text-align": "center", color: c.muted, background: c.surface2 } }),
              clipboardCell(i + 1, { base: baseCell, style: setNumStyle }),
              clipboardCell(weightValue, { base: baseCell, style: { ...mono, ...inputStyle } }),
              clipboardCell(unitValue, { base: baseCell, style: { ...mono, "text-align": "center", ...inputStyle } }),
              clipboardCell(repsValue, { base: baseCell, style: { ...mono, ...inputStyle } }),
              clipboardCell(set.rpe ?? "", { base: baseCell, style: { ...mono, ...inputStyle } }),
              clipboardCell(set.note ?? "", { base: baseCell, style: { ...inputStyle, "font-family": '"Geist", Arial, sans-serif' } })
            ].join("")
          }</tr>`);

          textRows.push([
            first ? `${ex.name} (${ruleLabel(ex, progressionRules)}${skipLabel})` : "",
            first ? `${target}${suggestion ? ` | ${suggestion.headline}` : ""}` : "",
            lastValue,
            i + 1,
            weightValue,
            unitValue,
            repsValue,
            set.rpe ?? "",
            set.note ?? ""
          ]);
        });

        if (progressionNote) {
          const noteColor = suggestion?.tone === "good" ? c.good : suggestion?.tone === "warn" ? c.bad : c.ink2;
          rows.push(`<tr>${
            clipboardCell("Plan", { base: baseCell, style: { ...mutedSmall, background: c.surface2, "text-transform": "uppercase", "letter-spacing": "0.05em" } }) +
            clipboardCell(progressionNote, { colspan: LOG_CLIPBOARD_COL_COUNT - 1, base: baseCell, style: { color: noteColor, background: c.surface2 } })
          }</tr>`);
          textRows.push(["Plan", progressionNote, "", "", "", "", "", "", ""]);
        }
      });
    });

    const html = [
      "<html><body>",
      `<table cellspacing="0" cellpadding="0" style="${attrEscape(inlineStyle({
        "border-collapse": "collapse",
        background: c.bg,
        color: c.ink,
        "font-family": '"Geist", Arial, sans-serif',
        "font-size": "12px"
      }))}">`,
      `<colgroup>${LOG_CLIPBOARD_COLGROUP}</colgroup>`,
      rows.join(""),
      "</table>",
      "</body></html>"
    ].join("");

    const text = textRows
      .map(row => row.map(tsvCell).join("\t"))
      .join("\n");

    return { html, text };
  };

  const handleCopyWeek = async () => {
    const payload = buildLogClipboard();
    try {
      await copyRichTextToClipboard(payload);
      setCopyState("copied");
    } catch (e) {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState(""), 2200);
  };

  const handleFinish = () => {
    // Build entries from current state
    const entries = allExercises.map(ex => {
      const durationMode = isDurationExercise(ex);
      const sets = (setsByExercise[ex._key] || []).filter(s => clipboardSetEntered(s, durationMode));
      return {
        logKey: ex._key,
        exercise: ex.name,
        movementGroup: window.RepsData.movementFor(ex.name),
        targetSets: ex.sets,
        targetReps: ex.reps,
        ignoreForProgression: skipProgressionKeys.has(ex._key),
        sets: sets.map((s, i) => {
          const isBW = !durationMode && s.unit === "bw";
          const additionalWeight = durationMode || s.weight === "" ? null : Number(s.weight);
          return {
            set: i + 1,
            weight: isBW ? additionalWeight : (durationMode || s.weight === "" ? null : Number(s.weight)),
            unit: s.unit,
            bwBase: isBW && avgBW != null ? avgBW : undefined,
            reps: durationMode ? 0 : (s.reps === "" ? null : Number(s.reps)),
            repsNumber: durationMode ? 0 : (s.reps === "" ? null : Number(s.reps)),
            durationMinutes: durationMode ? Number(s.duration || durationFromTarget(ex)) || null : null,
            rpe: s.rpe || null,
            note: s.note || null
          };
        }),
        status: "performed",
        notes: []
      };
    }).filter(e => e.sets.length > 0);

    if (entries.length === 0) {
      setFinishStatus("empty");
      setTimeout(() => setFinishStatus(""), 2200);
      return;
    }

    const totalSets = entries.reduce((s, e) => s + e.sets.length, 0);
    // Replace any previously-saved logged session for this routine slot (idempotent finish/move)
    const existing = window.RepsData.sessionForRoutineSlot?.(plannedDate, selectedDay) ||
      loggedSessionForDate(sessionDate, selectedDay);
    if (existing) {
      app.removeLoggedSession?.(existing.id);
      app.clearSessionEdit?.(existing.id);
    }
    const session = {
      id: existing?.id || `local:${app.activeProfile.id}:${plannedDate}:${planned.day}:${Date.now()}`,
      block: "Local",
      weekStart: window.RepsData.mondayOf(sessionDate),
      date: sessionDate,
      plannedDate,
      plannedWeekStart: window.RepsData.mondayOf(plannedDate),
      routineDay: planned.day,
      nominalDay: planned.day,
      split: planned.title,
      dayNote: notes || null,
      entries,
      dailyMetrics: { rpe: rpe ? Number(rpe) : null },
      ignoreForProgression: false,
      performedSetCount: totalSets,
      plannedExerciseCount: entries.length,
      status: "performed",
      source: "local"
    };

    app.addLoggedSession?.(session);

    setFinishStatus("saved");
    setTimeout(() => setFinishStatus(""), 2400);
    // FIX: do NOT reset extras/removals/sets — the user's adjustments to this day should stick.
  };

  const handleAddExercise = () => {
    if (!newExName.trim()) return;
    const item = exerciseCatalog.find(e => e.name === newExName);
    const m = newExTarget.match(/(\d+)\s*[x×]\s*(.+)/);
    const sets = m ? Number(m[1]) : (item?.targetSets || 3);
    const reps = m ? m[2] : (item?.targetReps || "8-12");
    const key = `e-${Date.now().toString(36)}`;
    setExtraExercises(arr => [...arr, {
      _key: key,
      name: newExName.trim(),
      sets,
      reps,
      unit: item?.unit || item?.lastUnit || newExUnit,
      rule: item?.rule || newExRule,
      track: item?.track,
      duration: item?.duration
    }]);
    setExerciseOrder(arr => [...arr, key]);
    setNewExName("");
  };

  const handleQuickAdd = (name) => {
    const item = exerciseCatalog.find(e => e.name === name);
    const key = `e-${Date.now().toString(36)}`;
    setExtraExercises(arr => [...arr, {
      _key: key,
      name,
      sets: item?.targetSets || 3,
      reps: item?.targetReps || (item?.duration ? `${item.duration} min` : "8-12"),
      unit: item?.unit || item?.lastUnit || "kg",
      rule: item?.rule || (item?.compound ? "compound" : "hypertrophy"),
      track: item?.track,
      duration: item?.duration
    }]);
    setExerciseOrder(arr => [...arr, key]);
  };

  const handleRemoveExercise = (key) => {
    setRemovedKeys(set => new Set([...set, key]));
    setSkipProgressionKeys(set => {
      const next = new Set(set);
      next.delete(key);
      return next;
    });
  };

  const handleToggleExerciseProgression = (key, skip) => {
    setSkipProgressionKeys(set => {
      const next = new Set(set);
      if (skip) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const persistExerciseOrder = (keys) => {
    setExerciseOrder(keys);
    const existingLogged = loggedSessionForDate(sessionDate, selectedDay);
    const reorderedEntries = existingLogged ? reorderedLoggedEntriesForKeys(existingLogged, keys) : null;
    if (existingLogged && reorderedEntries && app.editSession) {
      const performedSetCount = reorderedEntries.reduce((sum, entry) =>
        sum + (entry.sets || []).filter(set =>
          set.weight != null || set.repsNumber != null || set.reps != null ||
          set.durationMinutes || set.duration || set.note
        ).length, 0);
      app.editSession(existingLogged.id, {
        entries: reorderedEntries,
        performedSetCount,
        plannedExerciseCount: reorderedEntries.length,
        _clearSessionPlanDates: [sessionDate, plannedDate]
      });
    }
  };

  const moveExercise = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const keys = allExercises.map(ex => ex._key);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    persistExerciseOrder(keys);
  };

  const moveExerciseByOffset = (key, offset) => {
    const keys = allExercises.map(ex => ex._key);
    const from = keys.indexOf(key);
    if (from < 0) return;
    const to = Math.max(0, Math.min(keys.length - 1, from + offset));
    if (from === to) return;
    const [moved] = keys.splice(from, 1);
    keys.splice(to, 0, moved);
    persistExerciseOrder(keys);
  };

  const handleResetDay = () => {
    if (!confirm("Reset this day back to the routine? This clears your overrides for this date.")) return;
    app.clearSessionPlan?.(sessionDate);
    const existingLogged = loggedSessionForDate(sessionDate, selectedDay);
    if (existingLogged) {
      hydrateLoggedSession(existingLogged);
      setHydratedPlanKey(planHydrationKey);
      return;
    }
    setExtraExercises([]);
    setRemovedKeys(new Set());
    setExerciseOrder([]);
    setSetsByExercise({});
    setRpe("");
    setNotes("");
    setSkipProgressionKeys(new Set());
    setHydratedPlanKey(planHydrationKey);
  };

  const plannedRoutine = window.PLANNED_ROUTINE || [];
  const noRoutine = plannedRoutine.length === 0;
  const ruleUsage = ruleUsageCounts(plannedRoutine);
  const sessionFinished = finishStatus === "saved" ||
    !!loggedSessionForDate(sessionDate, selectedDay);

  return (
    <div className="view log-view log-classic-view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Log</h1>
          <div className="page-sub">
            <span className="mono">{app.activeProfile.name}</span>
            <span className="dot-sep">·</span>
            {planned.title} day{planned.focus ? ` · ${planned.focus}` : ""}
          </div>
        </div>
      </div>

      <section className="log-workspace">
        {noRoutine && (
          <div className="log-alert-band">
            <h2>No routine yet</h2>
            <p>Create a routine in Routines to populate planned days. You can still log ad-hoc work below.</p>
          </div>
        )}

        <div className="log-session-bar">
          <div className="log-session-main">
            <div className="kpi-label">{selectedDay} · {window.RepsData.shortDate(plannedDate)}</div>
            <div className="session-title">{planned.title}</div>
            <div className="session-sub">{planned.focus || "No focus set"}</div>
          </div>
          <label className="log-session-field">
            <span>Actual date</span>
            <input type="date" value={sessionDate} onChange={e => handleDateChange(e.target.value)} />
          </label>
          <label className="log-session-field rpe-field">
            <span>RPE</span>
            <input value={rpe} onChange={e => setRpe(e.target.value)} placeholder="7.5" />
          </label>
          <label className="log-session-field notes-field">
            <span>Notes</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="how it felt, anything to remember..." />
          </label>
          {avgBW != null && <span className="session-bw mono">14d BW {avgBW.toFixed(1)} kg</span>}
          <div className="log-status-chips">
            {sessionFinished && <span className="chip good"><span className="dot ok"></span>Finished</span>}
            {finishStatus === "saved" && <span className="chip good">Session saved</span>}
            {finishStatus === "empty" && <span className="chip warn">Add at least one set first</span>}
            {copyState === "copied" && <span className="chip good">Copied to Sheets</span>}
            {copyState === "failed" && <span className="chip warn">Copy failed</span>}
          </div>
          <div className="log-session-actions">
            <button className="btn ghost sm" onClick={handleCopyWeek} title="Copy the visible week as a styled Log table">
              <LIcons.Download /> Copy week
            </button>
            <button className="btn ghost sm" onClick={handleResetDay} title="Clear all overrides for this date">Reset day</button>
            <button className="btn primary sm" onClick={handleFinish}><LIcons.Check /> Finish session</button>
          </div>
        </div>

        <WeekStrip
          weekStart={currentWeekStart}
          selectedDate={sessionDate}
          onPickDate={handleDateChange}
          onWeekShift={handleWeekShift}
          onToday={() => { setSessionDate(todayIso); setSelectedDay(todayDay); }} />

        <div className="classic-sheet-wrap">
          <div className="classic-sheet-head">
            <div>
              <h2>Workout sheet</h2>
              <div className="body-band-sub">{allExercises.length} exercises · previous sets prefilled where available</div>
            </div>
          </div>

          {allExercises.length === 0 ? (
            <div className="empty log-empty">
              {planned.exercises && planned.exercises.length === 0 ? "Rest day. No exercises planned." : "All exercises removed. Use Add below."}
            </div>
          ) : (
            <div className="log-sheet classic-log-sheet">
              <div className="sheet-lane-head">
                <div>Exercise</div>
                <div>Target</div>
                <div>Last</div>
                <div>Set</div>
                <div>Actual</div>
                <div>RPE</div>
                <div>Done</div>
                <div>Note</div>
              </div>
              {allExercises.map((ex, i) => (
                <ExerciseRow
                  key={ex._key}
                  exercise={ex}
                  sets={setsByExercise[ex._key] || []}
                  index={i}
                  totalExercises={allExercises.length}
                  avgBW={avgBW}
                  beforeDate={currentWeekStart}
                  routineDay={selectedDay}
                  finished={sessionFinished}
                  skipNextTargets={skipProgressionKeys.has(ex._key)}
                  onToggleSkipNextTargets={(skip) => handleToggleExerciseProgression(ex._key, skip)}
                  onUpdateSets={(sets) => setSetsByExercise(prev => ({ ...prev, [ex._key]: sets }))}
                  onRemove={() => handleRemoveExercise(ex._key)}
                  dragging={dragKey === ex._key}
                  onDragStart={(e) => {
                    setDragKey(ex._key);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", ex._key);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragKey || e.dataTransfer.getData("text/plain");
                    moveExercise(from, ex._key);
                    setDragKey(null);
                  }}
                  onDragEnd={() => setDragKey(null)}
                  onMoveUp={() => moveExerciseByOffset(ex._key, -1)}
                  onMoveDown={() => moveExerciseByOffset(ex._key, 1)}
                  progressionRules={progressionRules}
                />
              ))}
            </div>
          )}

          <div className="ex-add log-add-exercise">
            <select value={newExName} onChange={e => applyCatalogChoice(e.target.value)}>
              <option value="">Choose exercise...</option>
              {exerciseCatalog.map(ex => (
                <option key={ex.name} value={ex.name}>{ex.name}</option>
              ))}
            </select>
            <input value={newExTarget} onChange={e => setNewExTarget(e.target.value)} placeholder="Target · 3 × 8-12" />
            <select value={newExUnit} onChange={e => setNewExUnit(e.target.value)}>
              <option>kg</option><option>lbs</option><option>bw</option><option>min</option>
            </select>
            <select value={newExRule} onChange={e => setNewExRule(e.target.value)}>
              {ruleOptions.map(rule => <option key={rule.key} value={rule.key}>{rule.label}</option>)}
            </select>
            <button className="btn primary sm" onClick={handleAddExercise} disabled={!newExName.trim()}><LIcons.Plus /> Add</button>
          </div>
        </div>

        <RulesSummary
          rules={progressionRules}
          usage={ruleUsage}
          expanded={rulesExpanded}
          onToggle={() => setRulesExpanded(v => !v)}
          profile={app.activeProfile}
          updateProfile={app.updateProfile}
          routineDays={plannedRoutine} />
      </section>
    </div>
  );
}

window.RepsLog = LogView;
