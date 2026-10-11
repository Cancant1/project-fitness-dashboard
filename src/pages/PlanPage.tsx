import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { daysBetween, fmtShortDate, fmtShortDateYear, todayIso } from "../lib/format";
import { PLAN } from "../plan/bridge";
import type { ProgramWeek } from "../plan/types";
import { MaxesPanel } from "./plan/MaxesPanel";
import { Overview } from "./plan/Overview";
import { StartPlanSheet } from "./plan/StartPlanSheet";
import { WeekDetail } from "./plan/WeekDetail";
import { WeekList } from "./plan/WeekList";
import { currentWeek, fmtRange, useMediaQuery, usePlanContext, weekEnd } from "./plan/planView";
import "./plan/plan.css";

const weeksWhere = (f: (w: ProgramWeek) => boolean) => PLAN.weeks.filter(f).map((w) => w.weekNo).join(" and ");

type Tab = "weeks" | "rules" | "maxes";
const TABS: [Tab, string][] = [["weeks", "Weeks"], ["rules", "How it works"], ["maxes", "Training maxes"]];

export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const ctx = usePlanContext();
  const desktop = useMediaQuery("(min-width: 900px)");
  const [confirm, setConfirm] = useState(false);
  const today = todayIso();
  const now = currentWeek(today);

  const weekParam = params.get("week");
  const weekNo = weekParam != null && /^\d+$/.test(weekParam) && Number(weekParam) < PLAN.weeks.length ? Number(weekParam) : null;
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "rules" || tabParam === "maxes" ? tabParam : "weeks";

  useEffect(() => {
    if (!desktop) window.scrollTo(0, 0);
  }, [weekNo, desktop]);

  // Phone: a week opens as its own view.
  if (!desktop && weekNo != null) {
    return <main className="page"><WeekDetail weekNo={weekNo} ctx={ctx} /></main>;
  }

  const first = PLAN.weeks[0]!;
  const last = PLAN.weeks[PLAN.weeks.length - 1]!;
  const end = weekEnd(last);
  const status = !now
    ? `Finished ${fmtShortDateYear(end)}`
    : now.status === "before"
      ? `Starts Mon ${fmtShortDate(first.startDate)}${daysBetween(today, first.startDate) === 1 ? ", tomorrow" : ` · in ${daysBetween(today, first.startDate)} days`}`
      : `Week ${now.week.weekNo} of ${last.weekNo} · ${now.week.label} · ${fmtRange(now.week.startDate, weekEnd(now.week))}`;
  const selected = weekNo ?? now?.week.weekNo ?? 0;

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{fmtShortDateYear(first.startDate)} → {fmtShortDateYear(end)} · {PLAN.weeks.length} weeks</p>
          <h1 className="large-title">Plan</h1>
        </div>
        {ctx.program && <span className="chip chip-good" style={{ marginBottom: 8 }}>Started</span>}
      </header>

      <section className="card card-hero">
        <div style={{ padding: "12px 12px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, letterSpacing: -0.3 }}>{PLAN.name}</span>
            <span className="row-sub" style={{ fontSize: 15 }}>{status}</span>
          </div>
          <div className="weeks" aria-hidden="true">
            {PLAN.weeks.map((w) => (
              <div key={w.weekNo} className={w.weekNo === now?.week.weekNo ? "now" : w.type === "test" ? "test" : w.checkpoint ? "check" : w.type === "deload" || w.type === "taper" ? "light" : undefined}>{w.weekNo}</div>
            ))}
          </div>
          <div className="goal-grid" aria-label="Goals for the PR test">
            {(["squat", "deadlift", "incline_db_press", "weighted_pullup"] as const).map((l) => {
              const g = PLAN.goals[l];
              return (
                <div className="goal" key={l}>
                  <span className="row-sub">{l === "squat" ? "Squat" : l === "deadlift" ? "Deadlift" : l === "incline_db_press" ? "Incline DB, each hand" : "Pull-up, added"}</span>
                  <strong>{l === "weighted_pullup" ? "+" : ""}{g.load} kg × {g.reps}</strong>
                </div>
              );
            })}
          </div>
          <p className="row-sub">PR test {fmtRange(last.startDate, end)}. Checkpoints end of week {weeksWhere((w) => !!w.checkpoint)}; deloads in weeks {weeksWhere((w) => w.type === "deload")}; taper in week {weeksWhere((w) => w.type === "taper")}.</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!ctx.program && (
            <button className="btn btn-primary hero-btn" style={{ flex: "1 1 200px" }} onClick={() => setConfirm(true)}>Start the plan</button>
          )}
          {now && (
            <Link to={{ search: `?week=${now.week.weekNo}` }} className={`btn ${ctx.program ? "btn-primary" : "btn-tinted"} hero-btn`} style={{ flex: "1 1 200px" }}>
              {now.status === "before" ? "See week 0" : "This week"}
            </Link>
          )}
        </div>
      </section>

      <div className="segmented seg-full" role="group" aria-label="Plan sections">
        {TABS.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setParams(k === "weeks" ? {} : { tab: k })}>{label}</button>
        ))}
      </div>

      {tab === "weeks" && (desktop ? (
        <div className="plan-cols">
          <section className="section">
            <h2 className="section-label">{PLAN.weeks.length} weeks</h2>
            <WeekList nowWeekNo={now?.week.weekNo ?? null} selected={selected} />
          </section>
          <WeekDetail weekNo={selected} ctx={ctx} embedded />
        </div>
      ) : (
        <section className="section">
          <h2 className="section-label">{PLAN.weeks.length} weeks</h2>
          <WeekList nowWeekNo={now?.week.weekNo ?? null} />
        </section>
      ))}

      {tab === "rules" && <Overview />}
      {tab === "maxes" && <MaxesPanel ctx={ctx} />}

      {confirm && <StartPlanSheet onClose={() => setConfirm(false)} />}
    </main>
  );
}
