import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, parseDecimal, todayIso } from "../lib/format";
import { bodyweight7d, dayTotals, targetFor } from "../lib/nutrition";
import { dayForDate, getWeek, prescribeDay } from "../plan/engine";
import { PLAN, PLAN_KEY, activeProgram, ensurePlanExercises, equipmentFrom, planState, usePlanIds } from "../plan/bridge";
import { startWorkout } from "../plan/workout";
import type { PrescribedDay } from "../plan/types";
import { CheckIcon, ChevronRight, PlayIcon } from "../ui/icons";
import { ConditioningCard } from "./ConditioningCard";
import { SetMaxes } from "./SetMaxes";

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHORT_TITLE: Record<string, string> = { lower_a: "Lower", upper_a: "Upper", lower_b: "Lower", upper_b: "Upper", easy_ride: "Ride", boxing: "Boxing", rounds: "Rounds" };

export function TodayPage() {
  const { local } = useStore();
  const navigate = useNavigate();
  const programs = useRows("programs");
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const maxes = useRows("training_maxes");
  const exercises = useRows("exercises");
  const profiles = useRows("profiles");
  const weights = useRows("body_measurements");
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const targets = useRows("nutrition_targets");
  const conditioning = useRows("conditioning");
  const [weightText, setWeightText] = useState("");
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const program = activeProgram(programs);
  const equipment = equipmentFrom(profiles[0]);
  const inProgress = sessions.find((s) => s.status === "in_progress");

  const ids = usePlanIds(exercises);

  // The day to show: today if it is in the plan, otherwise the plan's first day (before it starts).
  const planDate = today < PLAN.weeks[0]!.startDate ? PLAN.weeks[0]!.startDate : today;
  const slot = dayForDate(PLAN, planDate);
  const doneToday = sessions.some((s) => s.date === today && s.status === "completed" && s.program_id === program?.id);

  const prescription = useMemo((): { day: PrescribedDay | null; error: string | null } => {
    if (!program || !slot) return { day: null, error: null };
    try {
      const allIds = new Map(ids);
      const state = planState({ program, ids: allIds, maxes, sessions, sets, equipment });
      return { day: prescribeDay(PLAN, slot.week.weekNo, slot.day.key, state, equipment), error: null };
    } catch (e) {
      return { day: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [program, slot, ids, maxes, sessions, sets, equipment]);

  const weightToday = weights.find((w) => w.kind === "weight" && w.date === today);
  const totals = dayTotals(today, entries, days);
  const target = targetFor(today, targets, bodyweight7d(weights, today));

  async function startPlan() {
    setBusy(true);
    await ensurePlanExercises(local);
    await local.save("programs", {
      name: "Strength Return Plan", start_date: PLAN.weeks[0]!.startDate, weeks: PLAN.weeks.length, status: "active",
      rules: { key: PLAN_KEY }, goals: [], notes: null
    });
    setBusy(false);
  }

  async function start(day: PrescribedDay) {
    if (!program) return;
    setBusy(true);
    const allIds = await ensurePlanExercises(local);
    const id = await startWorkout(local, program, day, allIds, today);
    setBusy(false);
    navigate(`/workout/${id}`);
  }

  async function saveWeight() {
    const v = parseDecimal(weightText);
    if (v == null || v < 30 || v > 250) return;
    await local.save("body_measurements", { id: weightToday?.id, date: today, kind: "weight", value: v, unit: "kg", source: "app", note: null });
    setWeightText("");
  }

  const week = slot ? slot.week : null;
  const dayLabel = planDate === today ? "Today" : planDate === addDays(today, 1) ? "Tomorrow" : fmtShortDate(planDate);
  const day = prescription.day;
  const main = day?.exercises.filter((e) => e.group !== "shoulder_care") ?? [];

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{fmtLongDate(today)}</p>
          <h1 className="large-title">Today</h1>
        </div>
      </header>

      {inProgress && (
        <Link to={`/workout/${inProgress.id}`} className="card card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--fg)" }}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <span className="row-sub">Workout in progress</span>
            <span style={{ fontWeight: 600 }}>{inProgress.title}</span>
          </span>
          <span className="btn btn-primary btn-sm">Continue</span>
        </Link>
      )}

      {!program && (
        <section className="card card-hero">
          <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="chip chip-accent" style={{ alignSelf: "flex-start" }}>20 weeks · from Mon 12 Oct</span>
            <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 700, letterSpacing: -0.3 }}>Strength Return Plan</span>
            <p className="row-sub" style={{ fontSize: 15 }}>Squat 145 × 5, deadlift 205 × 5, incline DB 37.5 × 8, pull-up +20 × 8 by the end of February.</p>
          </div>
          <button className="btn btn-primary btn-block hero-btn" disabled={busy} onClick={() => void startPlan()}>Start the plan</button>
        </section>
      )}

      {program && !inProgress && slot && (
        slot.day.kind === "conditioning" ? (
          <ConditioningCard date={planDate} dayKey={slot.day.key} weekNo={slot.week.weekNo} existing={conditioning.filter((c) => c.date === planDate)} />
        ) : prescription.error ? (
          <SetMaxes message={prescription.error} ids={ids} program={program} />
        ) : day && day.kind === "lifting" ? (
          <section className="card card-hero">
            <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="chip chip-accent">Week {day.weekNo} · {day.weekLabel}</span>
                <span className="row-sub">{dayLabel}{day.minutes ? ` · about ${day.minutes} min` : ""}</span>
              </div>
              <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 700, letterSpacing: -0.3 }}>{day.title}</span>
            </div>
            <div style={{ padding: "0 12px" }}>
              {main.slice(0, 3).map((ex) => {
                const work = ex.sets.filter((s) => s.kind !== "warmup");
                const rep = work.find((s) => s.kind === "rep_out");
                const top = work[work.length - 1];
                return (
                  <div className="row" key={ex.exerciseKey} style={{ borderTop: "1px solid var(--sep)" }}>
                    <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.name.split(",")[0]}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                      {rep ? <span className="chip chip-warm" style={{ height: 22, fontSize: 12 }}>Rep-out</span> : <span className="row-sub">{work.length} × {work[0]?.repRange ? `${work[0].repRange[0]}–${work[0].repRange[1]}` : work[0]?.reps ?? ""}</span>}
                      <span className="num" style={{ fontWeight: 600 }}>{top ? `${fmtNum(top.load)} ${top.unit === "bodyweight" ? "" : top.unit}` : ""}</span>
                    </span>
                  </div>
                );
              })}
              {main.length > 3 && (
                <div className="row" style={{ borderTop: "1px solid var(--sep)", color: "var(--fg2)" }}>
                  <span>{main.length - 3} more exercises</span><ChevronRight />
                </div>
              )}
            </div>
            {doneToday ? (
              <p className="row-sub" style={{ padding: "8px 12px 12px", display: "flex", gap: 6, alignItems: "center" }}><CheckIcon style={{ color: "var(--good)" }} /> Done today</p>
            ) : (
              <button className="btn btn-primary btn-block hero-btn" style={{ marginTop: 6 }} disabled={busy} onClick={() => void start(day)}>
                <PlayIcon /> {planDate === today ? "Start Workout" : `Start ${day.title} early`}
              </button>
            )}
          </section>
        ) : (
          <section className="card card-pad"><p>Rest day. {day?.notes[0] ?? ""}</p></section>
        )
      )}

      <section className="grid-2">
        <div className="card" style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <label htmlFor="t-weight" className="row-sub" style={{ fontWeight: 600 }}>Weigh-in</label>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="field" style={{ flex: 1, padding: "0 10px" }}>
              <input id="t-weight" inputMode="decimal" className="num" style={{ fontWeight: 600 }}
                placeholder={weightToday ? String(weightToday.value).replace(".", ",") : "74,2"}
                value={weightText} onChange={(e) => setWeightText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveWeight()} />
              <span className="field-suffix" style={{ fontSize: 13 }}>kg</span>
            </div>
            <button className="btn btn-tinted btn-icon" aria-label="Save weight" style={{ borderRadius: 14, flex: "none" }} onClick={() => void saveWeight()}><CheckIcon /></button>
          </div>
          <span className="row-sub" style={{ fontSize: 12 }}>{weightToday ? `Saved ${fmtNum(weightToday.value, 1)} kg` : "Before food. The 7-day average counts."}</span>
        </div>
        <Link to="/food" className="card" style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 8, color: "var(--fg)" }}>
          <span style={{ display: "flex", justifyContent: "space-between" }}><span className="row-sub" style={{ fontWeight: 600 }}>Food</span><span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)" }}>Log</span></span>
          <span className="num" style={{ fontSize: 22, fontWeight: 700, lineHeight: "26px" }}>{fmtNum(totals.kcal, 0)}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>{target ? ` / ${fmtNum(target.kcal, 0)}` : ""} kcal</span></span>
          <div className="bar"><span style={{ width: `${target ? Math.min(100, (totals.kcal / target.kcal) * 100) : 0}%`, background: "var(--fg)" }} /></div>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}><span className="num" style={{ fontWeight: 600, color: "var(--fg)" }}>{fmtNum(totals.protein, 0)}</span>{target ? ` / ${fmtNum(target.protein, 0)}` : ""} g protein</span>
          <div className="bar"><span style={{ width: `${target ? Math.min(100, (totals.protein / target.protein) * 100) : 0}%` }} /></div>
        </Link>
      </section>

      {week && (
        <section className="section">
          <h2 className="section-label">Week {week.weekNo} · {getWeek(PLAN, week.weekNo).label}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, textAlign: "center" }}>
            {PLAN.days.slice().sort((a, b) => a.weekday - b.weekday).map((d) => {
              const date = addDays(week.startDate, d.weekday - 1);
              const isToday = date === today;
              const lifting = d.kind === "lifting";
              const done = sessions.some((s) => s.date === date && s.status === "completed") || conditioning.some((c) => c.date === date && c.done);
              return (
                <div key={d.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)" }}>{WEEKDAY[d.weekday - 1]![0]}</span>
                  <span className="num" style={{
                    width: 40, height: 40, borderRadius: 20, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 600,
                    background: isToday ? "var(--accent)" : done ? "var(--good-tint)" : lifting ? "var(--surface)" : "transparent",
                    color: isToday ? "#FFFFFF" : done ? "var(--good)" : lifting ? "var(--fg)" : "var(--fg2)",
                    boxShadow: !isToday && !done && lifting ? "var(--shadow)" : "none"
                  }}>{Number(date.slice(8))}</span>
                  <span style={{ fontSize: 11, color: lifting ? "var(--fg)" : "var(--fg2)" }}>{SHORT_TITLE[d.key] ?? d.title}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
