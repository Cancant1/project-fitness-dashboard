/* global React, RepsData, RepsIcons */
const { useState: useSv, useMemo: useSvMemo } = React;
const SVI = RepsIcons;

function isDurationEntry(entry = {}) {
  return /min|hour|hr|boxing|pt/i.test(`${entry.exercise} ${entry.targetReps}`) ||
    (entry.sets || []).some(s => s.durationMinutes || s.duration);
}

function parseTarget(target) {
  const text = String(target || "").trim();
  const m = text.match(/(\d+)\s*[x×]\s*(.+)/);
  return {
    sets: m ? Number(m[1]) : 3,
    reps: m ? m[2] : (text || "8-12")
  };
}

function targetFromCatalogItem(item) {
  if (!item) return "3 × 8-12";
  const sets = item.targetSets || 3;
  const reps = item.targetReps || (item.duration ? `${item.duration} min` : "8-12");
  return `${sets} × ${reps}`;
}

function durationMinutesFromTarget(item, reps) {
  if (item?.duration != null) return Number(item.duration);
  const m = String(reps || "").match(/(\d+(?:\.\d+)?)\s*(min|m|hour|hr|h)/i);
  if (!m) return 60;
  const value = Number(m[1]);
  return /hour|hr|h/i.test(m[2]) ? value * 60 : value;
}

