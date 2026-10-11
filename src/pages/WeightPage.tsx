import { useMemo, useState } from "react";
import { useRows, useStore } from "../data/store";
import { addDays, daysBetween, fmtNum, fmtShortDate, fmtShortDateYear, parseDecimal, todayIso } from "../lib/format";
import { LineChart } from "../ui/LineChart";
import { adaptiveTdee, type Weigh } from "../lib/energy";
import { CheckIcon } from "../ui/icons";

/** 7-day trailing average for each date that has a weigh-in. */
export function rollingAverage(points: { date: string; value: number }[], days = 7) {
  return points.map((p) => {
    const window = points.filter((q) => q.date <= p.date && daysBetween(q.date, p.date) < days);
    return { date: p.date, value: window.reduce((s, q) => s + q.value, 0) / window.length };
  });
}

export function WeightPage() {
  const { local } = useStore();
  const rows = useRows("body_measurements");
  const today = todayIso();
  const [text, setText] = useState("");
  const [range, setRange] = useState<90 | 365 | 0>(90);

  const weights = useMemo(
    () => rows.filter((r) => r.kind === "weight").map((r) => ({ id: r.id, date: r.date, value: r.unit === "lb" ? r.value * 0.45359237 : r.value })).sort((a, b) => a.date.localeCompare(b.date)),
    [rows]
  );
  const todays = weights.find((w) => w.date === today);
  const avg = useMemo(() => rollingAverage(weights), [weights]);
  const latestAvg = avg[avg.length - 1];
  const twoWeeksAgo = latestAvg ? avg.filter((a) => a.date <= addDays(latestAvg.date, -14)).pop() : undefined;
  const ratePerWeek = latestAvg && twoWeeksAgo ? (latestAvg.value - twoWeeksAgo.value) / (daysBetween(twoWeeksAgo.date, latestAvg.date) / 7) : null;

  const from = range ? addDays(today, -range) : "0000";
  const shown = avg.filter((a) => a.date >= from);
  const raw = weights.filter((w) => w.date >= from);
  const x = (d: string) => daysBetween(shown[0]?.date ?? today, d);

  async function save() {
    const value = parseDecimal(text);
    if (value == null || value < 30 || value > 250) return;
    await local.save("body_measurements", { id: todays?.id, date: today, kind: "weight", value, unit: "kg", source: "app", note: null });
    setText("");
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Morning weigh-in · 7-day average counts</p>
          <h1 className="large-title">Weight</h1>
        </div>
      </header>

      <section className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label htmlFor="w-today" style={{ flex: 1 }}>{todays ? `Today: ${fmtNum(todays.value, 1)} kg` : "Today"}</label>
        <div className="field" style={{ width: 120 }}>
          <input id="w-today" inputMode="decimal" placeholder={todays ? fmtNum(todays.value, 1).replace(".", ",") : "74,2"}
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()}
            className="num" style={{ textAlign: "right", fontWeight: 600 }} />
          <span className="field-suffix">kg</span>
        </div>
        <button className="btn btn-tinted btn-icon" aria-label="Save weight" onClick={() => void save()} style={{ borderRadius: 14 }}><CheckIcon /></button>
      </section>

      <section className="card stat-strip">
        <div className="stat">
          <span className="row-sub">7-day average</span>
          <span className="stat-value">{latestAvg ? fmtNum(latestAvg.value, 1) : "—"}<small> kg</small></span>
          <span className="row-sub">{latestAvg ? `as of ${fmtShortDate(latestAvg.date)}` : "No weigh-ins yet"}</span>
        </div>
        <div className="stat">
          <span className="row-sub">Rate, last 2 weeks</span>
          <span className="stat-value">{ratePerWeek == null ? "—" : `${ratePerWeek >= 0 ? "+" : ""}${fmtNum(ratePerWeek, 2)}`}<small> kg/wk</small></span>
          <span className="row-sub">Plan: +0.10 to +0.25</span>
        </div>
        <div className="stat">
          <span className="row-sub">Weigh-ins</span>
          <span className="stat-value">{weights.length}</span>
          <span className="row-sub">{weights[0] ? `since ${fmtShortDateYear(weights[0].date)}` : ""}</span>
        </div>
      </section>

      <TdeeCard weights={weights.map((w) => ({ date: w.date, kg: w.value }))} />

      <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>Trend</h2>
          <div className="segmented" role="group" aria-label="Range">
            {([90, 365, 0] as const).map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === 90 ? "90 days" : r === 365 ? "Year" : "All"}</button>
            ))}
          </div>
        </div>
        <LineChart
          label="Bodyweight, 7-day average"
          series={[
            { points: raw.map((w) => ({ x: x(w.date), y: w.value })), color: "var(--fg2)", dots: true, dashed: true },
            { points: shown.map((a) => ({ x: x(a.date), y: a.value })), area: true }
          ]}
          xLabels={shown.length ? [{ x: 0, label: fmtShortDate(shown[0]!.date) }, { x: x(shown[shown.length - 1]!.date), label: fmtShortDate(shown[shown.length - 1]!.date) }] : []}
        />
      </section>

      <section className="section">
        <h2 className="section-label">Recent</h2>
        <div className="list">
          {weights.slice(-10).reverse().map((w) => (
            <div className="row" key={w.id}><span>{fmtShortDateYear(w.date)}</span><span className="num" style={{ fontWeight: 600 }}>{fmtNum(w.value, 1)} kg</span></div>
          ))}
          {!weights.length && <div className="row muted">Your morning weigh-ins appear here.</div>}
        </div>
      </section>
    </main>
  );
}

