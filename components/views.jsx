/* global React, RepsData, RepsCharts, RepsIcons */
const { useState, useMemo: _um, useEffect: _ue } = React;
const useS = useState;
const { LineArea: LA, Sparkline: SL } = RepsCharts;
const VI = RepsIcons;

/* =========================================================
   DEFAULT ROUTINE DATA (seeded from routine.js if no saved routines)
   ========================================================= */
function getDefaultRoutineDays() {
  // Use the globally loaded PLANNED_ROUTINE from routine.js as the default
  return window.PLANNED_ROUTINE || [];
}

/* =========================================================
   ROUTINES
   ========================================================= */
function ExerciseEditorRow({ ex, index, onUpdate, onRemove, catalog, ruleOptions, onDragStart, onDragOver, onDragEnter, onDrop, onDragEnd, isDragging, dropTarget }) {
  return (
    <tr
      onDragOver={e => { e.preventDefault(); onDragOver(index); }}
      onDragEnter={() => onDragEnter && onDragEnter(index)}
      onDrop={e => { e.preventDefault(); onDrop(index); }}
      style={{
        opacity: isDragging ? 0.45 : 1,
        boxShadow: dropTarget ? "inset 0 2px 0 var(--accent)" : "none"
      }}>
      <td className="shrink"
        draggable={true}
        onDragStart={e => onDragStart(index, e)}
        onDragEnd={onDragEnd}
        style={{color: "var(--faint)", textAlign: "center", userSelect: "none", padding: "0 4px", cursor: "grab"}}
        title="Drag to reorder">
        ⋮⋮
      </td>
      <td style={{fontWeight:500}}>
        <input value={ex.name} onChange={e => onUpdate({name: e.target.value})}
          list="reps-exercise-catalog"
          placeholder="Pick or type exercise name…"
          style={{width:"100%", height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}} />
      </td>
      <td>
        <input value={ex.reps} onChange={e => onUpdate({reps: e.target.value})}
          placeholder="8-12"
          style={{width:70, height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", fontSize:"var(--t-sm)"}} />
      </td>
      <td>
        <input type="number" min="1" max="10" value={ex.sets} onChange={e => onUpdate({sets: Number(e.target.value)||1})}
          style={{width:44, height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", textAlign:"center", fontSize:"var(--t-sm)"}} />
      </td>
      <td>
        <select value={ex.unit} onChange={e => onUpdate({unit: e.target.value})}
          style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
          <option>kg</option><option>lbs</option><option>bw</option><option>min</option>
        </select>
      </td>
      <td>
        <select value={ex.rule} onChange={e => onUpdate({rule: e.target.value})}
          style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
          {(ruleOptions || []).map(rule => <option key={rule.key} value={rule.key}>{rule.label}</option>)}
        </select>
      </td>
      <td className="shrink">
        <button className="btn ghost sm icon-only" onClick={onRemove}><VI.X /></button>
      </td>
    </tr>
  );
}

function DayEditor({ day, onUpdate, onRemove, catalog, ruleOptions }) {
  const [newEx, setNewEx] = useState({ name: "", sets: 3, reps: "8-12", unit: "kg", rule: "hypertrophy" });
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const applyCatalogPick = (name) => {
    const item = (catalog || []).find(e => e.name === name);
    setNewEx(prev => ({
      ...prev,
      name,
      sets: item?.targetSets || prev.sets,
      reps: item?.targetReps || (item?.duration ? `${item.duration} min` : prev.reps),
      unit: item?.unit || item?.lastUnit || prev.unit,
      rule: item?.rule || (item?.compound ? "compound" : item?.group === "Conditioning" ? "safety" : prev.rule)
    }));
  };

  const addEx = () => {
    if (!newEx.name.trim()) return;
    onUpdate({ exercises: [...(day.exercises||[]), { ...newEx, name: newEx.name.trim() }] });
    setNewEx({ name: "", sets: 3, reps: "8-12", unit: "kg", rule: "hypertrophy" });
  };

  const updateEx = (i, patch) => {
    const exs = [...(day.exercises||[])];
    exs[i] = { ...exs[i], ...patch };
    onUpdate({ exercises: exs });
  };

  const removeEx = (i) => {
    onUpdate({ exercises: (day.exercises||[]).filter((_,j)=>j!==i) });
  };

  const handleDragStart = (i, ev) => {
    setDragFrom(i);
    // Required to start drag in Firefox
    try { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(i)); } catch (e) {}
  };
  const handleDragOver = (i) => {
    if (dragOver !== i) setDragOver(i);
  };
  const handleDrop = (toIndex) => {
    if (dragFrom == null || dragFrom === toIndex) { setDragFrom(null); setDragOver(null); return; }
    const exs = [...(day.exercises||[])];
    const [moved] = exs.splice(dragFrom, 1);
    // When dragging downward the target index shifts left by one after splice
    const insertAt = dragFrom < toIndex ? toIndex - 1 : toIndex;
    exs.splice(insertAt, 0, moved);
    onUpdate({ exercises: exs });
    setDragFrom(null);
    setDragOver(null);
  };
  const handleDragEnd = () => { setDragFrom(null); setDragOver(null); };

  const DAY_OPTIONS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const TYPE_OPTIONS = [
    { value:"push", label:"Push" },
    { value:"pull", label:"Pull" },
    { value:"legs", label:"Legs" },
    { value:"full", label:"Full Body" },
    { value:"box",  label:"Boxing" },
    { value:"opt",  label:"Optional" },
    { value:"rest", label:"Rest" }
  ];

  return (
    <div style={{border:"var(--hair)", borderRadius:"var(--r-sm)", marginBottom:10, overflow:"hidden"}}>
      <div style={{display:"grid", gridTemplateColumns:"80px 1fr 120px auto", gap:8, padding:"8px 10px", background:"var(--surface-2)", alignItems:"center"}}>
        <select value={day.day} onChange={e => onUpdate({day: e.target.value})}
          style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontWeight:600}}>
          {DAY_OPTIONS.map(d => <option key={d}>{d}</option>)}
        </select>
        <input value={day.focus||""} onChange={e => onUpdate({focus: e.target.value})}
          placeholder="Focus / description"
          style={{height:26, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}} />
        <select value={day.type} onChange={e => {
          const found = TYPE_OPTIONS.find(t => t.value === e.target.value);
          onUpdate({ type: e.target.value, title: found?.label || e.target.value });
        }}
          style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)"}}>
          {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className="btn ghost sm icon-only" onClick={onRemove} title="Remove day"><VI.X /></button>
      </div>
      <div style={{padding:"8px 10px"}}>
        <table className="tab" style={{marginBottom:6}}>
          <thead>
            <tr>
              <th style={{width: 18}}></th>
              <th>Exercise</th>
              <th>Reps</th>
              <th>Sets</th>
              <th>Unit</th>
              <th>Rule</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(day.exercises||[]).map((ex, i) => (
              <ExerciseEditorRow key={i} ex={ex}
                index={i}
                catalog={catalog}
                ruleOptions={ruleOptions}
                onUpdate={patch => updateEx(i, patch)}
                onRemove={() => removeEx(i)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                isDragging={dragFrom === i}
                dropTarget={dragOver === i && dragFrom !== null && dragFrom !== i} />
            ))}
          </tbody>
        </table>
        <div style={{display:"grid", gridTemplateColumns:"2fr 80px 44px 60px 100px auto", gap:6, alignItems:"center"}}>
          <select value={newEx.name} onChange={e => applyCatalogPick(e.target.value)}
            style={{height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
            <option value="">Choose exercise…</option>
            {(catalog || []).map(ex => (
              <option key={ex.name} value={ex.name}>{ex.name}{ex.group ? ` · ${ex.group}` : ""}</option>
            ))}
          </select>
          <input value={newEx.reps} onChange={e => setNewEx(s=>({...s,reps:e.target.value}))}
            placeholder="8-12"
            style={{height:26, padding:"0 6px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", fontSize:"var(--t-sm)"}} />
          <input type="number" min="1" max="10" value={newEx.sets} onChange={e => setNewEx(s=>({...s,sets:Number(e.target.value)||1}))}
            style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", textAlign:"center", fontSize:"var(--t-sm)"}} />
          <select value={newEx.unit} onChange={e => setNewEx(s=>({...s,unit:e.target.value}))}
            style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
            <option>kg</option><option>lbs</option><option>bw</option><option>min</option>
          </select>
          <select value={newEx.rule} onChange={e => setNewEx(s=>({...s,rule:e.target.value}))}
            style={{height:26, padding:"0 4px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}>
            {(ruleOptions || []).map(rule => <option key={rule.key} value={rule.key}>{rule.label}</option>)}
          </select>
          <button className="btn primary sm" onClick={addEx} disabled={!newEx.name.trim()}><VI.Plus /></button>
        </div>
      </div>
    </div>
  );
}

function RoutineEditor({ routine, onSave, onCancel }) {
  const app = window.RepsState.useApp();
  const catalog = _um(
    () => RepsData.exerciseCatalog(app.activeProfile.customExercises || [], app.activeProfile.hiddenExercises || []),
    [app.activeProfile]
  );
  const ruleOptions = window.RepsProgressionRuleOptions
    ? window.RepsProgressionRuleOptions(app.activeProfile)
    : [
      { key: "hypertrophy", label: "Hypertrophy" },
      { key: "compound", label: "Compound" },
      { key: "safety", label: "Safety" }
    ];
  const [name, setName] = useState(routine.name || "");
  const [days, setDays] = useState(() => JSON.parse(JSON.stringify(routine.days || [])));

  const updateDay = (i, patch) => setDays(ds => ds.map((d,j) => j===i ? {...d,...patch} : d));
  const removeDay = (i) => setDays(ds => ds.filter((_,j) => j!==i));
  const addDay = () => {
    const used = new Set(days.map(d => d.day));
    const all = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const next = all.find(d => !used.has(d)) || "Mon";
    setDays(ds => [...ds, { day: next, title: "Training", type: "push", focus: "", exercises: [] }]);
  };

  return (
    <div>
      {/* Shared datalist for free-typing exercises in editor rows */}
      <datalist id="reps-exercise-catalog">
        {catalog.map(ex => <option key={ex.name} value={ex.name} />)}
      </datalist>
      <div style={{display:"flex", gap:8, alignItems:"center", marginBottom:14}}>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Routine name"
          style={{flex:1, height:32, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)", fontWeight:500}} />
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
        <button className="btn primary sm" onClick={() => onSave({...routine, name: name.trim() || "Untitled", days})} disabled={!name.trim()}>
          <VI.Check /> Save routine
        </button>
      </div>
      {days.map((day, i) => (
        <DayEditor key={i} day={day}
          catalog={catalog}
          ruleOptions={ruleOptions}
          onUpdate={patch => updateDay(i, patch)}
          onRemove={() => removeDay(i)} />
      ))}
      <button className="btn ghost sm" style={{marginTop:6}} onClick={addDay}><VI.Plus /> Add day</button>
    </div>
  );
}

function Routines() {
  const app = window.RepsState.useApp();
  const { activeProfile, addRoutine, updateRoutine, deleteRoutine, setActiveRoutine } = app;
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");

  // Effective routines: if profile has none, show the static PLANNED_ROUTINE as read-only
  const savedRoutines = activeProfile.routines || [];
  const hasRoutines = savedRoutines.length > 0;
  const activeRoutineId = activeProfile.activeRoutineId;

  const effectiveRoutine = hasRoutines
    ? savedRoutines.find(r => r.id === activeRoutineId) || savedRoutines[0]
    : { id: null, name: "Push Pull Legs + Boxing (default)", days: getDefaultRoutineDays() };

  const handleSaveRoutine = (updated) => {
    if (updated.id && savedRoutines.find(r => r.id === updated.id)) {
      updateRoutine(updated.id, updated);
    } else {
      addRoutine(updated);
    }
    setEditingId(null);
    setShowNew(false);
  };

  const handleActivate = (id) => {
    setActiveRoutine(id);
    // Sync to PLANNED_ROUTINE immediately
    const r = savedRoutines.find(r => r.id === id);
    if (r && r.days) window.PLANNED_ROUTINE = r.days;
  };

  const handleImportDefault = () => {
    const days = getDefaultRoutineDays();
    if (!days.length) return;
    addRoutine({ name: "Push Pull Legs + Boxing", days: JSON.parse(JSON.stringify(days)) });
  };

  // Show editor if editing
  const editing = editingId ? savedRoutines.find(r => r.id === editingId) : null;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Routines</h1>
          <div className="page-sub">
            <span className="mono">{activeProfile.name}</span>
            <span style={{margin:"0 6px", color:"var(--faint)"}}>·</span>
            {savedRoutines.length} saved routine{savedRoutines.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="page-actions">
          {!hasRoutines && (
            <button className="btn sm" onClick={handleImportDefault}><VI.Plus /> Import default (PPL)</button>
          )}
          <button className="btn primary sm" onClick={() => { setShowNew(true); setEditingId(null); }}><VI.Plus /> New routine</button>
        </div>
      </div>

      {/* New routine form */}
      {showNew && (
        <div className="panel">
          <div className="panel-head">
            <h3>New routine</h3>
            <button className="btn ghost sm icon-only" onClick={() => setShowNew(false)}><VI.X /></button>
          </div>
          <div className="panel-body">
            <RoutineEditor
              routine={{ name: newRoutineName, days: [] }}
              onSave={handleSaveRoutine}
              onCancel={() => setShowNew(false)} />
          </div>
        </div>
      )}

      {/* Saved routines list */}
      {!hasRoutines && (
        <div className="panel">
          <div className="panel-body">
            <div className="kpi-label">
              No saved routines yet. Click "Import default (PPL)" to pull in the built-in schedule, or "New routine" to build one from scratch.
            </div>
          </div>
        </div>
      )}

      {savedRoutines.map(routine => (
        <div key={routine.id} className="panel">
          <div className="panel-head">
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <h3>{routine.name}</h3>
              {routine.id === activeRoutineId && <span className="chip accent">active</span>}
              <span className="mono muted" style={{fontSize:10}}>{(routine.days||[]).length} days</span>
            </div>
            <div style={{display:"flex", gap:6}}>
              {routine.id !== activeRoutineId && (
                <button className="btn ghost sm" onClick={() => handleActivate(routine.id)}>Set active</button>
              )}
              <button className="btn ghost sm" onClick={() => { setEditingId(routine.id); setShowNew(false); }}>Edit</button>
              <button className="btn ghost sm icon-only"
                onClick={() => { if (confirm(`Delete routine "${routine.name}"?`)) deleteRoutine(routine.id); }}><VI.X /></button>
            </div>
          </div>

          {editingId === routine.id ? (
            <div className="panel-body">
              <RoutineEditor routine={routine} onSave={handleSaveRoutine} onCancel={() => setEditingId(null)} />
            </div>
          ) : (
            <div className="panel-body">
              <div className="routine-pills" style={{flexWrap:"wrap"}}>
                {(routine.days||[]).map((d,i) => (
                  <div key={i} className={`routine-pill ${d.type === "rest" ? "" : "is-active"}`} style={{cursor:"default"}}>
                    <span className="day">{d.day}</span>
                    <span>{d.title}</span>
                    <span className="mono muted" style={{fontSize:9}}>{(d.exercises||[]).length}ex</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {window.RepsProgressionRuleStudio && (
        <div className="panel routines-progression-panel">
          <window.RepsProgressionRuleStudio
            profile={activeProfile}
            updateProfile={app.updateProfile}
            routineDays={effectiveRoutine.days || []}
            compact
            title="Progression rules" />
        </div>
      )}
    </div>
  );
}

/* =========================================================
   EXERCISES (Database) — with sortable headers
   ========================================================= */
function SortHeader({ label, field, sort, onSort, align }) {
  const isActive = sort.field === field;
  return (
    <th className={align === "num" ? "num" : ""}
      style={{cursor:"pointer", userSelect:"none", whiteSpace:"nowrap"}}
      onClick={() => onSort(field)}>
      {label}
      {isActive && <span style={{marginLeft:4, fontSize:9, color:"var(--accent-ink)"}}>{sort.dir === "asc" ? "▲" : "▼"}</span>}
    </th>
  );
}

function Exercises() {
  const app = window.RepsState.useApp();
  const hasHistory = !!app.activeProfile.hasHistory;
  const customs = app.activeProfile.customExercises || [];
  const hidden = app.activeProfile.hiddenExercises || [];

  const allEx = _um(
    () => RepsData.exerciseCatalog(customs, hidden),
    [app.activeProfile]
  );

  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [openModal, setOpenModal] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("Push");
  const [newUnit, setNewUnit] = useState("kg");
  const [newCompound, setNewCompound] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [sort, setSort] = useState({ field: "sets", dir: "desc" });
  const groups = ["All", "Compound", "Push", "Pull", "Legs"];

  const handleSort = (field) => {
    setSort(s => s.field === field
      ? { field, dir: s.dir === "asc" ? "desc" : "asc" }
      : { field, dir: field === "sets" ? "desc" : "asc" });
  };

  const enrich = (e) => {
    const custom = customs.find(c => c.name === e.name);
    return { ...e, isCompound: !!(custom?.compound ?? RepsData.isCompoundName(e.name)) };
  };
  const enriched = allEx.map(enrich);

  const filtered = enriched.filter(e => {
    if (filter === "Compound") { if (!e.isCompound) return false; }
    else if (filter !== "All" && e.group !== filter) return false;
    if (q && !e.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    switch (sort.field) {
      case "name":    va = a.name; vb = b.name; break;
      case "group":   va = a.group||""; vb = b.group||""; break;
      case "lastDate": va = a.lastDate||""; vb = b.lastDate||""; break;
      case "lastWeight": va = a.lastWeight||0; vb = b.lastWeight||0; break;
      case "sets":    va = a.sets||0; vb = b.sets||0; break;
      default:        va = a.sets||0; vb = b.sets||0;
    }
    if (typeof va === "string") {
      return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sort.dir === "asc" ? va - vb : vb - va;
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    app.addCustomExercise({ name: newName.trim(), group: newGroup, unit: newUnit, compound: newCompound });
    setNewName(""); setNewCompound(false); setShowAdd(false);
  };

  const startRename = (name) => { setRenaming(name); setRenameValue(name); };
  const saveRename = () => {
    const next = renameValue.trim();
    if (renaming && next) app.renameExercise?.(renaming, next);
    setRenaming(null); setRenameValue("");
  };
  const trendFor = (name) => {
    const trend = RepsData.exerciseSetTrend?.(name, 8) || [];
    return trend.length ? trend : null;
  };

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Exercises</h1>
          <div className="page-sub">
            <span className="mono">{allEx.length}</span> exercises · {hasHistory ? "derived from logged sessions + custom" : "your custom list"}
            {hidden.length > 0 && <> · <span className="mono">{hidden.length}</span> hidden</>}
          </div>
        </div>
        <div className="page-actions">
          {hidden.length > 0 && (
            <button className="btn ghost sm" onClick={() => hidden.forEach(n => app.unhideExercise(n))}>
              Restore {hidden.length} hidden
            </button>
          )}
          <button className="btn primary sm" onClick={() => setShowAdd(s => !s)}><VI.Plus /> New exercise</button>
        </div>
      </div>

      {showAdd && (
        <div className="panel">
          <div className="panel-head">
            <h3>Add a new exercise</h3>
            <button className="btn ghost sm icon-only" onClick={() => setShowAdd(false)}><VI.X /></button>
          </div>
          <div className="panel-body" style={{display:"grid", gridTemplateColumns:"2fr 1fr 1fr auto auto", gap: 8, alignItems:"end"}}>
            <div>
              <div className="kpi-label" style={{marginBottom:4}}>Name</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                placeholder="Trap bar deadlift, Pec deck, …"
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                style={{width:"100%", height:32, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:4}}>Group</div>
              <select value={newGroup} onChange={e => setNewGroup(e.target.value)}
                style={{width:"100%", height:32, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}}>
                <option>Push</option><option>Pull</option><option>Legs</option><option>Conditioning</option><option>Other</option>
              </select>
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:4}}>Unit</div>
              <select value={newUnit} onChange={e => setNewUnit(e.target.value)}
                style={{width:"100%", height:32, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}}>
                <option>kg</option><option>lbs</option><option>bw</option><option>min</option>
              </select>
            </div>
            <label style={{display:"flex", alignItems:"center", gap:6, height:32, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background: newCompound ? "var(--accent-soft)" : "var(--bg)", cursor:"pointer", fontSize:"var(--t-sm)", color: newCompound ? "var(--accent-ink)" : "var(--ink)"}}>
              <input type="checkbox" checked={newCompound} onChange={e => setNewCompound(e.target.checked)} style={{margin:0}} />
              <span style={{fontWeight: 500}}>Compound</span>
            </label>
            <button className="btn primary sm" onClick={handleAdd} disabled={!newName.trim()}><VI.Plus /> Add</button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="ex-filters">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search · 'cable' · 'curl' · 'press' …" />
          {groups.map(g => (
            <button key={g} className={`ex-tag ${filter === g ? "is-on" : ""}`} onClick={() => setFilter(g)}>{g}</button>
          ))}
          <span style={{marginLeft:"auto", color:"var(--muted)", fontSize:10}} className="mono">
            {sorted.length} of {allEx.length}
          </span>
        </div>
        <div className="panel-body tight">
          {sorted.length === 0 ? (
            <div className="empty" style={{margin: 14}}>
              {hasHistory ? "No exercises match." : "No exercises yet. Click 'New exercise' to add your first."}
            </div>
          ) : (
            <table className="tab">
              <thead>
                <tr>
                  <th style={{width:24}}></th>
                  <SortHeader label="Exercise" field="name" sort={sort} onSort={handleSort} />
                  <SortHeader label="Group" field="group" sort={sort} onSort={handleSort} />
                  <SortHeader label="Last seen" field="lastDate" sort={sort} onSort={handleSort} />
                  <SortHeader label="Last load" field="lastWeight" sort={sort} onSort={handleSort} align="num" />
                  <SortHeader label="Sets" field="sets" sort={sort} onSort={handleSort} align="num" />
                  <th>Trend</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 60).map((e, i) => (
                  <tr key={i}
                    style={{cursor: e.sets > 0 ? "pointer" : "default"}}
                    onClick={() => e.sets > 0 && setOpenModal(e.name)}>
                    <td className="shrink"><span className={`fav-star ${i % 5 === 0 ? "on" : ""}`}>★</span></td>
                    <td style={{fontWeight:500}} onClick={ev => renaming === e.name && ev.stopPropagation()}>
                      {renaming === e.name ? (
                        <div style={{display:"flex", gap:6, alignItems:"center"}}>
                          <input value={renameValue} autoFocus onChange={ev => setRenameValue(ev.target.value)}
                            onKeyDown={ev => { if (ev.key === "Enter") saveRename(); if (ev.key === "Escape") { setRenaming(null); setRenameValue(""); } }}
                            style={{width:"min(320px, 100%)", height:28, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}} />
                          <button className="btn primary sm" onClick={saveRename}>Save</button>
                          <button className="btn ghost sm" onClick={() => { setRenaming(null); setRenameValue(""); }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          {e.name}
                          {e.isCompound && <span className="chip" style={{marginLeft:6, fontSize:10, background:"var(--accent-soft)", color:"var(--accent-ink)", borderColor:"var(--accent-line)", padding:"0 5px", height:18}}>compound</span>}
                          {e.custom && <span className="chip" style={{marginLeft:6, fontSize:10}}>custom</span>}
                        </>
                      )}
                    </td>
                    <td><span className={`plan-type ${e.group?.toLowerCase()}`}>{e.group || "Other"}</span></td>
                    <td className="mono muted">{e.lastDate ? `${RepsData.shortDate(e.lastDate)} · ${RepsData.daysBetween(e.lastDate)}d ago` : "—"}</td>
                    <td className="num">{e.lastWeight ? `${e.lastWeight}${e.lastUnit} × ${e.lastReps}` : "—"}</td>
                    <td className="num">{e.sets}</td>
                    <td>
                      {e.sets > 0 && (
                        <div style={{width:80}}>
                          <SL data={trendFor(e.name) || [e.sets]} width={80} height={18} accent />
                        </div>
                      )}
                    </td>
                    <td className="shrink">
                      <div style={{display:"flex", gap:2}}>
                        <button className="btn ghost sm" title="Rename everywhere"
                          onClick={(ev) => { ev.stopPropagation(); startRename(e.name); }}>Rename</button>
                        <button className="btn ghost sm icon-only" title="Hide this exercise"
                          onClick={(ev) => { ev.stopPropagation(); if (confirm(`Hide "${e.name}" from the list?`)) app.hideExercise(e.name); }}>
                          <VI.X />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openModal && <window.ExerciseModal name={openModal} onClose={() => setOpenModal(null)} onRemove={(n) => app.hideExercise(n)} />}
    </div>
  );
}

/* =========================================================
   BODY + FOOD
   ========================================================= */
function AddFoodModal({ onClose, onAdd, onSaveToCatalog, activeProfile, updateProfile, targetDate }) {
  const [mode, setMode] = useS("catalog");
  const [q, setQ] = useS("");
  const [picked, setPicked] = useS(null);
  const [amount, setAmount] = useS(1);
  const [showHidden, setShowHidden] = useS(false);
  const [qName, setQName] = useS("");
  const [qKcal, setQKcal] = useS("");
  const [qProtein, setQProtein] = useS("");
  const [qCarbs, setQCarbs] = useS("");
  const [qFat, setQFat] = useS("");
  const [qSaveToLog, setQSaveToLog] = useS(false); // save as custom food item

  const hidden = activeProfile?.hiddenFoodItems || [];
  const items = allFoodCatalogItems(activeProfile, RepsData.foodItems);
  const hiddenKeys = new Set(hidden.map(foodProductKey));
  const dateLabel = targetDate ? RepsData.shortDate(targetDate) : "selected date";
  const filtered = items.filter(f => {
    if (!showHidden && hiddenKeys.has(foodProductKey(f.product))) return false;
    if (q && !f.product.toLowerCase().includes(q.toLowerCase()) && !(f.category || "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const groups = _um(() => {
    const map = new Map();
    for (const f of filtered) {
      const cat = f.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(f);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const hideItem = (productName, ev) => {
    ev?.stopPropagation();
    updateProfile?.(activeProfile.id, { hiddenFoodItems: [...new Set([...hidden, productName])] });
    if (picked?.product === productName) setPicked(null);
  };

  const submitCatalog = () => {
    if (!picked) return;
    onAdd({
      product: picked.product,
      amount: Number(amount) || 1,
      kcal: Math.round(picked.kcalPerUnit * (Number(amount) || 1)),
      protein: Math.round(picked.proteinPerUnit * (Number(amount) || 1) * 10) / 10,
      carbs: 0, fat: 0
    });
    onClose();
  };

  const submitQuick = () => {
    if (!qName.trim() || !qKcal) return;
    const entry = {
      product: qName.trim(),
      amount: 1,
      kcal: Number(qKcal) || 0,
      protein: Number(qProtein) || 0,
      carbs: Number(qCarbs) || 0,
      fat: Number(qFat) || 0
    };
    onAdd(entry);
    // Also save to catalog if requested
    if (qSaveToLog && onSaveToCatalog) {
      onSaveToCatalog({
        product: qName.trim(),
        kcalPerUnit: Number(qKcal) || 0,
        proteinPerUnit: Number(qProtein) || 0,
        carbs: Number(qCarbs) || 0,
        fat: Number(qFat) || 0,
        category: "Custom"
      });
    }
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{position:"fixed", inset:0, zIndex:50, background:"rgba(10,10,10,0.4)", display:"grid", placeItems:"center", padding:20}}>
      <div onClick={e => e.stopPropagation()}
        style={{width:"min(640px, 100%)", height:"min(720px, 88vh)", background:"var(--surface)", border:"var(--hair)", borderRadius:"var(--r-lg)", boxShadow:"var(--shadow-2)", display:"flex", flexDirection:"column", overflow:"hidden"}}>
        <div className="panel-head">
          <div>
            <h3>Add food</h3>
            <div className="kpi-label" style={{marginTop:2}}>Log for {dateLabel} · catalog · or quick-add a one-off estimate</div>
          </div>
          <button className="btn ghost sm icon-only" onClick={onClose}><VI.X /></button>
        </div>

        <div style={{padding:"8px 14px", borderBottom:"var(--hair)", display:"flex", gap:4, alignItems:"center"}}>
          <button className={`ex-tag ${mode === "catalog" ? "is-on" : ""}`} onClick={() => setMode("catalog")}>From catalog</button>
          <button className={`ex-tag ${mode === "quick" ? "is-on" : ""}`} onClick={() => setMode("quick")}>Quick add</button>
          <button className={`ex-tag ${mode === "new" ? "is-on" : ""}`} onClick={() => setMode("new")}>New catalog entry</button>
          {mode === "catalog" && hidden.length > 0 && (
            <button className={`ex-tag ${showHidden ? "is-on" : ""}`} style={{marginLeft:"auto"}} onClick={() => setShowHidden(s => !s)}>
              {showHidden ? "Hide hidden" : `Show hidden (${hidden.length})`}
            </button>
          )}
        </div>

        {mode === "catalog" && (
          <>
            <div style={{padding:"10px 14px", borderBottom:"var(--hair)"}}>
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus
                placeholder={`Search ${items.length} items · 'skyr' · 'kip' · 'tosti' …`}
                style={{width:"100%", height:32, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
            </div>
            <div style={{flex:1, overflow:"auto", minHeight:0}}>
              {filtered.length === 0 ? (
                <div className="empty" style={{margin: 14}}>No items match "{q}". Try Quick add or create a New catalog entry.</div>
              ) : (
                groups.map(([cat, list]) => (
                  <div key={cat}>
                    <div style={{padding:"5px 14px", background:"var(--surface-2)", borderBottom:"1px solid var(--hairline)", borderTop:"1px solid var(--hairline)", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em", position:"sticky", top:0, zIndex:1, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <span>{cat}</span><span style={{color:"var(--faint)"}}>{list.length}</span>
                    </div>
                    {list.map((f, i) => {
                      const isHidden = hiddenKeys.has(foodProductKey(f.product));
                      return (
                        <div key={f.product + "-" + i} onClick={() => setPicked(f)}
                          style={{display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:10, alignItems:"center", padding:"5px 14px", cursor:"pointer", background:picked?.product === f.product ? "var(--accent-soft)" : "transparent", borderBottom:"1px solid var(--hairline)", opacity:isHidden ? 0.5 : 1}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontWeight:500, fontSize:"var(--t-sm)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                              {f.product}
                              {f.id && <span className="chip" style={{marginLeft:6, fontSize:9}}>custom</span>}
                              {isHidden && <span className="chip" style={{marginLeft:6, fontSize:9}}>hidden</span>}
                            </div>
                          </div>
                          <div className="mono" style={{fontSize:11}}>{Math.round(f.kcalPerUnit)}k</div>
                          <div className="mono" style={{fontSize:11, color:"var(--good)", minWidth:36, textAlign:"right"}}>{f.proteinPerUnit}p</div>
                          <button className="btn ghost icon-only" style={{width:22, height:22}} title={isHidden ? "Restore" : "Hide from catalog"}
                            onClick={(ev) => { ev.stopPropagation(); if (isHidden) { updateProfile?.(activeProfile.id, { hiddenFoodItems: hidden.filter(n => n !== f.product) }); } else { hideItem(f.product, ev); } }}>
                            <VI.X />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div style={{padding:10, borderTop:"var(--hair)", background:"var(--surface-2)"}}>
              {picked ? (
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:500, fontSize:"var(--t-sm)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{picked.product}</div>
                    <div className="mono muted" style={{fontSize:10}}>per unit · {Math.round(picked.kcalPerUnit)} kcal · {picked.proteinPerUnit}g protein</div>
                  </div>
                  <input type="number" min="0.25" step="0.25" value={amount} onChange={e => setAmount(e.target.value)}
                    style={{width:64, height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--surface)", textAlign:"right", fontFamily:"var(--font-mono)"}} />
                  <span className="mono muted" style={{fontSize:10}}>×</span>
                  <div className="mono" style={{fontSize:11, minWidth:74, textAlign:"right"}}>
                    {Math.round(picked.kcalPerUnit * (Number(amount) || 1))}k · {(picked.proteinPerUnit * (Number(amount) || 1)).toFixed(1)}p
                  </div>
                  <button className="btn primary sm" onClick={submitCatalog}><VI.Plus /> Add</button>
                </div>
              ) : (
                <div className="kpi-label">Pick a food from the list above.</div>
              )}
            </div>
          </>
        )}

        {mode === "quick" && (
          <div style={{padding:14, display:"flex", flexDirection:"column", gap:12, flex:1, overflow:"auto"}}>
            <div className="kpi-label">Guessing it? Type the name and macros directly.</div>
            <div>
              <div className="kpi-label" style={{marginBottom:4}}>Name</div>
              <input value={qName} onChange={e => setQName(e.target.value)} autoFocus
                placeholder="e.g. Restaurant pasta · Friend's cake · Beer"
                style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8}}>
              {[["kcal","qKcal",setQKcal,qKcal,"600"],["protein g","qProtein",setQProtein,qProtein,"30"],["carbs g","qCarbs",setQCarbs,qCarbs,"60"],["fat g","qFat",setQFat,qFat,"20"]].map(([label,_k,setter,val,ph]) => (
                <div key={label}>
                  <div className="kpi-label" style={{marginBottom:4}}>{label}</div>
                  <input value={val} onChange={e => setter(e.target.value)} inputMode="numeric" placeholder={ph}
                    style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", textAlign:"right"}} />
                </div>
              ))}
            </div>
            <label style={{display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:"var(--t-sm)"}}>
              <input type="checkbox" checked={qSaveToLog} onChange={e => setQSaveToLog(e.target.checked)} />
              <span>Also save to my catalog (so I can pick it quickly next time)</span>
            </label>
            <div style={{marginTop:"auto", display:"flex", justifyContent:"flex-end", gap:8}}>
              <button className="btn ghost sm" onClick={onClose}>Cancel</button>
              <button className="btn primary sm" onClick={submitQuick} disabled={!qName.trim() || !qKcal}><VI.Plus /> Add entry</button>
            </div>
          </div>
        )}

        {mode === "new" && (
          <NewCatalogEntryForm onSave={(item) => { onSaveToCatalog && onSaveToCatalog(item); onClose(); }} onCancel={onClose} />
        )}
      </div>
    </div>
  );
}

function NewCatalogEntryForm({ onSave, onCancel }) {
  const [name, setName] = useS("");
  const [kcal, setKcal] = useS("");
  const [protein, setProtein] = useS("");
  const [carbs, setCarbs] = useS("");
  const [fat, setFat] = useS("");
  const [category, setCategory] = useS("Custom");

  const submit = () => {
    if (!name.trim() || !kcal) return;
    onSave({
      product: name.trim(),
      kcalPerUnit: Number(kcal) || 0,
      proteinPerUnit: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      category: category || "Custom"
    });
  };

  return (
    <div style={{padding:14, display:"flex", flexDirection:"column", gap:12, flex:1, overflow:"auto"}}>
      <div className="kpi-label">Create a new item in your personal catalog. It will appear in "From catalog" for future use.</div>
      <div>
        <div className="kpi-label" style={{marginBottom:4}}>Food name</div>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Greek yogurt, homemade protein bar"
          style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
      </div>
      <div>
        <div className="kpi-label" style={{marginBottom:4}}>Category</div>
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Dairy, Snacks, Custom…"
          style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
      </div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8}}>
        {[["kcal / unit",setKcal,kcal,"600"],["protein g",setProtein,protein,"30"],["carbs g",setCarbs,carbs,"60"],["fat g",setFat,fat,"20"]].map(([label,setter,val,ph]) => (
          <div key={label}>
            <div className="kpi-label" style={{marginBottom:4}}>{label}</div>
            <input value={val} onChange={e => setter(e.target.value)} inputMode="numeric" placeholder={ph}
              style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", textAlign:"right"}} />
          </div>
        ))}
      </div>
      <div style={{marginTop:"auto", display:"flex", justifyContent:"flex-end", gap:8}}>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
        <button className="btn primary sm" onClick={submit} disabled={!name.trim() || !kcal}><VI.Plus /> Save to catalog</button>
      </div>
    </div>
  );
}

function WeightEntryModal({ onClose, onSave, lookupExisting }) {
  const [date, setDate] = useS(window.RepsData.TODAY);
  const initial = lookupExisting ? lookupExisting(window.RepsData.TODAY) : null;
  const [weight, setWeight] = useS(initial && initial.value != null ? String(initial.value) : "");
  const [note, setNote] = useS(initial && initial.note ? initial.note : "");

  // When the user picks a different date, reflect any existing entry for that date.
  React.useEffect(() => {
    if (!lookupExisting) return;
    const existing = lookupExisting(date);
    setWeight(existing && existing.value != null ? String(existing.value) : "");
    setNote(existing && existing.note ? existing.note : "");
  }, [date]);

  const submit = () => {
    if (!weight) return;
    onSave({ date, weight: Number(weight), note });
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{position:"fixed", inset:0, zIndex:50, background:"rgba(10,10,10,0.4)", display:"grid", placeItems:"center", padding:20}}>
      <div onClick={e => e.stopPropagation()}
        style={{width:"min(440px,100%)", background:"var(--surface)", border:"var(--hair)", borderRadius:"var(--r-lg)", boxShadow:"var(--shadow-2)", overflow:"hidden"}}>
        <div className="panel-head">
          <h3>Log weight</h3>
          <button className="btn ghost sm icon-only" onClick={onClose}><VI.X /></button>
        </div>
        <div style={{padding:14, display:"flex", flexDirection:"column", gap:12}}>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)", fontFamily:"var(--font-mono)"}} />
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Weight (kg)</div>
            <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
              placeholder="79.5" autoFocus onKeyDown={e => e.key === "Enter" && submit()}
              style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)", fontFamily:"var(--font-mono)", textAlign:"right"}} />
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Note (optional)</div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="after fasted morning weigh-in"
              style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
          </div>
          <div style={{display:"flex", justifyContent:"flex-end", gap:8, marginTop:4}}>
            <button className="btn ghost sm" onClick={onClose}>Cancel</button>
            <button className="btn primary sm" onClick={submit} disabled={!weight}><VI.Plus /> Log</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Editable cell for the Daily log table — click value to turn it into an inline input.
function EditableNumberCell({ value, placeholder, suffix, onSave, onClear, color, allowDecimals, alignRight = true }) {
  const [editing, setEditing] = useS(false);
  const [draft, setDraft] = useS("");

  const start = () => {
    setDraft(value != null && value !== "" ? String(value) : "");
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") {
      onClear && onClear();
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    onSave(allowDecimals ? Math.round(n * 10) / 10 : Math.round(n));
  };

  if (editing) {
    return (
      <td className="num" style={{padding: 0}}>
        <input value={draft} autoFocus
          inputMode={allowDecimals ? "decimal" : "numeric"}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{width:"100%", height: 28, padding:"0 8px", border:"1px solid var(--accent-line)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", fontSize:"var(--t-sm)", textAlign: alignRight ? "right" : "left"}} />
      </td>
    );
  }

  return (
    <td className="num editable-number-cell" style={{cursor:"text", color}} onClick={start} title="Click to edit">
      {value != null && value !== "" ? (
        <>
          <span>{value}{suffix && <span style={{color:"var(--faint)", marginLeft: 3}}>{suffix}</span>}</span>
          {onClear && (
            <button
              className="cell-clear"
              type="button"
              title="Clear value"
              onClick={(e) => { e.stopPropagation(); onClear(); }}>
              <VI.X />
            </button>
          )}
        </>
      ) : (
        <span style={{color:"var(--faint)"}}>{placeholder || "—"}</span>
      )}
    </td>
  );
}

function EditableTextCell({ value, placeholder, onSave }) {
  const [editing, setEditing] = useS(false);
  const [draft, setDraft] = useS("");
  const start = () => { setDraft(value || ""); setEditing(true); };
  const commit = () => { setEditing(false); onSave(draft.trim()); };
  if (editing) {
    return (
      <td style={{padding: 0}}>
        <input value={draft} autoFocus onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={{width:"100%", height: 28, padding:"0 8px", border:"1px solid var(--accent-line)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}} />
      </td>
    );
  }
  return (
    <td className="muted" style={{cursor:"text"}} onClick={start} title="Click to edit">
      {value ? value : <span style={{color:"var(--faint)"}}>{placeholder || "—"}</span>}
    </td>
  );
}

function formatLedgerAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 1) return "";
  return `${Math.round(n * 100) / 100}x `;
}

function roundLedgerMacro(value, decimals = 0) {
  const n = Number(value) || 0;
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}

function LedgerFoodDetails({ date, foods, onAddFood, onRemoveFood }) {
  const totals = foods.reduce((sum, f) => ({
    kcal: sum.kcal + (Number(f.kcal) || 0),
    protein: sum.protein + (Number(f.protein) || 0),
    carbs: sum.carbs + (Number(f.carbs) || 0),
    fat: sum.fat + (Number(f.fat) || 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const hasCarbs = foods.some(f => Number(f.carbs) > 0);
  const hasFat = foods.some(f => Number(f.fat) > 0);

  return (
    <div className="ledger-food-detail">
      <div className="ledger-food-detail-head">
        <div>
          <strong>Logged foods</strong>
          <span className="muted"> {RepsData.shortDate(date)}</span>
        </div>
        <div className="ledger-food-detail-actions">
          <div className="mono">
            {foods.length} {foods.length === 1 ? "item" : "items"} · {Math.round(totals.kcal)} kcal · {roundLedgerMacro(totals.protein, 1)}g protein
          </div>
          <button className="btn primary sm" type="button" onClick={onAddFood} title={`Add food for ${RepsData.shortDate(date)}`}>
            <VI.Plus /> Add food
          </button>
        </div>
      </div>
      {foods.length === 0 ? (
        <div className="body-empty-line">No food logged for this date.</div>
      ) : (
        <div className="ledger-food-list">
          {foods.map((f, i) => (
            <div key={f.id || `${f.product}-${i}`} className="ledger-food-row">
              <div className="ledger-food-name">
                <span className="mono muted">{formatLedgerAmount(f.amount)}</span>
                {f.product || "Food item"}
              </div>
              <div className="ledger-food-macros">
                <span className="mono">{Math.round(Number(f.kcal) || 0)} kcal</span>
                <span className="mono good-text">{roundLedgerMacro(f.protein, 1)}g protein</span>
                {hasCarbs && <span className="mono muted">{roundLedgerMacro(f.carbs, 1)}g carbs</span>}
                {hasFat && <span className="mono muted">{roundLedgerMacro(f.fat, 1)}g fat</span>}
              </div>
              <button
                className="btn ghost icon-only ledger-food-remove"
                type="button"
                onClick={() => onRemoveFood?.(f.id)}
                title={`Remove ${f.product || "food item"}`}>
                <VI.X />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyLogTable({ bodyD, kcal, protein, activeProfile, updateProfile, updateDailyOverride, clearDailyOverride, selectedDate, onSelectDate, onAddFoodForDate, onRemoveFoodForDate, foodsOpen = true, onFoodsOpenChange, className = "" }) {
  const [rangeDays, setRangeDays] = useS("14");
  const today = window.RepsData.TODAY;
  const overrides = activeProfile.dailyOverrides || {};
  const foodByDate = activeProfile.foodByDate || {};
  const isAllRange = rangeDays === "all";
  const rangeLimit = Number(rangeDays) || 14;

  // Build the union of dates over the last N days, including all data sources.
  // This way the user can edit ANY past date even if there's nothing logged yet.
  const dates = _um(() => {
    const cutoff = isAllRange ? "0000-01-01" : window.RepsData.addDays(today, -rangeLimit + 1);
    const set = new Set();
    for (const b of bodyD) if (b.date >= cutoff) set.add(b.date);
    for (const k of kcal) if (k.date >= cutoff) set.add(k.date);
    for (const p of protein) if (p.date >= cutoff) set.add(p.date);
    for (const d of Object.keys(foodByDate)) if (d >= cutoff) set.add(d);
    for (const d of Object.keys(overrides)) if (d >= cutoff) set.add(d);
    // Always include every day in the window so empty days are visible & editable
    if (isAllRange) {
      const earliest = Array.from(set).filter(d => d <= today).sort((a, b) => a.localeCompare(b))[0] || today;
      for (let d = earliest; d <= today; d = window.RepsData.addDays(d, 1)) set.add(d);
    } else {
      for (let i = 0; i < rangeLimit; i++) set.add(window.RepsData.addDays(today, -i));
    }
    return Array.from(set).filter(d => d <= today).sort((a, b) => b.localeCompare(a));
  }, [bodyD, kcal, protein, foodByDate, overrides, isAllRange, rangeLimit]);

  const saveWeight = (date, weight) => {
    // Weight overrides write to dailyOverrides (single source for retroactive edits)
    updateDailyOverride(date, { weight });
  };
  const saveKcal = (date, value) => updateDailyOverride(date, { kcal: value });
  const saveProtein = (date, value) => updateDailyOverride(date, { protein: value });
  const saveNote = (date, note) => updateDailyOverride(date, { note });
  const clearField = (date, field) => clearDailyOverride(date, field);
  const overrideHas = (date, field) => Object.prototype.hasOwnProperty.call(overrides[date] || {}, field);
  const selectDateWithFoods = (date) => {
    if (selectedDate === date) {
      onFoodsOpenChange?.(!foodsOpen);
      return;
    }
    onSelectDate?.(date);
    if (!foodsOpen) onFoodsOpenChange?.(true);
  };

  const lookupKcal = (date) => {
    if (overrideHas(date, "kcal")) return overrides[date].kcal == null ? null : overrides[date].kcal;
    const food = foodByDate[date];
    if (food && food.length) return food.reduce((s, f) => s + (f.kcal || 0), 0);
    return kcal.find(x => x.date === date)?.value ?? null;
  };
  const lookupProtein = (date) => {
    if (overrideHas(date, "protein")) return overrides[date].protein == null ? null : overrides[date].protein;
    const food = foodByDate[date];
    if (food && food.length) return food.reduce((s, f) => s + (f.protein || 0), 0);
    return protein.find(x => x.date === date)?.value ?? null;
  };
  const lookupWeight = (date) => {
    if (overrideHas(date, "weight")) return overrides[date].weight == null ? null : overrides[date].weight;
    // Use the bodyD (which already merges histories + overrides) as source of truth
    return bodyD.find(b => b.date === date)?.value ?? null;
  };
  const lookupNote = (date) => {
    if (overrides[date]?.note != null) return overrides[date].note;
    return bodyD.find(b => b.date === date)?.note || "";
  };

  return (
    <div className={`panel daily-ledger-band ${className}`.trim()}>
      <div className="panel-head">
        <h3>Daily ledger</h3>
        <div style={{display:"flex", gap: 6, alignItems:"center", justifyContent:"flex-end", flexWrap:"wrap"}}>
          <span className="label">click any cell to edit</span>
          <button
            className={`btn ghost sm ledger-food-toggle ${foodsOpen ? "is-open" : ""}`}
            type="button"
            aria-expanded={!!foodsOpen}
            title={foodsOpen ? "Hide logged foods" : "Show logged foods"}
            onClick={() => onFoodsOpenChange?.(!foodsOpen)}>
            {foodsOpen ? <VI.ChevronDown /> : <VI.Chevron />} Logged foods
          </button>
          <select value={rangeDays} onChange={e => setRangeDays(e.target.value)} className="btn ghost sm" style={{padding:"0 8px"}}>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="all">All days</option>
          </select>
        </div>
      </div>
      <div className="panel-body tight">
        <table className="tab">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th className="num">Weight</th>
              <th className="num">Δ</th>
              <th className="num">kcal</th>
              <th className="num">protein</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date, i) => {
              const w = lookupWeight(date);
              const prevDate = dates[i + 1];
              const prevW = prevDate ? lookupWeight(prevDate) : null;
              const delta = (w != null && prevW != null) ? w - prevW : null;
              const k = lookupKcal(date);
              const p = lookupProtein(date);
              const note = lookupNote(date);
              const hasOverride = !!overrides[date];
              const foods = foodByDate[date] || [];
              const isSelected = selectedDate === date;
              const dateFoodTitle = isSelected && foodsOpen ? "Hide logged foods for this date" : "Show logged foods for this date";
              return (
                <React.Fragment key={date}>
                  <tr className={`ledger-row ${isSelected ? "is-selected" : ""}`.trim()}>
                    <td>
                      <button className="ledger-date-btn mono" onClick={() => selectDateWithFoods(date)} type="button" title={dateFoodTitle}>
                        {RepsData.shortDate(date)}
                      </button>
                    </td>
                    <td>
                      <button className="ledger-date-btn muted" onClick={() => selectDateWithFoods(date)} type="button" title={dateFoodTitle}>
                        {RepsData.dayName(date)}
                      </button>
                    </td>
                    <EditableNumberCell
                      value={w != null ? w.toFixed(1) : null}
                      placeholder="kg"
                      suffix="kg"
                      allowDecimals
                      onSave={(v) => saveWeight(date, v)}
                      onClear={() => clearField(date, "weight")} />
                    <td className="num" style={{color: delta == null ? "var(--muted)" : delta < 0 ? "var(--good)" : delta > 0 ? "var(--bad)" : "var(--muted)"}}>
                      {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                    </td>
                    <EditableNumberCell
                      value={k != null ? Math.round(k) : null}
                      placeholder="kcal"
                      onSave={(v) => saveKcal(date, v)}
                      onClear={() => clearField(date, "kcal")} />
                    <EditableNumberCell
                      value={p != null ? Math.round(p) : null}
                      placeholder="g"
                      suffix="g"
                      onSave={(v) => saveProtein(date, v)}
                      onClear={() => clearField(date, "protein")} />
                    <EditableTextCell
                      value={note}
                      placeholder="add note…"
                      onSave={(v) => saveNote(date, v)} />
                    <td className="shrink" style={{padding: "0 6px"}}>
                      {hasOverride && (
                        <button className="btn ghost sm icon-only" style={{width: 20, height: 20, color:"var(--faint)"}}
                          title="Reset manual entries for this date"
                          onClick={() => { if (confirm(`Clear manual entries for ${RepsData.shortDate(date)}?`)) clearDailyOverride(date); }}>
                          <VI.X />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isSelected && foodsOpen && (
                    <tr className="ledger-food-detail-row">
                      <td colSpan="8">
                        <LedgerFoodDetails
                          date={date}
                          foods={foods}
                          onAddFood={() => onAddFoodForDate?.(date)}
                          onRemoveFood={(id) => onRemoveFoodForDate?.(date, id)} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ADAPTIVE_TDEE_WINDOWS = [14, 28, 42, 56];

function signedKgRate(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)} kg/wk`;
}

function signedKcal(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Math.round(Number(value));
  return `${n > 0 ? "+" : ""}${n} kcal`;
}

function avgMacroKcal(profile) {
  const days = window.RepsState?.DAY_KEYS || ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const values = days.map(day => Number(profile.macros?.[day]?.kcal)).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
}

function confidenceChipClass(level) {
  if (level === "high") return "good";
  if (level === "medium") return "cool";
  if (level === "low") return "warn";
  return "warn";
}

function macroProgressPercent(value, target) {
  const v = Number(value) || 0;
  const t = Math.max(Number(target) || 0, 1);
  return Math.min(100, Math.max(0, (v / t) * 100));
}

function formatKcalValue(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.round(Number(value)).toLocaleString();
}

function goalEta(profile, estimate, currentWeight) {
  const rawTarget = profile?.targetWeight;
  const target = rawTarget == null || rawTarget === "" ? NaN : Number(rawTarget);
  const weeklyRate = Number(estimate?.weeklyRateKg);
  const current = Number(currentWeight);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return null;
  const gap = target - current;
  if (Math.abs(gap) < 0.1) return { status: "done", label: "At target", weeks: 0, date: RepsData.TODAY };
  if (!Number.isFinite(weeklyRate) || Math.abs(weeklyRate) < 0.01) return { status: "flat", label: "Trend flat" };
  if (Math.sign(gap) !== Math.sign(weeklyRate)) return { status: "away", label: "Trend away from target" };
  const weeks = Math.abs(gap / weeklyRate);
  if (!Number.isFinite(weeks) || weeks > 156) return { status: "far", label: ">3 years" };
  const date = RepsData.addDays(RepsData.TODAY, Math.round(weeks * 7));
  return { status: "ready", label: `${Math.ceil(weeks)} wk · ${RepsData.shortDate(date)}`, weeks, date };
}

function buildTrajectoryModel(profile, estimate, bodyD) {
  const history = (bodyD || [])
    .filter(d => d?.date && d.date <= RepsData.TODAY && Number.isFinite(Number(d.value)))
    .slice(-90);
  const latest = history[history.length - 1] || null;
  const rawTarget = profile?.targetWeight;
  const targetWeight = rawTarget == null || rawTarget === "" ? NaN : Number(rawTarget);
  const eta = goalEta(profile, estimate, latest?.value);
  if (history.length < 2) return { ready: false, history, latest, targetWeight, eta };

  const startDate = history[0].date;
  const trendDaily = Number(estimate?.weightChangePerDay);
  let futureDays = 42;
  if (eta?.weeks > 0) futureDays = Math.min(168, Math.max(28, Math.round(eta.weeks * 7)));
  const endDate = RepsData.addDays(RepsData.TODAY, futureDays);
  const spanDays = Math.max(1, RepsData.daysBetween(startDate, endDate) || 1);
  const projectionDays = latest ? Math.max(1, RepsData.daysBetween(latest.date, endDate) || 1) : futureDays;
  const projectedWeight = Number.isFinite(trendDaily) && latest ? latest.value + trendDaily * projectionDays : null;

  const values = history.map(d => Number(d.value));
  if (Number.isFinite(targetWeight)) values.push(targetWeight);
  if (Number.isFinite(projectedWeight)) values.push(projectedWeight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const yMin = min - spread * 0.18;
  const yMax = max + spread * 0.18;
  const width = 800;
  const height = 168;
  const padX = 14;
  const padY = 12;
  const xFor = (date) => padX + ((RepsData.daysBetween(startDate, date) || 0) / spanDays) * (width - padX * 2);
  const yFor = (value) => height - padY - ((Number(value) - yMin) / Math.max(yMax - yMin, 1)) * (height - padY * 2);
  const path = history
    .map((d, i) => `${i ? "L" : "M"} ${xFor(d.date).toFixed(1)} ${yFor(d.value).toFixed(1)}`)
    .join(" ");
  const projectionPath = Number.isFinite(projectedWeight) && latest
    ? `M ${xFor(latest.date).toFixed(1)} ${yFor(latest.value).toFixed(1)} L ${xFor(endDate).toFixed(1)} ${yFor(projectedWeight).toFixed(1)}`
    : "";
  const targetY = Number.isFinite(targetWeight) ? yFor(targetWeight) : null;

  return {
    ready: true,
    history,
    latest,
    targetWeight,
    eta,
    width,
    height,
    path,
    projectionPath,
    targetY,
    startDate,
    endDate
  };
}

function EnergyCommandBand({ profile, estimate, windowDays, setWindowDays, updateProfile, onApply }) {
  const phases = window.RepsState?.PHASES || {};
  const savedTarget = avgMacroKcal(profile);
  const targetDelta = estimate?.ready && savedTarget != null
    ? estimate.recommendedTargetKcal - savedTarget
    : null;
  const savedMaintenance = Number(profile.maintenanceKcal);
  const maintenanceDelta = estimate?.ready && Number.isFinite(savedMaintenance)
    ? estimate.adaptiveMaintenanceKcal - savedMaintenance
    : null;
  const chipLevel = estimate?.confidence?.level || "insufficient";
  const phase = phases[profile.phase || "maintain"] || { rate: 0, kcalDelta: 0, label: "Maintain" };
  const targetWeight = profile.targetWeight == null ? null : Number(profile.targetWeight);
  const ready = !!estimate?.ready;

  return (
    <section className="body-band energy-command-band">
      <div className="body-band-head energy-command-head">
        <div>
          <h2>Energy Command</h2>
          <div className="body-band-sub">
            {estimate?.ready
              ? `${estimate.counts.weightDays} weights · ${estimate.counts.kcalDays} food days · ${estimate.counts.spanDays}d span`
              : estimate?.reason || "waiting for data"}
          </div>
        </div>
        <div className="energy-head-actions">
          <span className={`chip ${confidenceChipClass(chipLevel)}`}>{estimate?.confidence?.label || "need data"}</span>
          <div className="adaptive-window-switch" aria-label="TDEE window">
            {ADAPTIVE_TDEE_WINDOWS.map(days => (
              <button key={days}
                className={`adaptive-window-btn ${Number(windowDays) === days ? "is-on" : ""}`}
                onClick={() => setWindowDays(days)}>
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="energy-command-layout">
        <div className="energy-command-primary">
          <div className="kpi-label">Adaptive maintenance</div>
          <div className="energy-main-number tnum">
            <span>{ready ? formatKcalValue(estimate.adaptiveMaintenanceKcal) : "—"}</span>
            {ready && <em>kcal</em>}
          </div>
          <div className="energy-support mono">
            saved {Number.isFinite(savedMaintenance) ? `${Math.round(savedMaintenance)} kcal` : "—"}
            {maintenanceDelta != null && <> · {signedKcal(maintenanceDelta)}</>}
          </div>
          {!ready && <div className="energy-empty">{estimate?.reason || "Need more weight and food data."}</div>}
        </div>

        <div className="energy-command-target">
          <div className="kpi-label">Recommended target avg</div>
          <div className="energy-target-number tnum">
            <span>{ready ? formatKcalValue(estimate.recommendedTargetKcal) : "—"}</span>
            {ready && <em>kcal</em>}
          </div>
          <div className="energy-support mono">
            current avg {savedTarget != null ? `${savedTarget} kcal` : "—"}
            {targetDelta != null && <> · {signedKcal(targetDelta)}</>}
          </div>
          <button className="btn primary sm energy-apply-btn" onClick={onApply} disabled={!ready}>
            <VI.Check /> Apply target
          </button>
        </div>

        <div className="energy-control-panel">
          <div className="energy-control-grid">
            <label>
              <span className="kpi-label">Phase</span>
              <select value={profile.phase || "maintain"} onChange={e => updateProfile(profile.id, { phase: e.target.value })}>
                {Object.entries(phases).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
              </select>
            </label>
            <label>
              <span className="kpi-label">Target weight</span>
              <input type="number" step="0.1" value={profile.targetWeight ?? ""}
                onChange={e => updateProfile(profile.id, { targetWeight: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
            <label className="energy-advanced-control">
              <span className="kpi-label">Saved maintenance</span>
              <input type="number" step="25" value={profile.maintenanceKcal ?? 2700}
                onChange={e => updateProfile(profile.id, { maintenanceKcal: Number(e.target.value) || 2700 })} />
            </label>
          </div>
        </div>
      </div>

      <div className="energy-quality-strip">
        <div>
          <span>Observed trend</span>
          <strong className="tnum">{signedKgRate(estimate?.weeklyRateKg)}</strong>
        </div>
        <div>
          <span>Avg intake</span>
          <strong className="tnum">{estimate?.avgKcal != null ? `${formatKcalValue(estimate.avgKcal)} kcal` : "—"}</strong>
        </div>
        <div>
          <span>Selected phase</span>
          <strong>{phase.label} · {signedKgRate(phase.rate)}</strong>
        </div>
        <div>
          <span>Target weight</span>
          <strong className="tnum">{Number.isFinite(targetWeight) ? `${targetWeight.toFixed(1)} kg` : "—"}</strong>
        </div>
      </div>
    </section>
  );
}

function MacroProgressRow({ label, value, target, unit = "", fillClass = "" }) {
  const roundedValue = Math.round(Number(value) || 0);
  const roundedTarget = Math.round(Number(target) || 0);
  return (
    <div className="today-macro-row">
      <span className="lbl">{label}</span>
      <div className="bar-track"><div className={`bar-fill ${fillClass}`.trim()} style={{width:`${macroProgressPercent(value, target)}%`}}></div></div>
      <span className="val tnum">{roundedValue}<span className="target"> / {roundedTarget}{unit}</span></span>
    </div>
  );
}

function foodProductKey(product) {
  return String(product || "").trim().toLowerCase();
}

function finiteFoodNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function foodUsageStats(foodByDate = {}) {
  const stats = new Map();
  Object.keys(foodByDate || {}).sort().forEach(date => {
    (foodByDate[date] || []).forEach(entry => {
      const product = String(entry.product || "").trim();
      const key = foodProductKey(product);
      if (!key) return;
      const current = stats.get(key) || {
        product,
        count: 0,
        lastDate: "",
        kcalPerUnit: 0,
        proteinPerUnit: 0,
        carbs: 0,
        fat: 0
      };
      const amount = finiteFoodNumber(entry.amount);
      const divisor = amount && amount > 0 ? amount : 1;
      current.count += 1;
      if (!current.lastDate || date >= current.lastDate) {
        current.lastDate = date;
        current.product = product;
        current.kcalPerUnit = (finiteFoodNumber(entry.kcal) ?? 0) / divisor;
        current.proteinPerUnit = (finiteFoodNumber(entry.protein) ?? 0) / divisor;
        current.carbs = (finiteFoodNumber(entry.carbs) ?? 0) / divisor;
        current.fat = (finiteFoodNumber(entry.fat) ?? 0) / divisor;
      }
      stats.set(key, current);
    });
  });
  return stats;
}

function allFoodCatalogItems(profile = {}, catalogItems = []) {
  const hidden = new Set((profile.hiddenFoodItems || []).map(foodProductKey));
  const usage = foodUsageStats(profile.foodByDate || {});
  const source = [...(profile.customFoodItems || []), ...(catalogItems || [])];
  const itemsByKey = new Map();

  source.forEach((item, index) => {
    const product = String(item.product || "").trim();
    const key = foodProductKey(product);
    if (!key || hidden.has(key) || itemsByKey.has(key)) return;
    const used = usage.get(key);
    itemsByKey.set(key, {
      ...item,
      product,
      kcalPerUnit: finiteFoodNumber(item.kcalPerUnit) ?? used?.kcalPerUnit ?? 0,
      proteinPerUnit: finiteFoodNumber(item.proteinPerUnit) ?? used?.proteinPerUnit ?? 0,
      carbs: finiteFoodNumber(item.carbs) ?? used?.carbs ?? 0,
      fat: finiteFoodNumber(item.fat) ?? used?.fat ?? 0,
      _quickCount: used?.count || 0,
      _quickLastDate: used?.lastDate || "",
      _quickIndex: index
    });
  });

  usage.forEach((used, key) => {
    if (itemsByKey.has(key) || hidden.has(key)) return;
    itemsByKey.set(key, {
      product: used.product,
      category: "Logged before",
      kcalPerUnit: used.kcalPerUnit || 0,
      proteinPerUnit: used.proteinPerUnit || 0,
      carbs: used.carbs || 0,
      fat: used.fat || 0,
      _quickCount: used.count || 0,
      _quickLastDate: used.lastDate || "",
      _quickIndex: source.length + itemsByKey.size
    });
  });

  return Array.from(itemsByKey.values())
    .sort((a, b) => {
      const countDiff = (b._quickCount || 0) - (a._quickCount || 0);
      if (countDiff) return countDiff;
      const lastDiff = String(b._quickLastDate || "").localeCompare(String(a._quickLastDate || ""));
      if (lastDiff) return lastDiff;
      return (a._quickIndex || 0) - (b._quickIndex || 0);
    });
}

function quickFoodSuggestions(profile = {}, catalogItems = [], limit = 10) {
  return allFoodCatalogItems(profile, catalogItems).slice(0, limit);
}

function TodayRailBand({
  selectedDate, setSelectedDate, todayIso, selectedDayKey, targets,
  todayKcal, todayProtein, todayCarbs, todayFat, trackCarbs, trackFat,
  entries, activeProfile, foodItems, addFoodEntry, removeFoodEntry,
  setShowWeightModal, onAddFoodForDate
}) {
  const loggedLabel = selectedDate === todayIso ? "Today" : RepsData.shortDate(selectedDate);
  const quickFoods = _um(
    () => quickFoodSuggestions(activeProfile, foodItems, 10),
    [activeProfile, foodItems]
  );

  return (
    <section className="body-band today-rail-band">
      <div className="body-band-head today-rail-head">
        <div>
          <h2>Daily Rail</h2>
          <div className="body-band-sub">{loggedLabel} · {targets.kcal} kcal · {targets.protein}g protein</div>
        </div>
        <span className="chip">{entries.length} {entries.length === 1 ? "item" : "items"}</span>
      </div>
      <div className="today-rail-top">
        <div className="today-date-cluster">
          <div>
            <div className="kpi-label">Daily cockpit</div>
            <div className="today-date-title">{loggedLabel} <span className="mono">{selectedDayKey}</span></div>
          </div>
          <div className="body-date-nav">
            <button className="btn ghost sm icon-only" title="Previous day" onClick={() => setSelectedDate(window.RepsData.addDays(selectedDate, -1))}><VI.ChevronLeft /></button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            <button className="btn ghost sm icon-only" title="Next day" onClick={() => setSelectedDate(window.RepsData.addDays(selectedDate, 1))}><VI.Chevron /></button>
            {selectedDate !== todayIso && <button className="btn ghost sm" onClick={() => setSelectedDate(todayIso)}>Today</button>}
          </div>
        </div>
        <div className="today-actions">
          <button className="btn sm" onClick={() => setShowWeightModal(true)}><VI.Plus /> Weight</button>
          <button className="btn primary sm" onClick={() => onAddFoodForDate(selectedDate)}><VI.Plus /> Add food</button>
        </div>
      </div>

      <div className="today-rail-grid">
        <div className="today-macro-stack">
          <MacroProgressRow label="kcal" value={todayKcal} target={targets.kcal} />
          <MacroProgressRow label="protein" value={todayProtein} target={targets.protein} unit=" g" fillClass="good" />
          {trackCarbs && <MacroProgressRow label="carbs" value={todayCarbs} target={targets.carbs || 0} unit=" g" fillClass="cool" />}
          {trackFat && <MacroProgressRow label="fat" value={todayFat} target={targets.fat || 0} unit=" g" fillClass="warn" />}
        </div>

        <div className="today-food-stack">
          <div className="today-block-head">
            <span className="kpi-label">Logged foods</span>
            <span className="mono">{entries.length} {entries.length === 1 ? "item" : "items"}</span>
          </div>
          {entries.length === 0 ? (
            <div className="body-empty-line">No food logged for this date.</div>
          ) : (
            <div className="body-food-list compact">
              {entries.map(f => (
                <div key={f.id} className="body-food-row">
                  <div className="body-food-name">
                    {f.amount !== 1 && <span className="mono muted">{f.amount}x </span>}
                    {f.product}
                  </div>
                  <span className="mono">{Math.round(f.kcal || 0)}k</span>
                  <span className="mono good-text">{Math.round((f.protein || 0) * 10) / 10}p</span>
                  <button className="btn ghost icon-only" onClick={() => removeFoodEntry(selectedDate, f.id)} title="Remove food"><VI.X /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="today-quick-stack">
          <div className="today-block-head">
            <span className="kpi-label">Quick add</span>
            <span className="mono">{quickFoods.length}</span>
          </div>
          <div className="body-quick-add-grid compact">
            {quickFoods.map((f, i) => (
              <button key={`${f.product}-${i}`} className="quick-food-pill"
                title={f._quickCount ? `Logged ${f._quickCount}× before` : "Catalog item"}
                onClick={() => addFoodEntry(selectedDate, {
                  product: f.product,
                  amount: 1,
                  kcal: Math.round(f.kcalPerUnit),
                  protein: f.proteinPerUnit,
                  carbs: f.carbs || 0,
                  fat: f.fat || 0
                })}>
                <span>{f.product}</span>
                <em>{Math.round(f.kcalPerUnit)}k · {f.proteinPerUnit}p</em>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function GoalTrajectoryBand({ profile, estimate, bodyD }) {
  const model = buildTrajectoryModel(profile, estimate, bodyD);
  const latest = model.latest;
  const targetWeight = Number(model.targetWeight);
  const gap = latest && Number.isFinite(targetWeight) ? targetWeight - latest.value : null;
  const gapText = gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)} kg`;
  const etaLabel = model.eta?.label || "Set a target";

  return (
    <section className="body-band trajectory-band">
      <div className="body-band-head">
        <div>
          <h2>Goal Trajectory</h2>
          <div className="body-band-sub">Weight trend interpreted through the same {estimate?.windowDays || 28}d adaptive model</div>
        </div>
        <span className={`chip ${confidenceChipClass(estimate?.confidence?.level || "insufficient")}`}>{estimate?.confidence?.label || "need data"}</span>
      </div>
      <div className="trajectory-layout">
        <div className="trajectory-chart-block">
          {model.ready ? (
            <>
              <svg className="trajectory-chart" viewBox={`0 0 ${model.width} ${model.height}`} preserveAspectRatio="none" role="img" aria-label="Weight trajectory chart">
                {model.targetY != null && <line className="trajectory-target-line" x1="0" x2={model.width} y1={model.targetY} y2={model.targetY} />}
                <path className="trajectory-path" d={model.path} />
                {model.projectionPath && <path className="trajectory-projection" d={model.projectionPath} />}
              </svg>
              <div className="trajectory-axis">
                <span>{RepsData.shortDate(model.startDate)}</span>
                <span>{RepsData.shortDate(model.endDate)}</span>
              </div>
            </>
          ) : (
            <div className="trajectory-empty">Need at least two weight entries for a trajectory.</div>
          )}
        </div>
        <div className="trajectory-metrics">
          <div className="trajectory-metric">
            <span>Latest weight</span>
            <strong className="tnum">{latest ? `${latest.value.toFixed(1)} kg` : "—"}</strong>
            <em className="mono">{latest ? RepsData.shortDate(latest.date) : "no weigh-in"}</em>
          </div>
          <div className="trajectory-metric">
            <span>Goal gap</span>
            <strong className="tnum">{gapText}</strong>
            <em className="mono">{Number.isFinite(targetWeight) ? `${targetWeight.toFixed(1)} kg target` : "no target"}</em>
          </div>
          <div className="trajectory-metric">
            <span>ETA</span>
            <strong>{etaLabel}</strong>
            <em className="mono">{signedKgRate(estimate?.weeklyRateKg)} observed</em>
          </div>
        </div>
      </div>
    </section>
  );
}

function Body() {
  const { activeProfile, addFoodEntry, removeFoodEntry, updateProfile, addCustomFoodItem,
          updateDailyOverride, clearDailyOverride } = window.RepsState.useApp();
  const todayIso = window.RepsData.TODAY;
  const [selectedDate, setSelectedDate] = useS(todayIso);
  const [showWeightModal, setShowWeightModal] = useS(false);
  const [tdeeWindowDays, setTdeeWindowDays] = useS(28);
  const [foodModalDate, setFoodModalDate] = useS(null);
  const selectedDayKey = window.RepsData.dayName(selectedDate);
  const targets = activeProfile.macros[selectedDayKey] || { kcal: 2000, protein: 160, carbs: 200, fat: 60 };

  const trackCarbs = activeProfile.trackCarbs !== false;
  const trackFat = activeProfile.trackFat !== false;

  const hasHistory = !!activeProfile.hasHistory;
  const localWeights = activeProfile.weightEntries || [];
  const dailyOverrides = activeProfile.dailyOverrides || {};
  const histBody = hasHistory ? RepsData.bodyData() : [];
  const bodyD = _um(() => {
    const map = new Map(histBody.map(b => [b.date, b]));
    for (const w of localWeights) map.set(w.date, { date: w.date, value: w.weight, label: window.RepsData.shortDate(w.date), note: w.note });
    // Manual weight overrides win over everything
    for (const [date, ov] of Object.entries(dailyOverrides)) {
      if (Object.prototype.hasOwnProperty.call(ov || {}, "weight")) {
        if (ov.weight == null) {
          map.delete(date);
        } else {
          map.set(date, { date, value: ov.weight, label: window.RepsData.shortDate(date), note: ov.note });
        }
      } else if (ov.note && map.has(date)) {
        map.set(date, { ...map.get(date), note: ov.note });
      }
    }
    return Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
  }, [histBody, localWeights, dailyOverrides]);

  const kcal = _um(() => RepsData.mergedNutritionData?.(activeProfile, "kcal", null, true) || RepsData.localNutritionData?.(activeProfile, "kcal", null, true) || [], [activeProfile]);
  const protein = _um(() => RepsData.mergedNutritionData?.(activeProfile, "protein", null, true) || RepsData.localNutritionData?.(activeProfile, "protein", null, true) || [], [activeProfile]);
  const foodItems = RepsData.foodItems;
  // Manual override for the currently selected date's macros — used by the day's macro panel
  const selectedOverride = dailyOverrides[selectedDate] || {};
  const [showAddFood, setShowAddFood] = useS(false);
  const ledgerFoodsOpen = activeProfile.bodyLedgerFoodsOpen !== false;

  const entries = (activeProfile.foodByDate || {})[selectedDate] || [];
  // Manual totals and explicit blanks win over the derived food totals.
  const foodKcal = entries.reduce((s, f) => s + (f.kcal || 0), 0);
  const foodProtein = entries.reduce((s, f) => s + (f.protein || 0), 0);
  const selectedHas = (field) => Object.prototype.hasOwnProperty.call(selectedOverride, field);
  const todayKcal = selectedHas("kcal") ? (selectedOverride.kcal ?? 0) : foodKcal;
  const todayProtein = selectedHas("protein") ? (selectedOverride.protein ?? 0) : foodProtein;
  const todayCarbs = entries.reduce((s, f) => s + ((f.carbs || 0)), 0);
  const todayFat = entries.reduce((s, f) => s + ((f.fat || 0)), 0);

  const adaptiveTdee = _um(
    () => RepsData.adaptiveTdeeEstimate ? RepsData.adaptiveTdeeEstimate(activeProfile, { windowDays: tdeeWindowDays }) : null,
    [activeProfile, tdeeWindowDays]
  );

  const applyAdaptiveTdee = () => {
    if (!adaptiveTdee?.ready) return;
    const patch = RepsData.macroTargetsForAdaptiveTdee?.(
      activeProfile,
      adaptiveTdee,
      window.RepsState?.DAY_KEYS || ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    );
    if (patch) updateProfile(activeProfile.id, {
      maintenanceKcal: patch.maintenanceKcal,
      macros: patch.macros
    });
  };
  const openAddFoodForDate = (date) => {
    const targetDate = date || selectedDate || todayIso;
    setSelectedDate(targetDate);
    setFoodModalDate(targetDate);
    setShowAddFood(true);
  };
  const closeAddFood = () => {
    setShowAddFood(false);
    setFoodModalDate(null);
  };

  return (
    <div className="view body-view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Body</h1>
          <div className="page-sub">
            Adaptive energy targets · daily nutrition cockpit · bodyweight trajectory
          </div>
        </div>
      </div>

      <div className="body-mobile-date-actions">
        <div className="body-date-nav">
          <button className="btn ghost sm icon-only" title="Previous day" onClick={() => setSelectedDate(window.RepsData.addDays(selectedDate, -1))}><VI.ChevronLeft /></button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          <button className="btn ghost sm icon-only" title="Next day" onClick={() => setSelectedDate(window.RepsData.addDays(selectedDate, 1))}><VI.Chevron /></button>
          {selectedDate !== todayIso && <button className="btn ghost sm" onClick={() => setSelectedDate(todayIso)}>Today</button>}
        </div>
        <button className="btn sm" onClick={() => setShowWeightModal(true)}><VI.Plus /> Weight</button>
        <button className="btn primary sm" onClick={() => openAddFoodForDate(selectedDate)}><VI.Plus /> Add food</button>
      </div>

      <div className="body-workspace">
        <EnergyCommandBand
          profile={activeProfile}
          estimate={adaptiveTdee}
          windowDays={tdeeWindowDays}
          setWindowDays={setTdeeWindowDays}
          updateProfile={updateProfile}
          onApply={applyAdaptiveTdee} />

        <TodayRailBand
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          todayIso={todayIso}
          selectedDayKey={selectedDayKey}
          targets={targets}
          todayKcal={todayKcal}
          todayProtein={todayProtein}
          todayCarbs={todayCarbs}
          todayFat={todayFat}
          trackCarbs={trackCarbs}
          trackFat={trackFat}
          entries={entries}
          activeProfile={activeProfile}
          foodItems={foodItems}
          addFoodEntry={addFoodEntry}
          removeFoodEntry={removeFoodEntry}
          setShowWeightModal={setShowWeightModal}
          onAddFoodForDate={openAddFoodForDate} />

        <GoalTrajectoryBand
          profile={activeProfile}
          estimate={adaptiveTdee}
          bodyD={bodyD} />

        {/* Daily ledger - date clicks select the food detail day; metric cells remain editable */}
        <DailyLogTable
          bodyD={bodyD}
          kcal={kcal}
          protein={protein}
          activeProfile={activeProfile}
          updateProfile={updateProfile}
          updateDailyOverride={updateDailyOverride}
          clearDailyOverride={clearDailyOverride}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onAddFoodForDate={openAddFoodForDate}
          onRemoveFoodForDate={removeFoodEntry}
          foodsOpen={ledgerFoodsOpen}
          onFoodsOpenChange={(open) => updateProfile(activeProfile.id, { bodyLedgerFoodsOpen: !!open })} />
      </div>


      {showAddFood && <AddFoodModal
        activeProfile={activeProfile} updateProfile={updateProfile}
        targetDate={foodModalDate || selectedDate}
        onClose={closeAddFood}
        onAdd={(entry) => addFoodEntry(foodModalDate || selectedDate, entry)}
        onSaveToCatalog={(item) => addCustomFoodItem && addCustomFoodItem(item)} />}
      {showWeightModal && <WeightEntryModal
        onClose={() => setShowWeightModal(false)}
        lookupExisting={(d) => {
          // Mirror bodyD precedence: dailyOverrides > weightEntries > historical.
          const ov = (activeProfile.dailyOverrides || {})[d];
          if (ov && Object.prototype.hasOwnProperty.call(ov, "weight")) {
            return ov.weight == null ? null : { value: ov.weight, note: ov.note || "" };
          }
          const localEntry = (activeProfile.weightEntries || []).find(x => x.date === d);
          if (localEntry) return { value: localEntry.weight, note: localEntry.note || "" };
          const hist = hasHistory ? histBody.find(b => b.date === d) : null;
          if (hist) return { value: hist.value, note: "" };
          return null;
        }}
        onSave={(w) => {
          const list = (activeProfile.weightEntries || []).filter(x => x.date !== w.date);
          list.push(w);
          list.sort((a,b) => a.date.localeCompare(b.date));
          updateProfile(activeProfile.id, { weightEntries: list });
        }} />}
    </div>
  );
}

/* =========================================================
   PLAN — Training blocks + Profile + Macros
   ========================================================= */
function MacroCell({ value, onChange, suffix }) {
  return (
    <div className="set-cell" style={{height:30, padding:"0 6px"}}>
      <input value={value || ""} onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        inputMode="numeric" style={{fontVariantNumeric:"tabular-nums", textAlign:"right"}} />
      {suffix && <span style={{marginLeft:4, color:"var(--faint)", fontSize:10, fontFamily:"var(--font-mono)"}}>{suffix}</span>}
    </div>
  );
}

function AddBlockModal({ initialBlock, onClose, onSave, onDelete }) {
  const isEdit = !!initialBlock;
  const [name, setName] = useS(initialBlock?.name || "Block " + new Date().getFullYear());
  const [startDate, setStartDate] = useS(initialBlock?.startDate || window.RepsData.TODAY);
  const [weeks, setWeeks] = useS(initialBlock?.weeks || 8);
  const [goal, setGoal] = useS(initialBlock?.goal || "");

  const submit = () => {
    if (!name.trim()) return;
    const parsedWeeks = Math.max(1, Math.min(52, Number(weeks) || 8));
    onSave({ name: name.trim(), startDate, weeks: parsedWeeks, goal: goal.trim() });
    onClose();
  };

  return (
    <div onClick={onClose}
      style={{position:"fixed", inset:0, zIndex:50, background:"rgba(10,10,10,0.4)", display:"grid", placeItems:"center", padding:20}}>
      <div onClick={e => e.stopPropagation()}
        style={{width:"min(480px,100%)", background:"var(--surface)", border:"var(--hair)", borderRadius:"var(--r-lg)", boxShadow:"var(--shadow-2)", overflow:"hidden"}}>
        <div className="panel-head">
          <div>
            <h3>{isEdit ? "Edit training block" : "New training block"}</h3>
            {isEdit && <div className="kpi-label" style={{marginTop:2}}>Adjust name, dates, duration, or notes</div>}
          </div>
          <button className="btn ghost sm icon-only" onClick={onClose}><VI.X /></button>
        </div>
        <div style={{padding:14, display:"flex", flexDirection:"column", gap:12}}>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Block name</div>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <div>
              <div className="kpi-label" style={{marginBottom:4}}>Start date</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)"}} />
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:4}}>Duration (weeks)</div>
              <input type="number" min="1" max="52" value={weeks} onChange={e => setWeeks(e.target.value)}
                style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)", textAlign:"right"}} />
            </div>
          </div>
          <div>
            <div className="kpi-label" style={{marginBottom:4}}>Goal / notes</div>
            <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Cut to 80kg, prepare for holiday"
              style={{width:"100%", height:34, padding:"0 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
          </div>
          <div style={{display:"flex", justifyContent:"space-between", gap:8, marginTop:4}}>
            <div>
              {onDelete && (
                <button className="btn ghost sm" style={{color:"var(--bad)"}}
                  onClick={() => { if (confirm(`Delete block "${initialBlock.name}"?`)) { onDelete(); onClose(); } }}>
                  Delete
                </button>
              )}
            </div>
            <div style={{display:"flex", justifyContent:"flex-end", gap:8}}>
            <button className="btn ghost sm" onClick={onClose}>Cancel</button>
            <button className="btn primary sm" onClick={submit} disabled={!name.trim()}>
              {isEdit ? "Save changes" : <><VI.Plus /> Add block</>}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Plan() {
  const { activeProfile, updateProfile, updateMacros, setMacroPreset, addProfile, setActiveProfile, deleteProfile,
          addCustomBlock, updateCustomBlock, deleteCustomBlock, state, PRESETS, DAY_KEYS } = window.RepsState.useApp();
  const blocks = activeProfile.hasHistory ? RepsData.blockSummary(activeProfile) : [];
  const overrides = activeProfile.blockNames || {};
  const startOverrides = activeProfile.blockStartOverrides || {};
  const goalOverrides = activeProfile.blockGoals || {};
  const customBlocks = activeProfile.customBlocks || [];
  const allSessions = _um(() => RepsData.allSessions(), [activeProfile]);
  const [blockModal, setBlockModal] = useState(null);
  const [newProfileName, setNewProfileName] = useState("");

  const trackCarbs = activeProfile.trackCarbs !== false;
  const trackFat = activeProfile.trackFat !== false;
  const todayKey = window.RepsState.todayDayKey();

  const defaultBlockName = (sheet) => sheet.replace(/[()]/g, "").replace(/^Block /, "B");

  const sessionsForBlock = (start, end) =>
    allSessions.filter(s => s.date >= start && s.date <= end && s.status !== "skipped");

  const sessionTimeline = (sessions, start, end) => {
    const totalDays = Math.max(1, RepsData.daysBetween(start, end));
    return sessions.map(s => {
      const day = Math.max(0, Math.min(totalDays, RepsData.daysBetween(start, s.date) || 0));
      const pct = (day / totalDays) * 100;
      return { ...s, pct: Math.max(1.5, Math.min(98.5, pct)) };
    });
  };

  const timelinePosition = (start, end) => {
    const days = Math.max(1, RepsData.daysBetween(start, end) + 1);
    return { left: 0, width: Math.max(1, Math.min(100, (days / 42) * 100)) };
  };

  const renderBlockTimeline = (start, end, progress, sessions) => {
    const pos = timelinePosition(start, end);
    const dots = sessionTimeline(sessions, start, end);
    return (
      <div className="plan-timeline">
        <div className="plan-timeline-track">
          <div className="plan-block-span" style={{left:`${pos.left}%`, width:`${pos.width}%`}}>
            <div className="plan-block-fill" style={{width:`${progress}%`}}></div>
            {dots.map((s, idx) => (
              <span key={`${s.id || s.date}-${idx}`} className="plan-session-dot"
                style={{left:`${s.pct}%`}}
                title={`${RepsData.shortDate(s.date)} · ${s.split || s.nominalDay || "Session"} · ${s.performedSetCount || 0} sets`} />
            ))}
          </div>
        </div>
        <div className="plan-timeline-meta" style={{left:`${pos.left}%`, width:`${pos.width}%`}}>
          <span>{RepsData.shortDate(start)}</span>
          <span>{RepsData.shortDate(end)}</span>
        </div>
      </div>
    );
  };

  const openWorkbookBlock = (b) => {
    const originalStart = b.weeks[0].weekStart;
    const originalWeeks = b.weeks.length;
    setBlockModal({
      type: "workbook",
      id: b.sheet,
      sheet: b.sheet,
      name: overrides[b.sheet] || defaultBlockName(b.sheet),
      defaultName: defaultBlockName(b.sheet),
      startDate: startOverrides[b.sheet] || originalStart,
      originalStart,
      weeks: (activeProfile.blockWeeksOverride || {})[b.sheet] || originalWeeks,
      originalWeeks,
      goal: goalOverrides[b.sheet] || ""
    });
  };

  const removeWorkbookBlock = (sheet) => {
    const hiddenBlockSheets = [...new Set([...(activeProfile.hiddenBlockSheets || []), sheet])];
    const nextNames = { ...(activeProfile.blockNames || {}) };
    const nextStarts = { ...(activeProfile.blockStartOverrides || {}) };
    const nextWeeks = { ...(activeProfile.blockWeeksOverride || {}) };
    const nextGoals = { ...(activeProfile.blockGoals || {}) };
    delete nextNames[sheet];
    delete nextStarts[sheet];
    delete nextWeeks[sheet];
    delete nextGoals[sheet];
    updateProfile(activeProfile.id, {
      hiddenBlockSheets,
      blockNames: nextNames,
      blockStartOverrides: nextStarts,
      blockWeeksOverride: nextWeeks,
      blockGoals: nextGoals
    });
  };

  const saveTrainingBlock = (block) => {
    if (!blockModal || blockModal.type === "new") {
      addCustomBlock(block);
      return;
    }

    if (blockModal.type === "custom") {
      updateCustomBlock(blockModal.id, block);
      return;
    }

    const sheet = blockModal.sheet;
    const nextNames = { ...(activeProfile.blockNames || {}) };
    if (block.name && block.name !== blockModal.defaultName) nextNames[sheet] = block.name;
    else delete nextNames[sheet];

    const nextStarts = { ...(activeProfile.blockStartOverrides || {}) };
    if (block.startDate && block.startDate !== blockModal.originalStart) nextStarts[sheet] = block.startDate;
    else delete nextStarts[sheet];

    const nextWeeks = { ...(activeProfile.blockWeeksOverride || {}) };
    if (block.weeks && block.weeks !== blockModal.originalWeeks) nextWeeks[sheet] = block.weeks;
    else delete nextWeeks[sheet];

    const nextGoals = { ...(activeProfile.blockGoals || {}) };
    if (block.goal) nextGoals[sheet] = block.goal;
    else delete nextGoals[sheet];

    updateProfile(activeProfile.id, {
      blockNames: nextNames,
      blockStartOverrides: nextStarts,
      blockWeeksOverride: nextWeeks,
      blockGoals: nextGoals
    });
  };

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Plan</h1>
          <div className="page-sub">{activeProfile.name}'s profile · macros · training blocks</div>
        </div>
        {state.profiles.length > 1 && (
          <div className="page-actions">
            <span className="label">Active profile</span>
            <select value={activeProfile.id} onChange={e => setActiveProfile(e.target.value)} className="btn sm" style={{padding:"0 8px"}}>
              {state.profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ---- ACTIVE PROFILE DETAILS ---- */}
      <div className="panel">
        <div className="panel-head">
          <h3>{activeProfile.name}'s profile</h3>
          <span className="label">active</span>
        </div>
        <div className="panel-body" style={{display:"flex", flexDirection:"column", gap:18}}>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:18}}>
            <div>
              <div className="kpi-label" style={{marginBottom:6}}>Display name</div>
              <input value={activeProfile.name} onChange={e => updateProfile(activeProfile.id, { name: e.target.value })}
                style={{width:"100%", padding:"6px 10px", height:32, border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-md)"}} />
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:6}}>Birthday</div>
              <input type="date" value={activeProfile.birthday || ""} onChange={e => updateProfile(activeProfile.id, { birthday: e.target.value })}
                style={{width:"100%", padding:"6px 10px", height:32, border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)"}} />
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:6}}>Age</div>
              <div style={{padding:"6px 10px", height:32, display:"flex", alignItems:"center", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--surface-2)", fontFamily:"var(--font-mono)", color:"var(--muted)"}}>
                {window.RepsState.ageFrom(activeProfile.birthday) != null ? `${window.RepsState.ageFrom(activeProfile.birthday)} yrs` : "—"}
              </div>
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:6}}>Default unit</div>
              <div style={{display:"flex", gap:4}}>
                {["kg","lbs"].map(u => (
                  <button key={u} className={`ex-tag ${activeProfile.unit === u ? "is-on" : ""}`}
                    style={{height:32, padding:"0 12px", fontSize:"var(--t-sm)"}}
                    onClick={() => updateProfile(activeProfile.id, { unit: u })}>{u}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Macro visibility toggles */}
          <div style={{paddingTop:14, borderTop:"var(--hair)", display:"flex", alignItems:"center", gap:16}}>
            <div className="kpi-label">Track in macros:</div>
            <label style={{display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:"var(--t-sm)"}}>
              <input type="checkbox" checked={trackCarbs} onChange={e => updateProfile(activeProfile.id, { trackCarbs: e.target.checked })} />
              Carbs
            </label>
            <label style={{display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:"var(--t-sm)"}}>
              <input type="checkbox" checked={trackFat} onChange={e => updateProfile(activeProfile.id, { trackFat: e.target.checked })} />
              Fat
            </label>
          </div>
        </div>
      </div>

      {/* ---- MACROS PER DAY ---- */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Macros to beat — per day</h3>
            <div className="kpi-label" style={{marginTop:2}}>
              Today is <span className="mono" style={{color:"var(--accent-ink)"}}>{todayKey}</span>.
              <span style={{margin:"0 6px", color:"var(--faint)"}}>·</span>
              Edit kcal here or apply adaptive targets from Body.
            </div>
          </div>
        </div>
        <div className="panel-body tight">
          <table className="tab">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">kcal</th>
                <th className="num">protein</th>
                {trackCarbs && <th className="num">carbs</th>}
                {trackFat && <th className="num">fat</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {DAY_KEYS.map(day => {
                const m = activeProfile.macros[day];
                const isToday = day === todayKey;
                return (
                  <tr key={day} style={isToday ? { background: "var(--accent-soft)" } : {}}>
                    <td>
                      <strong style={{fontWeight:500}}>{day}</strong>
                      {isToday && <span className="chip accent" style={{marginLeft:8}}>today</span>}
                    </td>
                    <td className="num" style={{padding:"4px 6px"}}>
                      <MacroCell value={m.kcal} onChange={v => updateMacros(activeProfile.id, day, { kcal: v })} suffix="kcal" />
                    </td>
                    <td className="num" style={{padding:"4px 6px"}}>
                      <MacroCell value={m.protein} onChange={v => updateMacros(activeProfile.id, day, { protein: v })} suffix="g" />
                    </td>
                    {trackCarbs && (
                      <td className="num" style={{padding:"4px 6px"}}>
                        <MacroCell value={m.carbs} onChange={v => updateMacros(activeProfile.id, day, { carbs: v })} suffix="g" />
                      </td>
                    )}
                    {trackFat && (
                      <td className="num" style={{padding:"4px 6px"}}>
                        <MacroCell value={m.fat} onChange={v => updateMacros(activeProfile.id, day, { fat: v })} suffix="g" />
                      </td>
                    )}
                    <td className="shrink mono muted">
                      {m.protein * 4 + m.carbs * 4 + m.fat * 9 !== m.kcal && (
                        <span style={{fontSize:10}}>Σ {m.protein * 4 + m.carbs * 4 + m.fat * 9} kcal</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="muted" style={{fontWeight:500}}>Avg / day</td>
                <td className="num mono">{Math.round(DAY_KEYS.reduce((s,d) => s + activeProfile.macros[d].kcal, 0) / 7)}</td>
                <td className="num mono">{Math.round(DAY_KEYS.reduce((s,d) => s + activeProfile.macros[d].protein, 0) / 7)}</td>
                {trackCarbs && <td className="num mono">{Math.round(DAY_KEYS.reduce((s,d) => s + activeProfile.macros[d].carbs, 0) / 7)}</td>}
                {trackFat && <td className="num mono">{Math.round(DAY_KEYS.reduce((s,d) => s + activeProfile.macros[d].fat, 0) / 7)}</td>}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- TRAINING BLOCKS ---- */}
      <div className="panel">
        <div className="panel-head">
          <h3>Training blocks</h3>
          <div style={{display:"flex", gap:6}}>
            <span className="label">2026 · click a block to edit dates and duration</span>
            <button className="btn primary sm" onClick={() => setBlockModal({ type: "new" })}><VI.Plus /> New block</button>
          </div>
        </div>
        <div className="panel-body tight">
          {/* Historical blocks from workbook */}
          {blocks.map((b, i) => {
            const originalStart = b.weeks[0].weekStart;
            const start = startOverrides[b.sheet] || originalStart;
            const weeksOverride = (activeProfile.blockWeeksOverride || {})[b.sheet];
            const effectiveWeeks = weeksOverride || b.weeks.length;
            const end = RepsData.addDays(start, effectiveWeeks * 7 - 1);
            const progress = Math.min(100, Math.max(0, (RepsData.daysBetween(start) / Math.max(1, RepsData.daysBetween(start, end))) * 100));
            const displayName = overrides[b.sheet] || defaultBlockName(b.sheet);
            const isInProgress = progress < 100;
            const blockSessions = sessionsForBlock(start, end);
            return (
              <div className="plan-row is-clickable" key={i} onClick={() => openWorkbookBlock(b)}>
                <div className="plan-block">
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <div className="ph" style={{flex:1, minWidth:0}}>{displayName}</div>
                  </div>
                  <div style={{display:"flex", alignItems:"center", gap: 4, marginTop: 2}}>
                    <div className="mono" style={{color:isInProgress ? "var(--accent-ink)" : "var(--faint)", fontSize: 10}}>
                      {effectiveWeeks} wk · {blockSessions.length} sessions completed
                    </div>
                    <button className="btn ghost sm icon-only" style={{width:18, height:18}}
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Remove block "${displayName}" from ${activeProfile.name}'s profile?`)) removeWorkbookBlock(b.sheet); }}
                      title="Remove block from this profile"><VI.X /></button>
                  </div>
                </div>
                <div>
                  {renderBlockTimeline(start, end, progress, blockSessions)}
                </div>
                <div className="plan-dates">
                  {progress < 100 ? <span className="chip accent">in progress</span> : <span className="chip good">done</span>}
                </div>
              </div>
            );
          })}

          {blocks.length === 0 && customBlocks.length === 0 && (
            <div className="empty" style={{margin: "var(--pad-3)"}}>
              No training blocks for this profile yet. Add a block to track phase progress.
            </div>
          )}

          {/* Custom blocks */}
          {customBlocks.map((b) => {
            const endDate = RepsData.addDays(b.startDate, (b.weeks||8) * 7 - 1);
            const progress = Math.min(100, Math.max(0, (RepsData.daysBetween(b.startDate) / Math.max(1, RepsData.daysBetween(b.startDate, endDate))) * 100));
            const blockSessions = sessionsForBlock(b.startDate, endDate);
            return (
              <div className="plan-row is-clickable" key={b.id} onClick={() => setBlockModal({ type: "custom", ...b })}>
                <div className="plan-block">
                  <div className="ph">{b.name}</div>
                  <div style={{display:"flex", gap:4, alignItems:"center"}}>
                    <div className="mono" style={{color:"var(--faint)"}}>{b.weeks||8} wk · {blockSessions.length} sessions completed</div>
                    <button className="btn ghost sm icon-only" style={{width:18, height:18}}
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete block "${b.name}"?`)) deleteCustomBlock(b.id); }}><VI.X /></button>
                  </div>
                </div>
                <div>
                  {renderBlockTimeline(b.startDate, endDate, progress, blockSessions)}
                </div>
                <div className="plan-dates">
                  <span className="chip" style={{background:"var(--surface-2)"}}>custom</span>
                  {progress < 100 ? <span className="chip accent" style={{marginLeft:4}}>in progress</span> : <span className="chip good" style={{marginLeft:4}}>done</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {blockModal && (
        <AddBlockModal
          key={`${blockModal.type}-${blockModal.id || "new"}`}
          initialBlock={blockModal.type === "new" ? null : blockModal}
          onClose={() => setBlockModal(null)}
          onSave={saveTrainingBlock}
          onDelete={blockModal.type === "custom"
            ? () => deleteCustomBlock(blockModal.id)
            : blockModal.type === "workbook"
              ? () => removeWorkbookBlock(blockModal.sheet)
              : null} />
      )}
    </div>
  );
}

/* =========================================================
   EXPORT — AI-ready bundle with togglable sections
   ========================================================= */
const EXPORT_DEFAULTS = {
  includeProfile: false,
  includeMacros: false,
  includeRoutine: true,
  includeSessions: true,
  includeFoodLog: false,
  includeWeights: false,
  includeBlocks: true,
  prettyPrint: true,
  introPrompt: "You are my training coach. Review the data below and give me feedback on programming, progressive overload, fatigue management, and anything I should adjust. Be specific and actionable."
};

function loadExportPrefs() {
  try {
    const raw = localStorage.getItem("reps-export-prefs-v1");
    if (raw) return { ...EXPORT_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...EXPORT_DEFAULTS };
}

function saveExportPrefs(prefs) {
  try { localStorage.setItem("reps-export-prefs-v1", JSON.stringify(prefs)); } catch (e) {}
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <label style={{display:"flex", alignItems:"flex-start", gap:10, padding:"8px 10px", borderRadius:"var(--r-sm)", cursor:"pointer", border:"1px solid transparent", background: checked ? "var(--accent-soft)" : "var(--surface-2)"}}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{marginTop:3}} />
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontWeight:500, fontSize:"var(--t-sm)", color: checked ? "var(--accent-ink)" : "var(--ink)"}}>{label}</div>
        {sub && <div className="kpi-label" style={{marginTop:2, color: checked ? "var(--accent-ink)" : "var(--muted)"}}>{sub}</div>}
      </div>
    </label>
  );
}

function ExportView() {
  const app = window.RepsState.useApp();
  const hasHistory = !!app.activeProfile.hasHistory;
  const [range, setRange] = useState("90");
  const [copied, setCopied] = useState(false);
  const [prefs, setPrefs] = useState(loadExportPrefs);

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveExportPrefs(next);
  };

  const payload = _um(() => {
    const all = RepsData.recentSessions(500);
    const cutoffDays = range === "all" ? Infinity : Number(range);
    const recent = all.filter(s => RepsData.daysBetween(s.date) <= cutoffDays);
    const out = {
      range: range === "all" ? "all_time" : `last_${range}d`,
      generated_at: new Date().toISOString()
    };

    if (prefs.includeProfile) {
      out.profile = {
        name: app.activeProfile.name,
        birthday: app.activeProfile.birthday,
        age_years: window.RepsState.ageFrom(app.activeProfile.birthday),
        unit: app.activeProfile.unit,
        phase: app.activeProfile.phase,
        target_weight_kg: app.activeProfile.targetWeight,
        maintenance_kcal: app.activeProfile.maintenanceKcal
      };
    }
    if (prefs.includeMacros) {
      out.macros_per_day = app.activeProfile.macros;
    }
    if (prefs.includeRoutine) {
      const routines = app.activeProfile.routines || [];
      const active = routines.find(r => r.id === app.activeProfile.activeRoutineId) || routines[0];
      out.current_routine = active
        ? { name: active.name, days: active.days }
        : (window.PLANNED_ROUTINE || []).length > 0
          ? { name: "Default (PPL + Boxing)", days: window.PLANNED_ROUTINE }
          : null;
    }
    if (prefs.includeBlocks) {
      out.training_blocks = [
        ...RepsData.blockSummary(app.activeProfile).map(b => ({
          source: "workbook",
          sheet: b.sheet,
          weeks: b.weeks.length,
          start: b.weeks[0]?.weekStart,
          end: b.weeks[b.weeks.length - 1]?.weekStart,
          logged_entries: b.loggedEntries
        })),
        ...(app.activeProfile.customBlocks || []).map(b => ({
          source: "custom",
          name: b.name,
          weeks: b.weeks || 8,
          start: b.startDate,
          end: RepsData.addDays(b.startDate, (b.weeks || 8) * 7 - 1),
          goal: b.goal || ""
        }))
      ];
    }
    if (prefs.includeSessions) {
      out.recent_sessions = recent.map(s => ({
        date: s.date, planned_date: s.plannedDate, routine_day: s.routineDay || s.nominalDay,
        split: s.split, week: s.weekNumber, status: s.status,
        rpe: s.dailyMetrics?.rpe,
        day_note: s.dayNote,
        exercises: (s.entries || []).map(e => ({
          name: e.exercise, group: e.movementGroup,
          target_sets: e.targetSets, target_reps: e.targetReps,
          sets: (e.sets || []).map(x => ({
            weight: x.weight, unit: x.unit, bw_base: x.bwBase,
            reps: x.repsNumber || x.reps,
            duration_min: x.durationMinutes || x.duration,
            rpe: x.rpe, note: x.note
          }))
        }))
      }));
    }
    if (prefs.includeFoodLog) {
      const food = app.activeProfile.foodByDate || {};
      const cutoff = range === "all" ? "0000-01-01" : RepsData.addDays(RepsData.TODAY, -Number(range));
      out.food_log = Object.fromEntries(
        Object.entries(food).filter(([d]) => d >= cutoff)
      );
    }
    if (prefs.includeWeights) {
      const cutoff = range === "all" ? "0000-01-01" : RepsData.addDays(RepsData.TODAY, -Number(range));
      const hist = hasHistory ? RepsData.bodyData() : [];
      const local = app.activeProfile.weightEntries || [];
      const map = new Map(hist.map(b => [b.date, { date: b.date, weight: b.value }]));
      for (const w of local) map.set(w.date, { date: w.date, weight: w.weight, note: w.note });
      for (const [date, ov] of Object.entries(app.activeProfile.dailyOverrides || {})) {
        if (!Object.prototype.hasOwnProperty.call(ov || {}, "weight")) continue;
        if (ov.weight == null) map.delete(date);
        else map.set(date, { date, weight: ov.weight, note: ov.note || "" });
      }
      out.weight_history = Array.from(map.values())
        .filter(x => x.date >= cutoff)
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    return out;
  }, [range, hasHistory, app.activeProfile, prefs]);

  const json = _um(
    () => prefs.prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
    [payload, prefs.prettyPrint]
  );

  // Final text = intro prompt + json
  const finalText = _um(() => {
    const intro = (prefs.introPrompt || "").trim();
    if (!intro) return json;
    return `${intro}\n\n--- DATA ---\n\n${json}`;
  }, [json, prefs.introPrompt]);

  const highlighted = json
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/("[^"]+"):/g, '<span class="k">$1</span>:')
    .replace(/: ("[^"]*")/g, ': <span class="s">$1</span>')
    .replace(/: (\d+(\.\d+)?)/g, ': <span class="n">$1</span>');

  const handleDownload = () => {
    const blob = new Blob([finalText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reps-ai-export-${range}-${RepsData.TODAY}.${(prefs.introPrompt || "").trim() ? "txt" : "json"}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = finalText;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
      document.body.removeChild(ta);
    }
  };

  const handleReset = () => {
    const next = { ...EXPORT_DEFAULTS };
    setPrefs(next);
    saveExportPrefs(next);
  };

  const sessionCount = (payload.recent_sessions || []).length;

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Export</h1>
          <div className="page-sub">Build a clean prompt + data bundle for coaching chats. Toggle exactly what to share.</div>
        </div>
        <div className="page-actions">
          <select value={range} onChange={e => setRange(e.target.value)} className="btn sm" style={{padding:"0 8px"}}>
            <option value="7">last 7 days</option>
            <option value="14">last 14 days</option>
            <option value="30">last 30 days</option>
            <option value="90">last 90 days</option>
            <option value="180">last 180 days</option>
            <option value="all">all time</option>
          </select>
          <button className="btn ghost sm" onClick={handleReset}>Reset toggles</button>
          <button className="btn sm" onClick={handleDownload}><VI.Download /> Download</button>
          <button className="btn primary sm" onClick={handleCopy}>
            {copied ? <><VI.Check /> Copied</> : <>Copy to clipboard</>}
          </button>
        </div>
      </div>

      <div className="grid-2 uneven">
        <div className="panel">
          <div className="panel-head">
            <h3>Payload preview</h3>
            <span className="label mono">{finalText.length.toLocaleString()} chars · {sessionCount} sessions</span>
          </div>
          <div className="panel-body tight">
            {(prefs.introPrompt || "").trim() && (
              <div style={{padding:"10px 14px", borderBottom:"var(--hair)", background:"var(--accent-soft)", color:"var(--accent-ink)", fontSize: 12, lineHeight: 1.5, whiteSpace:"pre-wrap", fontFamily:"var(--font-sans)"}}>
                <div className="mono" style={{fontSize: 9, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom: 4, opacity: 0.7}}>intro prompt</div>
                {prefs.introPrompt}
              </div>
            )}
            <pre className="export-pre" dangerouslySetInnerHTML={{__html: highlighted}}></pre>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>What to include</h3>
            <span className="label">saved locally</span>
          </div>
          <div className="panel-body" style={{display:"flex", flexDirection:"column", gap: 14}}>
            <div>
              <div className="kpi-label" style={{marginBottom: 6}}>Intro prompt — prepended to the output</div>
              <textarea
                value={prefs.introPrompt}
                onChange={e => updatePref("introPrompt", e.target.value)}
                placeholder="e.g. You are my training coach. Review the data and give me feedback on…"
                rows={5}
                style={{width:"100%", padding:"8px 10px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)", fontFamily:"var(--font-sans)", resize:"vertical", lineHeight: 1.4}} />
              <div className="kpi-label" style={{marginTop: 4}}>Leave blank for raw JSON only.</div>
            </div>

            <div>
              <div className="kpi-label" style={{marginBottom: 6}}>Data sections</div>
              <div style={{display:"flex", flexDirection:"column", gap: 6}}>
                <ToggleRow
                  label="Current routine"
                  sub="Adds your active weekly plan at the top of the data"
                  checked={prefs.includeRoutine}
                  onChange={v => updatePref("includeRoutine", v)} />
                <ToggleRow
                  label="Recent training sessions"
                  sub={`Workouts within the selected ${range === "all" ? "history" : range + " days"}`}
                  checked={prefs.includeSessions}
                  onChange={v => updatePref("includeSessions", v)} />
                <ToggleRow
                  label="Training blocks summary"
                  sub="Block names, dates, week counts"
                  checked={prefs.includeBlocks}
                  onChange={v => updatePref("includeBlocks", v)} />
                <ToggleRow
                  label="Personal data — profile"
                  sub="Name, birthday, age, phase, target weight, maintenance kcal"
                  checked={prefs.includeProfile}
                  onChange={v => updatePref("includeProfile", v)} />
                <ToggleRow
                  label="Personal data — macros per day"
                  sub="kcal / protein / carbs / fat targets by weekday"
                  checked={prefs.includeMacros}
                  onChange={v => updatePref("includeMacros", v)} />
                <ToggleRow
                  label="Food log"
                  sub="Daily food entries within the selected range"
                  checked={prefs.includeFoodLog}
                  onChange={v => updatePref("includeFoodLog", v)} />
                <ToggleRow
                  label="Weight history"
                  sub="All weigh-ins within the selected range"
                  checked={prefs.includeWeights}
                  onChange={v => updatePref("includeWeights", v)} />
              </div>
            </div>

            <div>
              <div className="kpi-label" style={{marginBottom: 6}}>Format</div>
              <ToggleRow
                label="Pretty-print JSON"
                sub="Readable; uncheck for compact (fewer tokens)"
                checked={prefs.prettyPrint}
                onChange={v => updatePref("prettyPrint", v)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.RepsViews = { Routines, Exercises, Body, Plan, ExportView };