function SessionsView({ setView }) {
  const app = window.RepsState.useApp();
  const hasHistory = !!app.activeProfile.hasHistory;
  const deletedIds = app.activeProfile.deletedSessionIds || [];
  const edits = app.activeProfile.sessionEdits || {};

  const [q, setQ] = useSv("");
  const [splitFilterValue, setSplitFilterValue] = useSv("All");
  const [showDeleted, setShowDeleted] = useSv(false);
  const [openEdit, setOpenEdit] = useSv(null);

  // Build merged session list with edits applied
  const sessions = useSvMemo(() => {
    const raw = RepsData.allSessions({ includeDeleted: showDeleted });
    return raw.map(s => {
      const edit = edits[s.id];
      return {
        ...s,
        ...(edit || {}),
        _deleted: deletedIds.includes(s.id),
        _edited: !!edit
      };
    }).filter(s => showDeleted || !s._deleted).sort((a,b) => b.date.localeCompare(a.date));
  }, [app.activeProfile, edits, deletedIds, showDeleted]);

  const splits = Array.from(new Set(sessions.map(s => s.split).filter(Boolean))).sort();

  const filtered = sessions.filter(s => {
    if (splitFilterValue !== "All" && s.split !== splitFilterValue) return false;
    if (q) {
      const text = (s.split + " " + s.date + " " + (s.entries || []).map(e => e.exercise).join(" ")).toLowerCase();
      if (!text.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const totalSets = filtered.reduce((s, x) => s + (x.performedSetCount || 0), 0);
  const totalVolume = filtered.reduce((sum, sess) => {
    return sum + (sess.entries || []).reduce((s, e) => {
      return s + (e.sets || []).reduce((acc, x) => acc + ((x.weight || 0) * (x.repsNumber || x.reps || 0)), 0);
    }, 0);
  }, 0);

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Sessions</h1>
          <div className="page-sub">
            <span className="mono">{sessions.length}</span> total · <span className="mono">{filtered.length}</span> shown · <span className="mono">{totalSets}</span> sets · <span className="mono">{Math.round(totalVolume).toLocaleString()}</span> kg total volume
          </div>
        </div>
        <div className="page-actions">
          {deletedIds.length > 0 && (
            <button className={`btn ${showDeleted ? "primary" : "ghost"} sm`} onClick={() => setShowDeleted(s => !s)}>
              {showDeleted ? "Hide deleted" : `Show deleted (${deletedIds.length})`}
            </button>
          )}
          <button className="btn primary sm" onClick={() => setView?.("log")}><SVI.Plus /> Log new</button>
        </div>
      </div>

      <div className="panel">
        <div className="ex-filters">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search · split · date · exercise…" />
          <button className={`ex-tag ${splitFilterValue === "All" ? "is-on" : ""}`} onClick={() => setSplitFilterValue("All")}>All</button>
          {splits.map(s => (
            <button key={s} className={`ex-tag ${splitFilterValue === s ? "is-on" : ""}`} onClick={() => setSplitFilterValue(s)}>{s}</button>
          ))}
          <span style={{marginLeft:"auto", color:"var(--muted)", fontSize:10}} className="mono">
            {filtered.length} of {sessions.length}
          </span>
        </div>
        <div className="panel-body tight">
          {filtered.length === 0 ? (
            <div className="empty" style={{margin: 14}}>
              {hasHistory ? "No sessions match." : "No sessions logged yet."}
            </div>
          ) : (
            <table className="tab">
              <thead>
                <tr>
                  <th>Actual</th>
                  <th>Routine</th>
                  <th>Split</th>
                  <th>Top lift</th>
                  <th className="num">Exercises</th>
                  <th className="num">Sets</th>
                  <th className="num">Volume</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const topEntry = (s.entries || [])[0];
                  const topSet = topEntry?.sets?.[0];
                  const topSetText = topSet?.durationMinutes || topSet?.duration
                    ? `${topSet.durationMinutes || topSet.duration} min`
                    : topSet ? `${topSet.weight}${topSet.unit} × ${topSet.repsNumber || topSet.reps}` : "";
                  const volume = (s.entries || []).reduce((sum, e) => sum + (e.sets || []).reduce((a,x) => a + ((x.weight||0)*(x.repsNumber||x.reps||0)), 0), 0);
                  const routineDay = RepsData.normalizeDayKey?.(s.routineDay || s.nominalDay) || RepsData.dayName(s.plannedDate || s.date);
                  const plannedDate = s.plannedDate || (routineDay
                    ? RepsData.addDays(s.plannedWeekStart || s.weekStart || RepsData.mondayOf(s.date), RepsData.weekdays.indexOf(routineDay))
                    : s.date);
                  const moved = plannedDate && plannedDate !== s.date;
                  return (
                    <tr key={s.id} style={{
                      cursor: "pointer",
                      opacity: s._deleted ? 0.45 : 1,
                      textDecoration: s._deleted ? "line-through" : "none"
                    }} onClick={() => setOpenEdit(s.id)}>
                      <td>
                        <div className="mono">{RepsData.shortDate(s.date)}</div>
                        {moved && <div className="muted" style={{fontSize:10}}>moved from {RepsData.shortDate(plannedDate)}</div>}
                      </td>
                      <td>
                        <div className="mono">{routineDay || "—"}</div>
                        <div className="muted" style={{fontSize:10}}>{RepsData.dayName(s.date)}</div>
                      </td>
                      <td>
                        <span className={`plan-type ${(s.split || "").toLowerCase().includes("push") ? "push" : (s.split || "").toLowerCase().includes("pull") ? "pull" : (s.split || "").toLowerCase().includes("leg") ? "legs" : "opt"}`}>{s.split || "—"}</span>
                      </td>
                      <td>
                        {topEntry && (
                          <>
                            <div style={{fontSize:12}}>{topEntry.exercise}</div>
                            {topSetText && <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{topSetText}</div>}
                          </>
                        )}
                      </td>
                      <td className="num">{s.entries?.length || 0}</td>
                      <td className="num">{s.performedSetCount || 0}</td>
                      <td className="num mono">{Math.round(volume).toLocaleString()}</td>
                      <td className="shrink" onClick={e => e.stopPropagation()}>
                        <div style={{display:"flex", gap:2}}>
                          {s._deleted ? (
                            <button className="btn ghost sm" title="Restore" onClick={() => app.restoreSession(s.id)}>Restore</button>
                          ) : (
                            <>
                              <button className="btn ghost sm icon-only" title="Edit"
                                onClick={() => setOpenEdit(s.id)}><SVI.Settings /></button>
                              <button className="btn ghost sm icon-only" title="Delete session"
                                onClick={() => { if (confirm(`Delete session on ${RepsData.shortDate(s.date)} (${s.split})? This can be restored.`)) app.deleteSession(s.id); }}><SVI.X /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openEdit && <SessionEditModal sessionId={openEdit} onClose={() => setOpenEdit(null)} />}
    </div>
  );
}

function SessionEditModal({ sessionId, onClose }) {
  const app = window.RepsState.useApp();
  const edits = app.activeProfile.sessionEdits || {};
  const original = RepsData.allSessions().find(s => s.id === sessionId);
  if (!original) return null;

  const editsForSession = edits[sessionId] || {};

  const [date, setDate] = useSv(original.date);
  const [split, setSplit] = useSv(original.split);
  const [status, setStatus] = useSv(original.status || "performed");
  const [notes, setNotes] = useSv(original.notes || original.dayNote || "");
  const [entries, setEntries] = useSv(() =>
    structuredClone(original.entries || []).map(e => ({
      ...e,
      ignoreForProgression: !!(e.ignoreForProgression || original.ignoreForProgression)
    }))
  );
  const [newExerciseName, setNewExerciseName] = useSv("");
  const [newExerciseTarget, setNewExerciseTarget] = useSv("3 × 8-12");
  const [newExerciseUnit, setNewExerciseUnit] = useSv("kg");
  const [newExerciseGroup, setNewExerciseGroup] = useSv("Pull");
  const exerciseCatalog = useSvMemo(
    () => RepsData.exerciseCatalog(app.activeProfile.customExercises || [], app.activeProfile.hiddenExercises || []),
    [app.activeProfile]
  );
  const routineDay = RepsData.normalizeDayKey?.(original.routineDay || original.nominalDay) ||
    RepsData.dayName(original.plannedDate || original.date);
  const plannedDate = original.plannedDate || (
    routineDay
      ? RepsData.addDays(original.plannedWeekStart || original.weekStart || RepsData.mondayOf(original.date), RepsData.weekdays.indexOf(routineDay))
      : original.date
  );
  const moved = plannedDate && date !== plannedDate;

  const applyNewExerciseChoice = (name) => {
    const item = exerciseCatalog.find(e => e.name === name);
    setNewExerciseName(name);
    if (!item) return;
    setNewExerciseUnit(item.unit || item.lastUnit || "kg");
    setNewExerciseGroup(item.group || RepsData.movementFor(name));
    setNewExerciseTarget(targetFromCatalogItem(item));
  };

  const updateEntry = (eIdx, patch) => {
    setEntries(arr => arr.map((e, i) => i !== eIdx ? e : { ...e, ...patch }));
  };

  const applyEntryExerciseChoice = (eIdx, name) => {
    const item = exerciseCatalog.find(e => e.name === name);
    const patch = {
      exercise: name,
      movementGroup: item?.group || RepsData.movementFor(name)
    };
    if (item?.targetSets) patch.targetSets = item.targetSets;
    if (item?.targetReps) patch.targetReps = item.targetReps;
    updateEntry(eIdx, patch);
  };

  const updateSet = (eIdx, sIdx, field, value) => {
    setEntries(arr => arr.map((e, i) => i !== eIdx ? e : {
      ...e,
      sets: e.sets.map((s, j) => j !== sIdx ? s : {
        ...s,
        [field]: field === "weight" || field === "reps" || field === "repsNumber" || field === "durationMinutes"
          ? (value === "" ? null : Number(value))
          : value
      })
    }));
  };

  const removeSet = (eIdx, sIdx) => {
    setEntries(arr => arr.map((e, i) => i !== eIdx ? e : {
      ...e, sets: e.sets.filter((_, j) => j !== sIdx)
    }));
  };

  const removeEntry = (eIdx) => {
    setEntries(arr => arr.filter((_, i) => i !== eIdx));
  };

  const addEntry = () => {
    const name = newExerciseName.trim();
    if (!name) return;
    const item = exerciseCatalog.find(e => e.name === name);
    const parsed = parseTarget(newExerciseTarget);
    const durationMode = item?.track === "duration" || item?.duration != null || /min|hour|hr|boxing|pt/i.test(`${name} ${parsed.reps}`);
    setEntries(arr => [
      ...arr,
      {
        exercise: name,
        movementGroup: item?.group || newExerciseGroup || RepsData.movementFor(name),
        targetSets: parsed.sets,
        targetReps: parsed.reps,
        ignoreForProgression: false,
        sets: Array.from({ length: parsed.sets }, (_, i) => ({
          set: i + 1,
          weight: null,
          unit: durationMode ? "min" : newExerciseUnit,
          reps: durationMode ? 0 : null,
          repsNumber: durationMode ? 0 : null,
          durationMinutes: durationMode ? durationMinutesFromTarget(item, parsed.reps) : null,
          rpe: null,
          note: null
        })),
        status: "performed",
        notes: []
      }
    ]);
    setNewExerciseName("");
  };

  const addSet = (eIdx) => {
    setEntries(arr => arr.map((e, i) => i !== eIdx ? e : {
      ...e,
      sets: [...e.sets, isDurationEntry(e)
        ? { set: e.sets.length + 1, weight: null, unit: "min", reps: 0, repsNumber: 0, durationMinutes: e.sets[e.sets.length-1]?.durationMinutes || 60, rpe: null, note: null }
        : { set: e.sets.length + 1, weight: e.sets[e.sets.length-1]?.weight || null, unit: e.sets[e.sets.length-1]?.unit || "kg", reps: null, repsNumber: null, note: null }]
    }));
  };

  const save = () => {
    const performedSetCount = entries.reduce((sum, e) => sum + (e.sets || []).filter(s =>
      s.weight != null || s.repsNumber != null || s.reps != null || s.durationMinutes || s.duration || s.note
    ).length, 0);
    app.editSession(sessionId, {
      date,
      weekStart: RepsData.mondayOf(date),
      routineDay,
      nominalDay: routineDay,
      plannedDate,
      plannedWeekStart: RepsData.mondayOf(plannedDate),
      split,
      status,
      notes,
      entries,
      ignoreForProgression: false,
      performedSetCount,
      plannedExerciseCount: entries.length,
      _clearSessionPlanDates: [original.date, date, plannedDate]
    });
    onClose();
  };

  const reset = () => {
    if (confirm("Discard all your edits and revert this session to the original data?")) {
      app.clearSessionEdit(sessionId);
      onClose();
    }
  };

  return (
    <div onClick={onClose}
      style={{position:"fixed", inset:0, zIndex:50, background:"rgba(10,10,10,0.5)", display:"grid", placeItems:"center", padding:20}}>
      <div onClick={e => e.stopPropagation()}
        style={{width:"min(820px,100%)", height:"min(800px,92vh)", background:"var(--surface)", border:"var(--hair)", borderRadius:"var(--r-lg)", boxShadow:"var(--shadow-2)", display:"flex", flexDirection:"column", overflow:"hidden"}}>
        <div className="panel-head" style={{padding:"12px 16px"}}>
          <div>
            <h2 style={{margin:0, fontSize:"var(--t-xl)", fontWeight:600, letterSpacing:"-0.015em"}}>Edit session</h2>
            <div className="kpi-label" style={{marginTop:4}}>
              <span className="mono">{original.id}</span>
              <span style={{margin:"0 6px", color:"var(--faint)"}}>·</span>
              {original.block} · week {original.weekNumber}
            </div>
          </div>
          <div style={{display:"flex", gap:6}}>
            {edits[sessionId] && <button className="btn ghost sm" onClick={reset}>Revert to original</button>}
            <button className="btn ghost sm icon-only" onClick={onClose}><SVI.X /></button>
          </div>
        </div>

        {/* Meta row */}
        <div style={{padding:"10px 16px", borderBottom:"var(--hair)", display:"grid", gridTemplateColumns:"auto auto auto auto 1fr", gap:14, alignItems:"end"}}>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Actual date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)", fontFamily:"var(--font-mono)"}} />
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Routine slot</div>
            <div className="mono" style={{height:30, display:"flex", alignItems:"center", padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--surface-2)", fontSize:"var(--t-xs)", color: moved ? "var(--accent-ink)" : "var(--muted)"}}>
              {routineDay || "—"} · {RepsData.shortDate(plannedDate)}{moved ? " moved" : ""}
            </div>
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Split</div>
            <input value={split} onChange={e => setSplit(e.target.value)}
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)", width:140}} />
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Status</div>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
              <option>performed</option><option>partial</option><option>skipped</option><option>deload</option>
            </select>
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Notes</div>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="add a note…"
              style={{width:"100%", height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}} />
          </div>
        </div>

        {/* Entries — scrollable */}
        <div style={{flex:1, overflow:"auto", padding:"6px 0"}}>
          <div style={{padding:"8px 16px", borderBottom:"var(--hair)", display:"grid", gridTemplateColumns:"2fr 1fr 90px 110px auto", gap:8, alignItems:"center"}}>
            <select
              value={newExerciseName}
              onChange={e => applyNewExerciseChoice(e.target.value)}
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
              <option value="">Choose exercise…</option>
              {exerciseCatalog.map(ex => <option key={ex.name} value={ex.name}>{ex.name}</option>)}
            </select>
            <input
              value={newExerciseTarget}
              onChange={e => setNewExerciseTarget(e.target.value)}
              placeholder="3 × 8-12"
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)", fontFamily:"var(--font-mono)"}} />
            <select
              value={newExerciseUnit}
              onChange={e => setNewExerciseUnit(e.target.value)}
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
              <option>kg</option><option>lbs</option><option>bw</option><option>min</option>
            </select>
            <select
              value={newExerciseGroup}
              onChange={e => setNewExerciseGroup(e.target.value)}
              style={{height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
              <option>Push</option><option>Pull</option><option>Legs</option><option>Other</option><option>Conditioning</option>
            </select>
            <button className="btn primary sm" onClick={addEntry} disabled={!newExerciseName.trim()}><SVI.Plus /> Add exercise</button>
          </div>
          {entries.length === 0 ? (
            <div className="empty" style={{margin:14}}>All exercises removed. Add some back from Log when finished.</div>
          ) : entries.map((entry, eIdx) => {
            const durationMode = isDurationEntry(entry);
            return (
              <div key={eIdx} className="exercise-row" style={{borderBottom: "var(--hair)"}}>
                <div className="ex-head" style={{gridTemplateColumns:"24px minmax(220px,1fr) 120px auto auto auto"}}>
                  <span className="ex-num">{String(eIdx+1).padStart(2,"0")}</span>
                  <div className="ex-name">
                    <select
                      value={entry.exercise}
                      onChange={e => applyEntryExerciseChoice(eIdx, e.target.value)}
                      style={{width:"100%", height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontWeight:500, fontSize:"var(--t-md)"}}>
                      {!exerciseCatalog.find(ex => ex.name === entry.exercise) && <option value={entry.exercise}>{entry.exercise}</option>}
                      {exerciseCatalog.map(ex => <option key={ex.name} value={ex.name}>{ex.name}</option>)}
                    </select>
                    <span className="ex-sub">exercise name</span>
                  </div>
                  <select
                    value={entry.movementGroup || RepsData.movementFor(entry.exercise)}
                    onChange={e => updateEntry(eIdx, { movementGroup: e.target.value })}
                    style={{height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-xs)", color:"var(--ink)"}}>
                    <option>Push</option><option>Pull</option><option>Legs</option><option>Other</option><option>Conditioning</option>
                  </select>
                  <span className="ex-target mono">target {entry.targetSets || 1} × {entry.targetReps || "?"}</span>
                  <label className={`sheet-skip-toggle ${entry.ignoreForProgression ? "is-on" : ""}`} title="Keep this exercise logged, but skip it for next target suggestions.">
                    <input
                      type="checkbox"
                      checked={!!entry.ignoreForProgression}
                      onChange={e => updateEntry(eIdx, { ignoreForProgression: e.target.checked })}
                    />
                    <span>skip next</span>
                  </label>
                  <button className="btn ghost sm icon-only" title="Remove exercise"
                    onClick={() => { if (confirm(`Remove ${entry.exercise} from this session?`)) removeEntry(eIdx); }}>
                    <SVI.X />
                  </button>
                </div>
                <div className="set-grid">
                  <div className={`set-head ${durationMode ? "duration" : ""}`}>
                    <span style={{textAlign:"center"}}>#</span>
                    <span>{durationMode ? "duration" : "weight"}</span>
                    {!durationMode && <span style={{textAlign:"center"}}>unit</span>}
                    <span>reps</span>
                    <span>rpe</span>
                    <span>note</span>
                    <span></span>
                  </div>
                  {(entry.sets || []).map((set, sIdx) => (
                    durationMode ? (
                      <div className="set-row duration is-done" key={sIdx}>
                        <div className="set-cell label-only mono">{sIdx + 1}</div>
                        <div className="set-cell">
                          <input value={set.durationMinutes ?? set.duration ?? ""} placeholder="60"
                            onChange={e => updateSet(eIdx, sIdx, "durationMinutes", e.target.value)} />
                          <span style={{marginLeft: 4, color: "var(--faint)", fontSize: 10, fontFamily: "var(--font-mono)"}}>min</span>
                        </div>
                        <div className="set-cell">
                          <input value={set.repsNumber ?? set.reps ?? 0} placeholder="0"
                            onChange={e => updateSet(eIdx, sIdx, "repsNumber", e.target.value)} />
                        </div>
                        <div className="set-cell">
                          <input value={set.rpe ?? ""} placeholder="RPE"
                            onChange={e => updateSet(eIdx, sIdx, "rpe", e.target.value)} />
                        </div>
                        <div className="set-cell">
                          <input value={set.note ?? ""} placeholder="note"
                            onChange={e => updateSet(eIdx, sIdx, "note", e.target.value)} />
                        </div>
                        <button className="btn ghost icon-only" style={{height: 30, width: 26}}
                          onClick={() => removeSet(eIdx, sIdx)} title="Remove set"><SVI.X /></button>
                      </div>
                    ) : (
                      <div className="set-row is-done" key={sIdx}>
                        <div className="set-cell label-only mono">{sIdx + 1}</div>
                        <div className="set-cell">
                          <input value={set.weight ?? ""} placeholder="weight"
                            onChange={e => updateSet(eIdx, sIdx, "weight", e.target.value)} />
                        </div>
                        <div className="set-cell" style={{padding:0}}>
                          <select value={set.unit || "kg"} onChange={e => updateSet(eIdx, sIdx, "unit", e.target.value)}
                            style={{textAlign:"center", color:"var(--muted)", padding:"0 4px", height:"100%", width:"100%"}}>
                            <option value="kg">kg</option><option value="lbs">lbs</option><option value="bw">bw</option>
                          </select>
                        </div>
                        <div className="set-cell">
                          <input value={set.repsNumber ?? set.reps ?? ""} placeholder="reps"
                            onChange={e => updateSet(eIdx, sIdx, "repsNumber", e.target.value)} />
                        </div>
                        <div className="set-cell">
                          <input value={set.rpe ?? ""} placeholder="RPE"
                            onChange={e => updateSet(eIdx, sIdx, "rpe", e.target.value)} />
                        </div>
                        <div className="set-cell">
                          <input value={set.note ?? ""} placeholder="note"
                            onChange={e => updateSet(eIdx, sIdx, "note", e.target.value)} />
                        </div>
                        <button className="btn ghost icon-only" style={{height: 30, width: 26}}
                          onClick={() => removeSet(eIdx, sIdx)} title="Remove set"><SVI.X /></button>
                      </div>
                    )
                  ))}
                  <button className="set-add" onClick={() => addSet(eIdx)}>
                    <SVI.Plus /> add set
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{padding:12, borderTop:"var(--hair)", background:"var(--surface-2)", display:"flex", justifyContent:"flex-end", gap:8}}>
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" onClick={save}><SVI.Check /> Save changes</button>
        </div>
      </div>
    </div>
  );
}

window.RepsSessions = SessionsView;
