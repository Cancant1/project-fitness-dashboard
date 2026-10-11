/* global React, RepsIcons */

const RETURN_BLOCK_KEY = "mario-return-2026-08-26";
const RETURN_ROUTINE_ID = "routine-return-8w-2026";
const RETURN_ROUTINE_NAME = "8-Week Return · Wed + Sat";

const RETURN_WORKOUTS = {
  A: {
    day: "Wed",
    title: "Return A",
    focus: "Squat · horizontal push/pull · hinge · shoulders · arms",
    exercises: [
      { name: "Squat", label: "Back squat", sets: 2, reps: "6-8", unit: "kg", startWeight: 85, step: 5, rule: "compound", note: "Start 80–90 kg · old work: 125–132.5 kg" },
      { name: "Neutral DB bench press", label: "Neutral DB bench", sets: 2, reps: "8-10", unit: "kg", startWeight: 22.5, step: 2.5, rule: "compound", note: "Per dumbbell · start 20–22.5 kg" },
      { name: "Seated cable row", label: "Seated cable row", sets: 2, reps: "8-12", unit: "kg", startWeight: 45, step: 5, rule: "compound", note: "Start 40–50 kg · torso fixed" },
      { name: "Romanian deadlift", label: "Romanian deadlift", sets: 2, reps: "8-10", unit: "kg", startWeight: 75, step: 5, rule: "compound", note: "Start 70–80 kg · straps are fine" },
      { name: "Cable lateral raise", label: "Cable lateral raise", sets: 1, reps: "12-15", unit: "lbs", startWeight: 15, step: 5, rule: "hypertrophy", note: "Per side · smooth reps" },
      { name: "Hammer curl", label: "Hammer curl", sets: 1, reps: "10-12", unit: "kg", startWeight: 12, step: 2, rule: "hypertrophy", note: "Per dumbbell" },
      { name: "Cable pushdown bar", label: "Cable pushdown", sets: 1, reps: "10-12", unit: "lbs", startWeight: 75, step: 10, rule: "hypertrophy", note: "Soft lockout" }
    ]
  },
  B: {
    day: "Sat",
    title: "Return B",
    focus: "Quad variation · incline push · vertical pull · hamstrings · rear delts · arms",
    exercises: [
      { name: "Heel elevated squat", label: "Heel-elevated squat", sets: 2, reps: "8-10", unit: "kg", startWeight: 50, step: 5, rule: "compound", note: "Old work: 70 kg × 8" },
      { name: "Incline dumbell press", label: "Incline DB press", sets: 2, reps: "8-10", unit: "kg", startWeight: 22.5, step: 2.5, rule: "compound", note: "Per dumbbell · old work: 35 kg" },
      { name: "Lat pulldown", label: "Neutral lat pulldown", sets: 2, reps: "8-12", unit: "lbs", startWeight: 90, step: 10, rule: "compound", note: "Controlled stretch · old work: 130 lb" },
      { name: "Lying DB leg curl", label: "Lying DB leg curl", sets: 2, reps: "10-15", unit: "kg", startWeight: 20, step: 2.5, rule: "hypertrophy", note: "Old work: 30 kg" },
      { name: "Cable rear delt fly", label: "Cable rear-delt fly", sets: 1, reps: "12-20", unit: "lbs", startWeight: 20, step: 5, rule: "hypertrophy", note: "Old work: 30 lb" },
      { name: "Bayesian Curl", label: "Bayesian curl", sets: 1, reps: "10-15", unit: "lbs", startWeight: 35, step: 5, rule: "hypertrophy", note: "Per side · keep shoulder still" },
      { name: "Overhead cable ext", label: "Overhead cable extension", sets: 1, reps: "10-15", unit: "lbs", startWeight: 45, step: 5, rule: "hypertrophy", note: "No hard lockout" }
    ]
  }
};

const RETURN_WEEKS = [
  { week: 1, wed: "2026-08-26", sat: "2026-08-29", phase: "Reacclimate", rir: 4 },
  { week: 2, wed: "2026-09-02", sat: "2026-09-05", phase: "Reacclimate", rir: 4 },
  { week: 3, wed: "2026-09-09", sat: "2026-09-12", phase: "Build rhythm", rir: 3 },
  { week: 4, wed: "2026-09-16", sat: "2026-09-19", phase: "Build rhythm", rir: 3 },
  { week: 5, wed: "2026-09-23", sat: "2026-09-26", phase: "Build capacity", rir: 2 },
  { week: 6, wed: "2026-09-30", sat: "2026-10-03", phase: "Build capacity", rir: 2 },
  { week: 7, wed: "2026-10-14", sat: "2026-10-17", phase: "Reload after holiday", rir: 3 },
  { week: 8, wed: "2026-10-21", sat: "2026-10-24", phase: "Set the baseline", rir: 2 }
];

