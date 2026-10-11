import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { daysBetween, fmtShortDateYear, todayIso } from "../lib/format";
import { PLAN } from "../plan/bridge";
import { Card, Label, Pill, Stat } from "../ui/kit";
import { ChevronLeft, ChevronRight } from "../ui/icons";
import { MaxesPanel, SetMaxSheet, type Lift } from "./plan/MaxesPanel";
import { HowItWorks } from "./plan/Overview";
import { StartPlanSheet } from "./plan/StartPlanSheet";
import { WeekDays } from "./plan/WeekDetail";
import { RibbonLegend, WeekRibbon } from "./plan/WeekRibbon";
import { TYPE_NAME, currentWeek, fmtPct, fmtRange, phaseOf, planEnd, usePlanContext, weekEnd, weekIntensity, type PlanContext } from "./plan/planView";
import "./plan/plan.css";

const GOALS: { lift: Lift; label: string; sub: string }[] = [
  { lift: "squat", label: "Squat", sub: "reps" },
  { lift: "deadlift", label: "Deadlift", sub: "reps" },
  { lift: "incline_db_press", label: "Incline DB", sub: "each hand" },
  { lift: "weighted_pullup", label: "Pull-up", sub: "added" },
];

/** Plan: where am I in the block, and what is this week? */
export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const ctx = usePlanContext();
  const [confirm, setConfirm] = useState(false);
  const [setting, setSetting] = useState<Lift | null>(null);
  const today = todayIso();
  const now = currentWeek(today);
  const nowNo = now?.week.weekNo ?? null;

  const weekParam = params.get("week");
  const weekNo = weekParam != null && /^\d+$/.test(weekParam) && Number(weekParam) < PLAN.weeks.length ? Number(weekParam) : null;
  const selected = weekNo ?? now?.week.weekNo ?? 0;
  const select = (n: number) => setParams(n === (now?.week.weekNo ?? 0) ? {} : { week: String(n) }, { replace: true });

  const first = PLAN.weeks[0]!;
  const test = PLAN.weeks[PLAN.weeks.length - 1]!;
  const lastNo = test.weekNo;
  const status = !now ? "Finished"
    : now.status === "before"
      ? (() => { const d = daysBetween(today, first.startDate); return d === 1 ? "Starts tomorrow" : `Starts in ${d} days`; })()
      : `Week ${now.week.weekNo} of ${lastNo}`;

  return (
    <main className="page plan">
      <header className="k-head pl-head">
        <div>
          <p className="k-eyebrow">{fmtShortDateYear(first.startDate)} – {fmtShortDateYear(planEnd())}</p>
          <h1 className="k-title">{PLAN.name}</h1>
        </div>
        <div className="k-head-actions">
          <Pill tone={now?.status === "during" ? "accent" : "plain"}>{status}</Pill>
          {!ctx.program && <button type="button" className="btn btn-primary pl-head-btn" onClick={() => setConfirm(true)}>Start</button>}
        </div>
      </header>

      <section>
        <Label>Goals · PR test {fmtRange(test.startDate, weekEnd(test))}</Label>
        <div className="k-grid-4">
          {GOALS.map(({ lift, label, sub }) => {
            const g = PLAN.goals[lift];
            return (
              <Card key={lift} className="pl-goal">
                <Stat label={label} value={`${lift === "weighted_pullup" ? "+" : ""}${g.load}`} unit="kg" tone="warm" sub={`× ${g.reps} ${sub}`} />
              </Card>
            );
          })}
        </div>
      </section>

      <Ribbon selected={selected} onSelect={select} nowNo={nowNo} nowLabel={now?.status === "before" ? "Next" : "Now"} />

      <div className="k-dash">
        <div className="k-col">
          <WeekDays weekNo={selected} ctx={ctx} onSetMax={() => setSetting(missingLift(ctx))} />
        </div>
        <div className="k-col">
          <MaxesPanel ctx={ctx} onSet={setSetting} />
          <HowItWorks />
        </div>
      </div>

      {confirm && <StartPlanSheet onClose={() => setConfirm(false)} />}
      {setting && <SetMaxSheet initial={setting} ctx={ctx} onClose={() => setSetting(null)} />}
    </main>
  );
}

function Ribbon({ selected, onSelect, nowNo, nowLabel }: { selected: number; onSelect: (n: number) => void; nowNo: number | null; nowLabel: string }) {
  const week = PLAN.weeks[selected]!;
  const pct = weekIntensity(week.type);
  const phase = phaseOf(week.type);
  const last = PLAN.weeks.length - 1;
  return (
    <Card className="pl-ribbon-card" aria-label="The 20 weeks">
      <div className="pl-rib-head">
        <div className="pl-rib-sel">
          <div className="pl-rib-sel-top">
            <span className="pl-rib-sel-week">Week {week.weekNo}</span>
            <Pill tone={phase === "test" ? "warm" : phase === "training" ? "accent" : "plain"}>{TYPE_NAME[week.type]}</Pill>
            {week.weekNo === nowNo && <Pill tone="warm">{nowLabel}</Pill>}
            {week.checkpoint && <Pill tone="warm">{week.checkpoint.name}</Pill>}
          </div>
          <span className="pl-rib-sel-sub">{fmtRange(week.startDate, weekEnd(week))}{pct != null ? ` · squat ${fmtPct(pct)}` : ""}</span>
        </div>
        <nav className="pl-rib-nav" aria-label="Previous or next week">
          <button type="button" className="pl-nav-btn" disabled={selected === 0} aria-label="Previous week" onClick={() => onSelect(selected - 1)}><ChevronLeft /></button>
          <button type="button" className="pl-nav-btn" disabled={selected === last} aria-label="Next week" onClick={() => onSelect(selected + 1)}><ChevronRight style={{ width: 18, height: 18 }} /></button>
        </nav>
      </div>
      <WeekRibbon selected={selected} onSelect={onSelect} nowWeekNo={nowNo} />
      <RibbonLegend />
    </Card>
  );
}

/** The lift whose training max the plan is waiting for. */
function missingLift(ctx: PlanContext): Lift {
  return ctx.state.trainingMaxes.squat == null ? "squat" : ctx.state.trainingMaxes.deadlift == null ? "deadlift" : "squat";
}