const WINDOWS = [14, 28, 42, 56] as const;

/** Maintenance estimated from what you logged and how your weight moved. */
function TdeeCard({ weights }: { weights: Weigh[] }) {
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(28);

  const intake = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const e of entries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.kcal);
    for (const d of days) if (!byDate.has(d.date) && d.kcal != null) byDate.set(d.date, d.kcal);
    return [...byDate].map(([date, kcal]) => ({ date, kcal }));
  }, [entries, days]);

  // The window ends where both food and weigh-ins still exist.
  const lastIntake = intake.reduce((d, x) => (x.date > d ? x.date : d), "");
  const lastWeigh = weights.reduce((d, x) => (x.date > d ? x.date : d), "");
  const asOf = lastIntake && lastWeigh ? (lastIntake < lastWeigh ? lastIntake : lastWeigh) : "";
  const result = asOf ? adaptiveTdee(intake, weights, asOf, win) : null;

  return (
    <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>Maintenance estimate</h2>
        <div className="segmented" role="group" aria-label="Window">
          {WINDOWS.map((w) => <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>{w} d</button>)}
        </div>
      </div>
      {result ? (
        <>
          <span className="stat-value">{fmtNum(result.tdee, 0)}<small> kcal/day</small></span>
          <p className="row-sub" style={{ fontSize: 15 }}>
            {fmtShortDate(result.from)} – {fmtShortDate(result.to)}: you ate {fmtNum(result.avgIntake, 0)} kcal on average ({result.intakeDays} logged days)
            and your weight trend ({result.weighIns} weigh-ins) moved {result.weightChangeKg >= 0 ? "+" : ""}{fmtNum(result.weightChangeKg, 2)} kg.
            Maintenance = intake − weight change × 7,700 kcal ÷ days.
          </p>
        </>
      ) : (
        <p className="row-sub" style={{ fontSize: 15 }}>
          Needs food logged on at least half of the {win} days and 4+ weigh-ins spread over the window.{win < 56 ? " Try a longer window." : " It fills in once you log food and weigh in most days."}
          {lastIntake ? ` Food was last logged on ${fmtShortDateYear(lastIntake)}.` : ""}
        </p>
      )}
    </section>
  );
}