const RETURN_SESSIONS = RETURN_WEEKS.flatMap(item => [
  { week: item.week, date: item.wed, workout: "A", day: "Wed", phase: item.phase, rir: item.rir },
  { week: item.week, date: item.sat, workout: "B", day: "Sat", phase: item.phase, rir: item.rir }
]);

function returnDateLabel(iso, options = {}) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: options.weekday === false ? undefined : "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function returnSetsFor(exercise, week) {
  if (exercise.rule === "compound") return week >= 5 && week !== 7 ? 3 : 2;
  return week === 1 ? 1 : 2;
}

function returnRoutineDays() {
  return ["A", "B"].map(key => {
    const workout = RETURN_WORKOUTS[key];
    return {
      day: workout.day,
      title: workout.title,
      type: "opt",
      focus: workout.focus,
      returnBlockKey: RETURN_BLOCK_KEY,
      exercises: workout.exercises.map(exercise => ({
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        unit: exercise.unit,
        rule: exercise.rule,
        startWeight: exercise.startWeight
      }))
    };
  });
}

function returnSessionFor(profile, slot) {
  return (profile.loggedSessions || []).find(session => {
    const planned = session.plannedDate || session.date;
    return planned === slot.date && (
      session.returnBlockKey === RETURN_BLOCK_KEY ||
      (session.routineDay === slot.day && /^Return [AB]$/.test(session.split || ""))
    );
  }) || null;
}

