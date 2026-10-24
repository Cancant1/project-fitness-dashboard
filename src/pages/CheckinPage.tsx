import { useMemo, useState, type ReactNode } from "react";
import { useToday } from "../lib/useToday";
import { useSearchParams } from "react-router-dom";
import { AREAS, EVIDENCE, currentWeekNo, expectedBand, pathAnchor, planLine, weeklyReport, type Area, type CoachData, type Signal, type WeeklyReport } from "../coach";
import { useCoachData } from "../coach/hooks";
import { addDays, daysBetween, fmtNum, fmtShortDate, todayIso } from "../lib/format";
import type { TmLiftKey } from "../plan/types";
import { AreaChart, Bar, Card, Delta, Label, PageHead, Pill, Segmented, Sparkline, type Pt } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { CheckIcon, ChevronDown, ChevronLeft, ChevronRight } from "../ui/icons";
import { AppliedLine, ApplyButton, Dot, VERDICT_WORD, actionLabel, withoutApplied, worstStatus } from "./checkin/coachUi";
import { useToast } from "./food/ui";
import { TYPE_NAME, fmtRange } from "./plan/planView";

const AREA_NAME: Record<Area, string> = {
  consistency: "Consistency", strength: "Strength", muscle: "Muscle", body: "Body",
  fuel: "Fuel", joints: "Joints", recovery: "Recovery", conditioning: "Conditioning"
};

/** Check-in: how is my week going against the plan, and what do I change? */
export function CheckinPage() {
  const data = useCoachData();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [area, setArea] = useState<Area | null>(null);
  const toast = useToast();

  const lastNo = data.plan.weeks[data.plan.weeks.length - 1]!.weekNo;
  const nowNo = currentWeekNo(data, today) ?? (today < data.start ? 0 : lastNo);
  const param = params.get("week");
  const weekNo = param != null && /^\d+$/.test(param) ? Math.min(Number(param), nowNo) : nowNo;
  const select = (n: number) => setParams(n === nowNo ? {} : { week: String(n) }, { replace: true });

  const report = useMemo<WeeklyReport | null>(() => {
    try { return weeklyReport(data, weekNo, today); } catch { return null; }
  }, [data, weekNo, today]);

  if (!report) {
    return <main className="page checkin"><PageHead title="Check-in" /><Card><p className="k-muted">No plan week to check yet.</p></Card></main>;
  }

  const applied = report.signals.filter((s) => s.applied && !report.actions.includes(s));
  const list = [...report.actions.slice(0, 3), ...applied];
  // Changes applied this week whose rule no longer shows them (a running swap, a repeated week), so each has its Undo.
  const shown = new Set(list.flatMap((s) => (s.applied ? [s.applied.adjustmentId] : [])));
  const end = today < report.to ? today : report.to;
  const extra = data.adjustments.filter((a) => !shown.has(a.id) && a.created.slice(0, 10) >= report.from && a.created.slice(0, 10) <= end);
  const open = (a: Area) => setArea(a);

  return (
    <main className="page checkin">
      <PageHead eyebrow={fmtRange(report.from, report.to)} title="Check-in" />

      <div className="k-dash">
        <div className="k-col">
          <Card tone="hero" className="ci-hero">
            <div className="ci-hero-top">
              <div className="ci-hero-pills">
                <Pill tone="plain">{report.label}</Pill>
                <Pill tone="plain">{TYPE_NAME[report.weekType]}</Pill>
              </div>
              <nav className="ci-hero-nav" aria-label="Previous or next week">
                <button type="button" aria-label="Previous week" disabled={weekNo <= 0} onClick={() => select(weekNo - 1)}><ChevronLeft /></button>
                <button type="button" aria-label="Next week" disabled={weekNo >= nowNo} onClick={() => select(weekNo + 1)}><ChevronRight style={{ width: 18, height: 18 }} /></button>
              </nav>
            </div>
            <h2 className="ci-verdict">{VERDICT_WORD[report.verdict]}</h2>
            <p className="ci-headline">{report.headline}</p>
          </Card>

          <section>
            <Label>This week</Label>
            <Card pad={false} className="ci-acts k-rows">
              {list.map((s) => <ActionRow key={s.id} signal={s} today={today} onOpen={() => open(s.area)} onDone={toast.show} />)}
              {extra.map((a) => (
                <div key={a.id} className="ci-act">
                  <div className="ci-act-open ci-act-static">
                    <Dot tone="good" />
                    <span className="ci-act-main"><span className="ci-act-title">{actionLabel(a.data)}</span></span>
                  </div>
                  <div className="ci-act-ctrl"><AppliedLine applied={{ adjustmentId: a.id, created: a.created }} onDone={toast.show} /></div>
                </div>
              ))}
              {list.length + extra.length === 0 && (
                <div className="ci-act ci-act-none"><span className="ci-none-icon"><CheckIcon /></span><span>Nothing to change</span></div>
              )}
            </Card>
          </section>

          <HabitCard report={report} />

          <section className="ci-areas" aria-label="Areas">
            <Label>By area</Label>
            <div className="ci-grid">
              {AREAS.map((a) => <AreaTile key={a} area={a} report={report} data={data} today={today} onOpen={() => open(a)} />)}
            </div>
          </section>
        </div>

        <div className="k-col">
          <BodyCard report={report} data={data} today={today} />
          <InfoCard report={report} />
          <StrengthCard report={report} data={data} today={today} />
        </div>
      </div>

      {area && <AreaSheet area={area} report={report} today={today} onClose={() => setArea(null)} onDone={toast.show} />}
      {toast.node}
    </main>
  );
}

