import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck, Cloud, Dumbbell, Flame, Scale, Sparkles, Target, Utensils } from "lucide-react";
import { useAppStore } from "../app/AppStore";
import { Button, Card, EmptyState, PageHeader, ProgressBar } from "../components/ui";
import { createSessionFromPlan } from "../domain/factories";
import { activeProfile, addDays, foodTotals, formatShortDate, sessionSetCount, startOfWeek, todayIso } from "../domain/utils";

export function TodayPage() {
  const { snapshot, mutate, syncMeta } = useAppStore();
  const navigate = useNavigate();
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const today = todayIso();
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const activeSession = snapshot.sessions.find((session) => session.profileId === profile.id && (session.status === "draft" || session.status === "inProgress"));
  const completedPlanIds = new Set(snapshot.sessions.filter((session) => session.status === "completed").map((session) => session.plannedWorkoutId));
  const nextPlan = snapshot.plannedWorkouts
    .filter((plan) => plan.profileId === profile.id && !plan.deletedAt && plan.date >= today && plan.status !== "skipped" && !completedPlanIds.has(plan.id))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const weekSessions = snapshot.sessions.filter((session) => session.profileId === profile.id && session.status === "completed" && session.actualDate >= weekStart && session.actualDate <= weekEnd);
  const recentSessions = snapshot.sessions.filter((session) => session.profileId === profile.id && session.status === "completed" && !session.deletedAt).sort((a, b) => b.actualDate.localeCompare(a.actualDate)).slice(0, 4);
  const todayEntries = snapshot.foodEntries.filter((entry) => entry.profileId === profile.id && entry.date === today && !entry.deletedAt);
  const totals = foodTotals(todayEntries);
  const override = snapshot.nutritionOverrides.find((entry) => entry.profileId === profile.id && entry.date === today && !entry.deletedAt);
  const target = snapshot.nutritionTargets.filter((item) => item.profileId === profile.id && item.effectiveFrom <= today && (!item.effectiveTo || item.effectiveTo >= today)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const dayKey = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${today}T12:00:00`));
  const macroTarget = target?.weekdays[dayKey] || target?.weekdays.Mon || { kcal: 2700, protein: 180 };
  const kcal = todayEntries.length ? totals.kcal : override?.kcal ?? totals.kcal;
  const protein = todayEntries.length ? totals.protein : override?.protein ?? totals.protein;
  const carbs = todayEntries.length ? totals.carbs : override?.carbs ?? totals.carbs;
  const fat = todayEntries.length ? totals.fat : override?.fat ?? totals.fat;
  const latestWeight = snapshot.measurements.filter((item) => item.profileId === profile.id && item.type === "weight" && !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date))[0];
  const weekVolume = useMemo(() => weekSessions.reduce((sum, session) => sum + session.performances.reduce((inner, performance) => inner + performance.sets.reduce((setSum, set) => setSum + (set.load ?? 0) * (set.reps ?? 0), 0), 0), 0), [weekSessions]);

  const startWorkout = async () => {
    if (activeSession) { navigate(`/train/live/${activeSession.id}`); return; }
    const session = createSessionFromPlan(profile.id, nextPlan);
    await mutate("Started workout from Today", (draft) => {
      draft.sessions.push(session);
      if (nextPlan) {
        const plan = draft.plannedWorkouts.find((item) => item.id === nextPlan.id);
        if (plan) { plan.updatedAt = new Date().toISOString(); }
      }
    });
    navigate(`/train/live/${session.id}`);
  };

  const insight = syncMeta.status === "error"
    ? { title: "GitHub needs attention", copy: syncMeta.message, action: "Open data settings", to: "/settings/data" }
    : weekSessions.length === 0
      ? { title: "Build the first rep of this week", copy: nextPlan ? `${nextPlan.title} is ready for ${formatShortDate(nextPlan.date, true)}.` : "Start an empty workout or choose a program.", action: "Open Train", to: "/train" }
      : protein < macroTarget.protein * .7
        ? { title: "Protein is behind today", copy: `${Math.round(protein)} of ${macroTarget.protein} g logged. Add a repeat meal in a few taps.`, action: "Add food", to: "/nutrition?add=food" }
        : { title: "Training rhythm is on track", copy: `${weekSessions.length} session${weekSessions.length === 1 ? "" : "s"} and ${Math.round(weekVolume).toLocaleString()} kg of volume this week.`, action: "See progress", to: "/progress" };

  return (
    <div className="page today-page">
      <PageHeader
        eyebrow={formatShortDate(today, true)}
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${profile.name.split(" ")[0]}.`}
        description="The next useful action, your current week, and the signals worth noticing."
        actions={<Button variant="primary" onClick={startWorkout}><Dumbbell />{activeSession ? "Resume workout" : "Start workout"}</Button>}
      />

      <Card className="next-action-card">
        <div className="next-action-main">
          <span className="next-action-icon"><Dumbbell /></span>
          <div>
            <span className="eyebrow">{activeSession ? "In progress" : nextPlan ? "Next workout" : "Train"}</span>
            <h2>{activeSession?.title || nextPlan?.title || "Choose your session"}</h2>
            <p>{activeSession ? `${activeSession.performances.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0)} sets completed · saved locally` : nextPlan ? `${formatShortDate(nextPlan.date, true)} · ${nextPlan.exercises.length} exercises${nextPlan.note ? ` · ${nextPlan.note}` : ""}` : "Start empty or choose a routine day."}</p>
          </div>
        </div>
        <Button variant="soft" onClick={startWorkout}>{activeSession ? "Resume" : "Open session"}<ArrowRight /></Button>
      </Card>

      <div className="stat-grid">
        <Card className="stat-card"><span>Sessions this week<CalendarCheck /></span><strong>{weekSessions.length}</strong><small>{weekSessions.reduce((sum, session) => sum + sessionSetCount(session), 0)} completed sets</small></Card>
        <Card className="stat-card"><span>Volume this week<Dumbbell /></span><strong>{weekVolume >= 1000 ? `${(weekVolume / 1000).toFixed(1)}k` : Math.round(weekVolume)}</strong><small>kg × reps · completed work</small></Card>
        <Card className="stat-card"><span>Energy today<Flame /></span><strong>{Math.round(kcal).toLocaleString()}</strong><small>of {macroTarget.kcal.toLocaleString()} kcal</small></Card>
        <Card className="stat-card"><span>Latest weight<Scale /></span><strong>{latestWeight ? latestWeight.value.toFixed(1) : "—"}</strong><small>{latestWeight ? `${latestWeight.unit} · ${formatShortDate(latestWeight.date)}` : "No weigh-in yet"}</small></Card>
      </div>

      <div className="content-grid">
        <div className="stack">
          <Card className="today-nutrition-card">
            <div className="card-header"><div><h2>Today’s nutrition</h2><small>{todayEntries.length ? `${todayEntries.length} logged item${todayEntries.length === 1 ? "" : "s"}` : override ? "Imported daily totals" : "Nothing logged yet"}</small></div><Button className="small" variant="ghost" onClick={() => navigate("/nutrition")}>Open diary<ArrowRight /></Button></div>
            <div className="macro-summary">
              <div><span><b>Calories</b><small>{Math.round(kcal)} / {macroTarget.kcal}</small></span><ProgressBar value={kcal} max={macroTarget.kcal} label="Calories" /></div>
              <div><span><b>Protein</b><small>{Math.round(protein)} / {macroTarget.protein} g</small></span><ProgressBar value={protein} max={macroTarget.protein} label="Protein" tone="protein" /></div>
              {profile.trackCarbs && <div><span><b>Carbs</b><small>{Math.round(carbs)} / {macroTarget.carbs ?? 0} g</small></span><ProgressBar value={carbs} max={macroTarget.carbs || 1} label="Carbs" tone="carbs" /></div>}
              {profile.trackFat && <div><span><b>Fat</b><small>{Math.round(fat)} / {macroTarget.fat ?? 0} g</small></span><ProgressBar value={fat} max={macroTarget.fat || 1} label="Fat" tone="fat" /></div>}
            </div>
            <div className="card-footer-actions"><Button variant="primary" onClick={() => navigate("/nutrition?add=food")}><Utensils />Add food</Button><Button variant="default" onClick={() => navigate("/nutrition/energy?add=weight")}><Scale />Log weight</Button></div>
          </Card>

          <Card>
            <div className="card-header"><div><h2>Recent training</h2><small>Completed sessions and set totals</small></div><Button className="small" variant="ghost" onClick={() => navigate("/train")}>History<ArrowRight /></Button></div>
            {recentSessions.length ? <div className="activity-list">{recentSessions.map((session) => <button key={session.id} onClick={() => navigate(`/train/session/${session.id}`)}><span className="activity-date"><b>{new Date(`${session.actualDate}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(`${session.actualDate}T12:00:00`))}</small></span><span><strong>{session.title}</strong><small>{session.performances.length} exercises · {sessionSetCount(session)} sets</small></span><ArrowRight /></button>)}</div> : <EmptyState icon={<Dumbbell />} title="No completed sessions yet" description="Your migrated and newly completed workouts will appear here." action={<Button onClick={() => navigate("/train")}>Open Train</Button>} />}
          </Card>
        </div>

        <div className="stack">
          <Card className="insight-card">
            <span className="insight-icon"><Sparkles /></span>
            <span className="eyebrow">Priority insight</span>
            <h2>{insight.title}</h2>
            <p>{insight.copy}</p>
            <Button variant="soft" onClick={() => navigate(insight.to)}>{insight.action}<ArrowRight /></Button>
          </Card>
          <Card className="week-card">
            <div className="card-header"><div><h2>This week</h2><small>{formatShortDate(weekStart)}–{formatShortDate(weekEnd)}</small></div><Target /></div>
            <div className="week-days">{Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).map((date) => {
              const session = weekSessions.find((item) => item.actualDate === date);
              const plan = snapshot.plannedWorkouts.find((item) => item.profileId === profile.id && item.date === date && !item.deletedAt);
              return <button key={date} className={`${date === today ? "today" : ""} ${session ? "done" : plan ? "planned" : ""}`.trim()} onClick={() => session ? navigate(`/train/session/${session.id}`) : plan ? navigate("/train") : undefined}><small>{new Intl.DateTimeFormat("en-GB", { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</small><b>{new Date(`${date}T12:00:00`).getDate()}</b><span>{session ? <CalendarCheck /> : plan ? <Dumbbell /> : null}</span></button>;
            })}</div>
          </Card>
          <Card className="sync-card"><span className={`sync-card-icon ${syncMeta.status}`}><Cloud /></span><div><strong>{syncMeta.dirty ? "Saved locally" : syncMeta.status === "synced" ? "GitHub is current" : "Local-first storage"}</strong><small>{syncMeta.message}</small></div><Button className="small" variant="ghost" onClick={() => navigate("/settings/data")}>Data</Button></Card>
        </div>
      </div>
    </div>
  );
}