function returnLastSession(profile, slot) {
  return RETURN_SESSIONS
    .filter(candidate => candidate.workout === slot.workout && candidate.date < slot.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(candidate => returnSessionFor(profile, candidate))
    .find(Boolean) || null;
}

function returnEntryFor(session, exercise) {
  return (session?.entries || []).find(entry => entry.exercise === exercise.name) || null;
}

function returnInitialDraft(profile, slot) {
  const workout = RETURN_WORKOUTS[slot.workout];
  const completed = returnSessionFor(profile, slot);
  const saved = profile.sessionPlansByDate?.[slot.date]?.returnBlockDraft;
  if (saved?.exercises?.length) return saved;
  const previous = returnLastSession(profile, slot);
  return {
    energy: completed?.dailyMetrics?.energy || "",
    sessionRpe: completed?.dailyMetrics?.rpe || "",
    notes: completed?.dayNote || "",
    exercises: workout.exercises.map(exercise => {
      const loggedEntry = returnEntryFor(completed, exercise);
      const previousEntry = returnEntryFor(previous, exercise);
      const previousWeight = previousEntry?.sets?.find(set => Number(set.weight) > 0)?.weight;
      const numberOfSets = loggedEntry?.sets?.length || returnSetsFor(exercise, slot.week);
      return {
        name: exercise.name,
        sets: Array.from({ length: numberOfSets }, (_, index) => {
          const loggedSet = loggedEntry?.sets?.[index];
          return {
            weight: loggedSet?.weight ?? previousWeight ?? exercise.startWeight,
            reps: loggedSet?.repsNumber ?? loggedSet?.reps ?? "",
            rir: loggedSet?.rpe != null ? Math.max(0, 10 - Number(loggedSet.rpe)) : slot.rir
          };
        })
      };
    })
  };
}

function ReturnMetric({ label, value, sub, tone = "" }) {
  return (
    <div className={`return-metric ${tone}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function ReturnSessionEditor({ app, slot, completed, onClose }) {
  const workout = RETURN_WORKOUTS[slot.workout];
  const [draft, setDraft] = React.useState(() => returnInitialDraft(app.activeProfile, slot));
  const [ready, setReady] = React.useState(false);
  const [savedState, setSavedState] = React.useState("");

  const updateSet = (exerciseIndex, setIndex, field, value) => {
    setDraft(current => ({
      ...current,
      exercises: current.exercises.map((exercise, eIndex) => eIndex !== exerciseIndex ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set, sIndex) => sIndex !== setIndex ? set : { ...set, [field]: value })
      })
    }));
  };

  const saveDraft = () => {
    app.updateSessionPlan?.(slot.date, {
      routineDay: slot.day,
      status: "draft",
      returnBlockDraft: draft,
      returnBlockKey: RETURN_BLOCK_KEY
    });
    setSavedState("draft");
    setTimeout(() => setSavedState(""), 1800);
  };

  const finishSession = () => {
    const entries = workout.exercises.map((exercise, exerciseIndex) => {
      const loggedSets = (draft.exercises[exerciseIndex]?.sets || [])
        .filter(set => Number(set.reps) > 0)
        .map((set, setIndex) => ({
          set: setIndex + 1,
          weight: Number(set.weight) || 0,
          unit: exercise.unit,
          reps: Number(set.reps),
          repsNumber: Number(set.reps),
          rpe: set.rir === "" ? null : Math.max(1, Math.min(10, 10 - Number(set.rir))),
          note: null
        }));
      return {
        exercise: exercise.name,
        movementGroup: window.RepsData.movementFor(exercise.name),
        targetSets: returnSetsFor(exercise, slot.week),
        targetReps: exercise.reps,
        sets: loggedSets,
        status: "performed",
        notes: []
      };
    }).filter(entry => entry.sets.length);
    const performedSetCount = entries.reduce((sum, entry) => sum + entry.sets.length, 0);
    if (!performedSetCount) {
      setSavedState("empty");
      setTimeout(() => setSavedState(""), 2000);
      return;
    }
    const session = {
      id: completed?.id || `return8w:${app.activeProfile.id}:${slot.date}`,
      block: "8-Week Return",
      weekStart: window.RepsData.mondayOf(slot.date),
      date: slot.date,
      plannedDate: slot.date,
      plannedWeekStart: window.RepsData.mondayOf(slot.date),
      routineDay: slot.day,
      nominalDay: slot.day,
      split: workout.title,
      dayNote: draft.notes || null,
      entries,
      dailyMetrics: {
        rpe: draft.sessionRpe === "" ? null : Number(draft.sessionRpe),
        energy: draft.energy === "" ? null : Number(draft.energy)
      },
      ignoreForProgression: false,
      performedSetCount,
      plannedExerciseCount: workout.exercises.length,
      status: "performed",
      source: "local",
      returnBlockKey: RETURN_BLOCK_KEY,
      returnWeek: slot.week,
      updatedAt: new Date().toISOString()
    };
    app.upsertLoggedSession?.(session, { clearPlanDates: [slot.date] });
    setSavedState("saved");
    setTimeout(() => onClose(), 700);
  };

  return (
    <div className="return-editor">
      <div className="return-safety">
        <label>
          <input type="checkbox" checked={ready} onChange={event => setReady(event.target.checked)} />
          <span><strong>Symptom-free now</strong><small>No chest/lung symptoms, unusual breathlessness, dizziness, palpitations, or active aura.</small></span>
        </label>
        <span>Stop the session if any returns.</span>
      </div>

      <div className="return-editor-head return-grid-row">
        <span>Exercise</span><span>Target</span><span>Set</span><span>Weight</span><span>Reps</span><span>RIR</span>
      </div>
      {workout.exercises.map((exercise, exerciseIndex) => {
        const exerciseDraft = draft.exercises[exerciseIndex];
        return (
          <div className="return-exercise" key={exercise.name}>
            {(exerciseDraft?.sets || []).map((set, setIndex) => (
              <div className="return-grid-row" key={setIndex}>
                <div className="return-ex-name">
                  {setIndex === 0 && <><strong>{exercise.label}</strong><small>{exercise.note}</small></>}
                </div>
                <div className="return-target">{setIndex === 0 && <><strong>{exercise.reps}</strong><small>{slot.rir} RIR goal</small></>}</div>
                <span className="return-set-num">{setIndex + 1}</span>
                <label className="return-field">
                  <input type="number" inputMode="decimal" step="0.5" min="0" value={set.weight}
                    aria-label={`${exercise.label} set ${setIndex + 1} weight`}
                    onChange={event => updateSet(exerciseIndex, setIndex, "weight", event.target.value)} />
                  <span>{exercise.unit}</span>
                </label>
                <label className="return-field compact">
                  <input type="number" inputMode="numeric" min="0" max="40" value={set.reps}
                    aria-label={`${exercise.label} set ${setIndex + 1} reps`}
                    onChange={event => updateSet(exerciseIndex, setIndex, "reps", event.target.value)} />
                </label>
                <label className="return-field compact">
                  <input type="number" inputMode="numeric" min="0" max="8" value={set.rir}
                    aria-label={`${exercise.label} set ${setIndex + 1} repetitions in reserve`}
                    onChange={event => updateSet(exerciseIndex, setIndex, "rir", event.target.value)} />
                </label>
              </div>
            ))}
          </div>
        );
      })}

      <div className="return-session-meta">
        <label><span>Energy before · /10</span><input type="number" min="1" max="10" value={draft.energy} onChange={event => setDraft(current => ({ ...current, energy: event.target.value }))} /></label>
        <label><span>Session RPE · /10</span><input type="number" min="1" max="10" value={draft.sessionRpe} onChange={event => setDraft(current => ({ ...current, sessionRpe: event.target.value }))} /></label>
        <label className="wide"><span>Notes or symptoms</span><input value={draft.notes} placeholder="How did it feel?" onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} /></label>
      </div>

      <div className="return-editor-actions">
        <span className="return-save-state" aria-live="polite">
          {savedState === "draft" && "Draft saved"}
          {savedState === "saved" && "Session saved"}
          {savedState === "empty" && "Enter at least one completed set"}
        </span>
        <button className="btn ghost sm" type="button" onClick={onClose}>Close</button>
        <button className="btn sm" type="button" onClick={saveDraft}>Save draft</button>
        <button className="btn primary sm" type="button" disabled={!ready && !completed} onClick={finishSession}>
          <RepsIcons.Check /> {completed ? "Update session" : "Finish session"}
        </button>
      </div>
    </div>
  );
}

function ReturnSessionCard({ app, slot, selected, onSelect }) {
  const completed = returnSessionFor(app.activeProfile, slot);
  const isToday = slot.date === app.todayIso;
  const isPast = slot.date < app.todayIso;
  const totalSets = completed?.performedSetCount || 0;
  const workout = RETURN_WORKOUTS[slot.workout];
  return (
    <article className={`return-session ${selected ? "is-open" : ""} ${completed ? "is-complete" : ""} ${isToday ? "is-today" : ""}`}>
      <button className="return-session-summary" type="button" onClick={onSelect} aria-expanded={selected}>
        <span className={`return-session-mark ${completed ? "done" : ""}`}>{completed ? <RepsIcons.Check /> : slot.workout}</span>
        <span className="return-session-copy">
          <strong>{returnDateLabel(slot.date)} · {workout.title}</strong>
          <small>{workout.focus}</small>
        </span>
        <span className="return-session-status">
          {isToday && !completed && <span className="chip accent">today</span>}
          {completed && <span className="chip good">{totalSets} sets logged</span>}
          {!completed && isPast && <span className="chip warn">available</span>}
          {!completed && !isToday && !isPast && <span className="chip">planned</span>}
          <RepsIcons.ChevronDown />
        </span>
      </button>
      {selected && <ReturnSessionEditor key={slot.date} app={app} slot={slot} completed={completed} onClose={() => onSelect(false)} />}
    </article>
  );
}

function ReturnWeek({ app, week, selectedDate, setSelectedDate }) {
  const sessions = RETURN_SESSIONS.filter(slot => slot.week === week.week);
  const completeCount = sessions.filter(slot => returnSessionFor(app.activeProfile, slot)).length;
  return (
    <section className={`return-week ${completeCount === 2 ? "is-complete" : ""}`}>
      <header className="return-week-head">
        <div>
          <span className="return-week-kicker">Week {week.week} · {week.phase}</span>
          <strong>{returnDateLabel(week.wed, { weekday: false })} – {returnDateLabel(week.sat, { weekday: false })}</strong>
        </div>
        <div className="return-week-dose">
          <span>{week.rir} RIR</span>
          <b>{completeCount}/2</b>
        </div>
      </header>
      <div className="return-week-sessions">
        {sessions.map(slot => (
          <ReturnSessionCard
            key={slot.date}
            app={app}
            slot={slot}
            selected={selectedDate === slot.date}
            onSelect={(force) => setSelectedDate(current => typeof force === "boolean" ? (force ? slot.date : null) : (current === slot.date ? null : slot.date))} />
        ))}
      </div>
    </section>
  );
}

function ReturnBlockView() {
  const app = window.RepsState.useApp();
  const profile = app.activeProfile;
  const installedRoutine = (profile.routines || []).find(routine => routine.returnBlockKey === RETURN_BLOCK_KEY || routine.name === RETURN_ROUTINE_NAME);
  const installedRef = React.useRef(null);

  React.useEffect(() => {
    if (installedRoutine || installedRef.current === profile.id) return;
    installedRef.current = profile.id;
    const id = app.addRoutine({
      id: RETURN_ROUTINE_ID,
      name: RETURN_ROUTINE_NAME,
      days: returnRoutineDays(),
      returnBlockKey: RETURN_BLOCK_KEY,
      startDate: "2026-08-26",
      endDate: "2026-10-24"
    });
    app.setActiveRoutine(id);
  }, [installedRoutine, app.activeProfile.id]);

  const completed = RETURN_SESSIONS.filter(slot => returnSessionFor(profile, slot));
  const nextSlot = RETURN_SESSIONS.find(slot => !returnSessionFor(profile, slot) && slot.date >= app.todayIso)
    || RETURN_SESSIONS.find(slot => !returnSessionFor(profile, slot));
  const [selectedDate, setSelectedDate] = React.useState(nextSlot?.date || null);
  const progress = Math.round((completed.length / RETURN_SESSIONS.length) * 100);

  return (
    <div className="view return-view">
      <div className="page-head">
        <div>
          <h1 className="page-title">8-Week Return</h1>
          <div className="page-sub">Wednesdays + Saturdays · 26 Aug – 24 Oct · holiday protected</div>
        </div>
        <div className="page-actions">
          <span className={`chip ${installedRoutine ? "good" : "warn"}`}>
            {installedRoutine ? "Routine added" : "Adding to Routines…"}
          </span>
        </div>
      </div>

      <div className="return-hero panel">
        <div className="return-hero-copy">
          <span className="return-eyebrow">Rebuild block · 8 training weeks</span>
          <h2>Strong enough to feel like training.<br />Easy enough to recover from.</h2>
          <p>I raised the starting loads from the first draft. The big lifts now begin around 60–70% of your old working weights, with editable fields for every set. One small upward calibration is fine when set one is symptom-free and still has 6+ clean reps in reserve.</p>
          <div className="return-progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="return-hero-metrics">
          <ReturnMetric label="Completed" value={`${completed.length}/16`} sub={`${progress}% of the block`} tone="accent" />
          <ReturnMetric label="Next session" value={nextSlot ? returnDateLabel(nextSlot.date, { weekday: false }) : "Done"} sub={nextSlot ? `Return ${nextSlot.workout} · week ${nextSlot.week}` : "Baseline established"} />
          <ReturnMetric label="Holiday" value="4–10 Oct" sub="No sessions · no catch-up" tone="cool" />
        </div>
      </div>

      <div className="return-load-strip panel">
        <div><span>Squat</span><strong>85 kg</strong><small>80–90 calibration</small></div>
        <div><span>RDL</span><strong>75 kg</strong><small>70–80 calibration</small></div>
        <div><span>DB bench</span><strong>22.5 kg</strong><small>per hand</small></div>
        <div><span>Cable row</span><strong>45 kg</strong><small>40–50 calibration</small></div>
        <div><span>Effort</span><strong>4 RIR</strong><small>week-one target</small></div>
      </div>

      <div className="return-callout">
        <RepsIcons.Calendar />
        <div><strong>Holiday week is deliberately empty.</strong><span>Wednesday 7 and Saturday 10 October are skipped. Week 7 starts on Wednesday 14 October with one set less on compounds if travel fatigue is still noticeable.</span></div>
      </div>

      <div className="return-weeks">
        {RETURN_WEEKS.map(week => (
          <React.Fragment key={week.week}>
            {week.week === 7 && (
              <div className="return-holiday">
                <span><RepsIcons.Calendar /></span>
                <div><strong>Holiday · 4–10 October</strong><small>Recovery week · no gym · resume 14 October</small></div>
                <span className="chip cool">planned break</span>
              </div>
            )}
            <ReturnWeek app={app} week={week} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
          </React.Fragment>
        ))}
      </div>

      <div className="return-footer-note panel">
        <strong>Progression rule</strong>
        <span>Hit the top of the rep range on every working set, finish inside the week's RIR target, and remain free of concerning symptoms during and for 24 hours after. Then add the smallest increment next time. Otherwise repeat the load. Chest/lung symptoms, unusual breathlessness, dizziness, palpitations, or aura end the session.</span>
      </div>
    </div>
  );
}

window.RepsReturnBlock = ReturnBlockView;
window.RepsReturnBlockMeta = {
  key: RETURN_BLOCK_KEY,
  name: RETURN_ROUTINE_NAME,
  startDate: "2026-08-26",
  endDate: "2026-10-24",
  holiday: "4–10 Oct",
  sessions: RETURN_SESSIONS.map(slot => ({ ...slot }))
};