// ------------------------------------------------------------------ actions

function ActionRow({ signal: s, today, onOpen, onDone }: { signal: Signal; today: string; onOpen: () => void; onDone: (m: string) => void }) {
  return (
    <div className="ci-act">
      <button type="button" className="ci-act-open" onClick={onOpen}>
        <Dot tone={s.applied ? "good" : s.status} />
        <span className="ci-act-main">
          <span className="ci-act-title">{s.title}</span>
          <span className="ci-act-msg">{withoutApplied(s.message)}</span>
        </span>
        <ChevronRight />
      </button>
      {(s.action || s.applied) && (
        <div className="ci-act-ctrl">
          {s.action && <ApplyButton action={s.action} signalId={s.id} today={today} onDone={onDone} />}
          {s.applied && <AppliedLine applied={s.applied} onDone={onDone} />}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ area tiles

function AreaTile({ area, report, data, today, onOpen }: { area: Area; report: WeeklyReport; data: CoachData; today: string; onOpen: () => void }) {
  const signals = report.signals.filter((s) => s.area === area);
  const status = worstStatus(signals);
  const t = tileFor(area, report, data, today);
  return (
    <button type="button" className="k-card ci-tile" data-status={status} onClick={onOpen} aria-label={`${AREA_NAME[area]}: ${t.value}${t.unit ? ` ${t.unit}` : ""}`}>
      <span className="ci-tile-head"><Dot tone={status} size={9} />{AREA_NAME[area]}</span>
      <span className="ci-tile-num">{t.value}{t.unit && <small>{t.unit}</small>}</span>
      <span className="ci-tile-foot">{t.foot}</span>
    </button>
  );
}

interface TileContent { value: string; unit?: string; foot: ReactNode }

const caption = (text: string) => <span className="ci-tile-cap">{text}</span>;

function Pips({ total, done, label }: { total: number; done: number; label: string }) {
  return (
    <span className="ci-pips" role="img" aria-label={label}>
      {Array.from({ length: Math.max(total, 1) }, (_, i) => <i key={i} className={i < done ? "on" : ""} />)}
    </span>
  );
}

function tileFor(area: Area, r: WeeklyReport, data: CoachData, today: string): TileContent {
  const n = r.numbers;
  switch (area) {
    case "consistency": {
      const { done, planned } = n.sessions;
      return { value: `${done}/${planned}`, unit: "sessions", foot: <Pips total={planned} done={done} label={`${done} of ${planned} sessions`} /> };
    }
    case "strength": {
      const sq = n.trainingMax.squat;
      const series = tmSeries(data, "squat", r.weekNo, today).map((p) => p.y);
      if (sq?.tm == null) return { value: "—", unit: "kg squat", foot: caption("Set in week 0") };
      return {
        value: fmtNum(sq.tm, 1), unit: "kg squat",
        foot: series.length > 1 ? <Sparkline data={series} color="var(--chart-1)" height={24} label="Squat training max by week" />
          : caption(sq.line != null ? `Plan line ${fmtNum(Math.round(sq.line / 2.5) * 2.5, 1)}` : "Training max")
      };
    }
    case "muscle": {
      const { done, planned } = n.workingSets;
      if (!planned) return { value: "—", unit: "% sets", foot: caption("No sets planned") };
      return { value: String(Math.round((done / planned) * 100)), unit: "% sets", foot: <Bar value={done / planned} color="var(--chart-1)" /> };
    }
    case "body": {
      const avg = n.bodyweight.avg7d;
      const series = weighIns(data, addDays(asOf(r, today), -27), asOf(r, today)).map((w) => w.kg);
      return {
        value: avg != null ? fmtNum(avg, 1) : "—", unit: "kg",
        foot: series.length > 1 ? <Sparkline data={series} color="var(--chart-1)" height={24} label="Weigh-ins, last 28 days" /> : caption("Weigh in daily")
      };
    }
    case "fuel": {
      const { avgKcal, targetKcal } = n.food;
      if (avgKcal == null) return { value: "—", unit: "kcal", foot: caption(n.food.daysLogged ? "Average after 3 full days" : "Log food daily") };
      const scale = (targetKcal ?? avgKcal) * 1.25;
      return {
        value: fmtNum(Math.round(avgKcal / 10) * 10, 0), unit: "kcal",
        foot: <Bar value={avgKcal / scale} marker={targetKcal ? targetKcal / scale : undefined} color="var(--chart-1)" />
      };
    }
    case "joints": {
      const total = n.pain.reduce((k, p) => k + p.sessions, 0);
      const sites = n.pain.filter((p) => p.sessions > 0).map((p) => `${shortSite(p.site)} ${p.sessions}`).join(" · ");
      return { value: String(total), unit: total === 1 ? "ache" : "aches", foot: caption(total ? sites : "No complaints") };
    }
    case "recovery": {
      if (n.energy.avg != null) return { value: fmtNum(n.energy.avg, 1), unit: "/5 energy", foot: <Bar value={n.energy.avg / 5} color="var(--chart-1)" /> };
      return { value: "—", unit: "/5 energy", foot: caption("Rate each session") };
    }
    case "conditioning": {
      const c = n.conditioning;
      return {
        value: c.boxing ? "✓" : "–", unit: "boxing",
        foot: caption(`${c.freeNotes ?? 0} free-day ${(c.freeNotes ?? 0) === 1 ? "note" : "notes"}`)
      };
    }
  }
}

const shortSite = (site: string) => site.replace(/^right_|^left_/, "").replace(/_/g, " ");

// ------------------------------------------------------------------ area sheet

function AreaSheet({ area, report, today, onClose, onDone }: { area: Area; report: WeeklyReport; today: string; onClose: () => void; onDone: (m: string) => void }) {
  const signals = report.signals.filter((s) => s.area === area);
  const info = report.staticInfo.filter((s) => s.area === area);
  return (
    <Sheet title={AREA_NAME[area]} onClose={onClose}>
      {area === "muscle" && report.numbers.muscles.length > 0 && <MuscleBars report={report} />}
      {signals.length ? signals.map((s) => <SignalBlock key={s.id} signal={s} today={today} onDone={onDone} />)
        : <p className="k-muted ci-sheet-empty">Nothing logged yet</p>}
      {info.map((s) => <SignalBlock key={s.id} signal={s} today={today} onDone={onDone} plain />)}
    </Sheet>
  );
}

function SignalBlock({ signal: s, today, onDone, plain = false }: { signal: Signal; today: string; onDone: (m: string) => void; plain?: boolean }) {
  return (
    <article className={`ci-sig${plain ? " is-plain" : ""}`}>
      <div className="ci-sig-head">
        {!plain && <Dot tone={s.applied ? "good" : s.status} />}
        <h3 className="ci-sig-title">{s.title}</h3>
        {s.metric && !plain && (
          <span className="ci-sig-metric k-num">{s.metric.value}{s.metric.target && <small> / {s.metric.target}</small>}</span>
        )}
      </div>
      <p className="ci-sig-msg">{withoutApplied(s.message)}</p>
      {s.id === "body.rate" && s.metric?.series && s.metric.series.length > 1 && (
        <Sparkline data={s.metric.series} color="var(--chart-1)" height={36} label="Weigh-ins in the rate window" />
      )}
      {s.action && <ApplyButton action={s.action} signalId={s.id} today={today} onDone={onDone} />}
      {s.applied && <AppliedLine applied={s.applied} onDone={onDone} />}
      {s.why.length > 0 && (
        <details className="ci-why">
          <summary>Why <ChevronDown style={{ width: 14, height: 14 }} /></summary>
          <ul>{s.why.map((id) => <li key={id}><b>{id}</b>{EVIDENCE[id]}</li>)}</ul>
        </details>
      )}
    </article>
  );
}

function MuscleBars({ report }: { report: WeeklyReport }) {
  return (
    <article className="ci-sig">
      <div className="ci-sig-head"><h3 className="ci-sig-title">Sets per muscle</h3><span className="ci-sig-metric k-num">{report.numbers.workingSets.done}<small> / {report.numbers.workingSets.planned}</small></span></div>
      <div className="ci-muscles">
        {report.numbers.muscles.map((m) => (
          <div key={m.key} className="ci-muscle">
            <span>{m.muscle}</span>
            <Bar value={m.plan ? m.sets / m.plan : 0} color="var(--chart-1)" />
            <span className="k-num">{fmtNum(m.sets, 1)}<small> / {fmtNum(m.plan, 1)}</small></span>
          </div>
        ))}
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ charts

/** The last day the report counts: Sunday, or today while the week runs. */
const asOf = (r: WeeklyReport, today: string) => (today < r.to ? today : r.to);

/** Weigh-ins (kg) between two dates, oldest first, history included. */
function weighIns(data: CoachData, from: string, to: string): { date: string; kg: number }[] {
  return data.allMeasurements
    .filter((m) => m.kind === "weight" && m.date >= from && m.date <= to)
    .map((m) => ({ date: m.date, kg: m.unit === "lb" ? Number(m.value) * 0.45359237 : Number(m.value) }));
}

/** Training max at the end of each plan week up to `uptoWeek` (or today while a week runs). */
function tmSeries(data: CoachData, lift: TmLiftKey, uptoWeek: number, today: string): Pt[] {
  const id = data.ids.get(lift);
  if (!id) return [];
  const rows = data.maxes.filter((m) => m.exercise_id === id && m.effective_date >= data.start);
  if (!rows.length) return [];
  return data.plan.weeks.filter((w) => w.weekNo <= uptoWeek && w.startDate <= today).flatMap((w) => {
    const end = addDays(w.startDate, 6);
    const at = end < today ? end : today;
    const row = rows.filter((m) => m.effective_date <= at).at(-1);
    return row ? [{ x: w.weekNo, y: Number(row.value_kg) }] : [];
  });
}

/** 28 days of bodyweight: the 7-day average as the area, weigh-ins faint, the plan's expected path as a band. */
function BodyCard({ report, data, today }: { report: WeeklyReport; data: CoachData; today: string }) {
  const end = asOf(report, today);
  const start = addDays(end, -27);
  const { avg, raw, band } = useMemo(() => {
    const all = weighIns(data, addDays(start, -6), end);
    const raw = all.filter((w) => w.date >= start);
    const avg = raw.map((w) => {
      const win = all.filter((q) => q.date <= w.date && daysBetween(q.date, w.date) < 7);
      return { x: daysBetween(start, w.date), y: win.reduce((s, q) => s + q.kg, 0) / win.length };
    });
    const band: { x: number; lo: number; hi: number }[] = [];
    const anchor = pathAnchor(data, end);
    for (let i = 0; i <= 27; i++) {
      const b = expectedBand(addDays(start, i), data.plan, anchor);
      if (b) band.push({ x: i, lo: b[0], hi: b[1] });
    }
    return { avg, raw: raw.map((w) => ({ x: daysBetween(start, w.date), y: w.kg })), band };
  }, [data, start, end]);
  const bw = report.numbers.bodyweight;
  const b = bw.band;

  return (
    <Card className="ci-chart">
      <div className="ci-chart-head">
        <Label>Bodyweight</Label>
        {b && <Pill tone="warm">Plan {fmtNum(b[0], 1)}–{fmtNum(b[1], 1)}</Pill>}
      </div>
      <div className="ci-chart-stat">
        <span className="ci-big">{bw.avg7d != null ? fmtNum(bw.avg7d, 1) : "—"}<small>kg</small></span>
        {bw.rate != null ? (
          <span className="ci-rate">
            <Delta value={bw.rate} unit=" kg" digits={2} />
            {bw.rateSe != null && <span className="ci-se k-num">± {fmtNum(bw.rateSe, 2)}</span>}
            <small>per week</small>
          </span>
        ) : bw.rateSkipped ? <Pill tone="plain">Rate skipped · {bw.rateSkipped}</Pill>
          : <span className="k-muted ci-cap">7-day average</span>}
      </div>
      <AreaChart
        label="Bodyweight, last 28 days, with the plan's expected range"
        height={190}
        series={[
          { label: "7-day average", points: avg, color: "var(--chart-1)", area: true },
          { label: "Weigh-ins", points: raw, color: "color-mix(in srgb, var(--chart-3) 45%, transparent)", hollow: () => true }
        ]}
        ribbons={band.length > 1 ? [{ points: band, label: "Plan" }] : []}
        formatX={(v) => fmtShortDate(addDays(start, Math.round(v)))}
        formatY={(v) => fmtNum(v, 1)}
      />
    </Card>
  );
}

/** Squat or deadlift training max by week against the plan line to the goal. */
function StrengthCard({ report, data, today }: { report: WeeklyReport; data: CoachData; today: string }) {
  const [lift, setLift] = useState<TmLiftKey>("squat");
  const tm = report.numbers.trainingMax[lift];
  const points = useMemo(() => tmSeries(data, lift, report.weekNo, today), [data, lift, report.weekNo, today]);
  const cal = tm?.calibration ?? null;
  const line = useMemo(() => (cal != null ? data.plan.weeks.map((w) => ({ x: w.weekNo, y: planLine(data.plan, lift, cal, w.weekNo) })) : []), [data.plan, lift, cal]);
  const goal = line.at(-1);
  const last = points.at(-1);

  return (
    <Card className="ci-chart">
      <div className="ci-chart-head">
        <Label>Training max</Label>
        <Segmented label="Lift" value={lift} onChange={setLift} options={[{ value: "squat", label: "Squat" }, { value: "deadlift", label: "Deadlift" }]} />
      </div>
      {tm?.tm != null && cal != null ? (
        <>
          <div className="ci-chart-stat">
            <span className="ci-big">{fmtNum(tm.tm, 1)}<small>kg</small></span>
            {tm.line != null && <span className="ci-rate"><Delta value={tm.tm - Math.round(tm.line / 2.5) * 2.5} unit=" kg" digits={1} /><small>vs plan line</small></span>}
            {tm.provisional && <Pill tone="plain">Provisional</Pill>}
          </div>
          <AreaChart
            label={`${lift === "squat" ? "Squat" : "Deadlift"} training max by week, with the plan line`}
            height={190}
            series={[
              { label: "Training max", points, color: "var(--chart-1)", area: true },
              { label: "Plan line", points: line, color: "var(--chart-3)", dashed: true }
            ]}
            markers={[
              ...(last ? [{ x: last.x, y: last.y, color: "var(--chart-1)", label: `TM ${fmtNum(last.y, 1)}` }] : []),
              ...(goal ? [{ x: goal.x, y: goal.y, color: "var(--warm)", label: `Goal TM ${fmtNum(goal.y, 1)}` }] : [])
            ]}
            formatX={(v) => `W${Math.round(v)}`}
            formatY={(v) => fmtNum(v, 1)}
          />
        </>
      ) : (
        <div className="k-empty ci-chart-empty">Set in week 0</div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ habit and small info

/** P-HABITS: weeks in a row at 4+ sessions (n/6), with the missed-twice and comeback lines. */
function HabitCard({ report }: { report: WeeklyReport }) {
  const h = report.numbers.habit;
  if (!h) return null;
  const missed = report.signals.find((s) => s.id === "consistency.missed_twice");
  const comeback = report.signals.find((s) => s.id === "consistency.comeback");
  return (
    <Card className="ci-habit" aria-label={`Habit: ${h.weeks} of ${h.target} weeks at 4+ sessions`}>
      <div className="ci-chart-head">
        <Label>Habit</Label>
        <span className="ci-habit-n k-num">{h.weeks}<small> / {h.target} weeks</small></span>
      </div>
      <div className="ci-meter" role="img" aria-label={`${h.weeks} of ${h.target}`}>
        {Array.from({ length: h.target }, (_, i) => <i key={i} className={i < h.weeks ? "on" : ""} />)}
      </div>
      <span className="ci-cap">{h.weeks >= h.target ? "Habit threshold reached" : "Weeks at 4+ sessions"}</span>
      {(missed || comeback) && (
        <div className="ci-habit-lines">
          {missed && <span className="ci-habit-line"><Dot tone="watch" />{missed.title}</span>}
          {comeback && <span className="ci-habit-line"><Dot tone="good" />{comeback.title}</span>}
        </div>
      )}
    </Card>
  );
}

/** Small facts for the week: progress photos, resting HR and HRV (info only). */
function InfoCard({ report }: { report: WeeklyReport }) {
  const n = report.numbers;
  const rows: { label: string; value: ReactNode; sub?: string }[] = [];
  const ph = n.photos;
  if (ph) {
    rows.push({
      label: "Progress photos",
      value: ph.photoWeek && ph.done ? <Pill tone="good"><CheckIcon /> Done</Pill>
        : ph.photoWeek && ph.next ? <Pill tone="warm">Due Thu {fmtShortDate(ph.next)}</Pill>
          : ph.next ? <span className="k-num">Thu {fmtShortDate(ph.next)}</span> : <span className="k-muted">—</span>,
      ...(ph.photoWeek ? {} : ph.next ? { sub: "Next photos" } : {})
    });
  }
  const hr = n.heart;
  if (hr?.restingHr7d != null) {
    rows.push({ label: "Resting HR", value: <span className="k-num">{fmtNum(hr.restingHr7d, 0)} bpm</span>, ...(hr.restingHr60d != null ? { sub: `60-day ${fmtNum(hr.restingHr60d, 0)}` } : {}) });
  }
  if (hr?.hrv7d != null) {
    rows.push({ label: "HRV", value: <span className="k-num">{fmtNum(hr.hrv7d, 0)} ms</span>, ...(hr.hrv60d != null ? { sub: `60-day ${fmtNum(hr.hrv60d, 0)}` } : {}) });
  }
  if (!rows.length) return null;
  return (
    <Card pad={false} className="ci-info k-rows" aria-label="This week's small numbers">
      {rows.map((r) => (
        <div key={r.label} className="k-row">
          <span className="k-row-main"><span>{r.label}</span>{r.sub && <span>{r.sub}</span>}</span>
          {r.value}
        </div>
      ))}
    </Card>
  );
}
