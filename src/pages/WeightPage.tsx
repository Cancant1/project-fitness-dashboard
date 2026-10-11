import { useCallback, useMemo, useState } from "react";
import { useRows, useStore } from "../data/store";
import { addDays, daysBetween, fmtNum, fmtShortDate, fmtShortDateYear, parseDecimal, todayIso } from "../lib/format";
import { adaptiveTdee, type Weigh } from "../lib/energy";
import { saveSleep, saveWaist } from "../coach";
import { AreaChart, Card, Delta, Label, PageHead, Pill, Segmented, Stat } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { CheckIcon, ChevronDown, ChevronRight } from "../ui/icons";
import { DateButton, useToast } from "./food/ui";
import "./weight.css";

/** 7-day trailing average for each date that has a weigh-in. */
export function rollingAverage(points: { date: string; value: number }[], days = 7) {
  return points.map((p) => {
    const window = points.filter((q) => q.date <= p.date && daysBetween(q.date, p.date) < days);
    return { date: p.date, value: window.reduce((s, q) => s + q.value, 0) / window.length };
  });
}

interface WeighIn { id: string; date: string; value: number }

const RANGES = [{ value: "90", label: "3 months" }, { value: "365", label: "1 year" }, { value: "0", label: "All" }] as const;
type Range = (typeof RANGES)[number]["value"];
const GOAL = { lo: 76, hi: 78 };
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

/** Weight: where is my weight going. One big number, one chart, the maintenance estimate. Past days can be filled in. */
export function WeightPage() {
  const { local } = useStore();
  const rows = useRows("body_measurements");
  const today = todayIso();
  const [range, setRange] = useState<Range>("90");
  const [open, setOpen] = useState<WeighIn | null>(null);
  const toast = useToast();
  const close = useCallback(() => setOpen(null), []);

  const weights = useMemo<WeighIn[]>(
    () => rows.filter((r) => r.kind === "weight").map((r) => ({ id: r.id, date: r.date, value: r.unit === "lb" ? r.value * 0.45359237 : Number(r.value) })).sort((a, b) => a.date.localeCompare(b.date)),
    [rows]
  );
  const avg = useMemo(() => rollingAverage(weights), [weights]);
  const latestAvg = avg[avg.length - 1];
  const last = weights[weights.length - 1];
  const recent = !!latestAvg && latestAvg.date >= addDays(today, -14);
  const twoWeeksAgo = latestAvg ? avg.filter((a) => a.date <= addDays(latestAvg.date, -14)).pop() : undefined;
  const ratePerWeek = latestAvg && twoWeeksAgo ? (latestAvg.value - twoWeeksAgo.value) / (daysBetween(twoWeeksAgo.date, latestAvg.date) / 7) : null;

  /** One weigh-in per date: saving onto a date that already has one updates that row. */
  async function save(date: string, value: number, current?: WeighIn) {
    if (date > today) return;
    const onDate = weights.find((w) => w.date === date);
    await local.save("body_measurements", { id: onDate?.id ?? current?.id, date, kind: "weight", value, unit: "kg", source: "app", note: null });
    if (current && onDate && onDate.id !== current.id) await local.remove("body_measurements", [current.id]);
  }

  function remove(w: WeighIn) {
    void local.remove("body_measurements", [w.id]);
    toast.show(`Removed ${fmtShortDate(w.date)}`, () => void local.save("body_measurements", { id: w.id, deleted_at: null }));
  }

  // Chart: 7-day average as the area, raw weigh-ins faint underneath.
  const from = range === "0" ? "0000" : addDays(today, -Number(range));
  const shownAvg = avg.filter((a) => a.date >= from);
  const shownRaw = weights.filter((w) => w.date >= from);
  const base = shownRaw[0]?.date ?? today;
  const x = (d: string) => daysBetween(base, d);
  const nearGoal = shownAvg.length > 0 && Math.abs(shownAvg[shownAvg.length - 1]!.value - (GOAL.lo + GOAL.hi) / 2) < 6;

  /** Tap on the chart: open the weigh-in nearest to that day. */
  function pick(p: { x: number }) {
    if (!shownRaw.length) return;
    setOpen(shownRaw.reduce((b, w) => (Math.abs(x(w.date) - p.x) < Math.abs(x(b.date) - p.x) ? w : b), shownRaw[0]!));
  }

  return (
    <main className="page weight">
      <PageHead title="Weight" />

      <div className="k-dash">
        <div className="k-col">
          <Card className="w-hero">
            <div className="w-hero-top">
              {recent && latestAvg ? (
                <Stat size="xl" value={fmtNum(latestAvg.value, 1)} unit="kg" label="7-day average" />
              ) : last ? (
                <Stat size="xl" value={fmtNum(last.value, 1)} unit="kg" label={`Last · ${fmtShortDateYear(last.date)}`} />
              ) : (
                <Stat size="xl" value="—" unit="kg" label="No weigh-ins yet" />
              )}
              <div className="w-hero-side">
                {recent && ratePerWeek != null && <span className="w-rate"><Delta value={ratePerWeek} unit=" kg" digits={2} /><small>per week</small></span>}
                <Pill tone="warm">Goal {GOAL.lo}–{GOAL.hi}</Pill>
              </div>
            </div>
            <WeighInput weights={weights} today={today} onSave={async (d, kg, sleep) => {
              if (kg != null) await save(d, kg);
              if (sleep != null) await saveSleep(local, d, sleep);
              if (kg == null && sleep != null) toast.show(`Sleep saved · ${fmtShortDate(d)}`);
            }} />
          </Card>

          <Card className="w-chart">
            <div className="w-chart-head">
              <Label>Trend</Label>
              <Segmented label="Range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            </div>
            <div className="w-chart-tap">
              <AreaChart
                label="Bodyweight, 7-day average"
                height={260}
                series={[
                  { label: "7-day average", points: shownAvg.map((a) => ({ x: x(a.date), y: a.value })), color: "var(--chart-1)", area: true },
                  {
                    label: "Weigh-ins", points: shownRaw.map((w) => ({ x: x(w.date), y: w.value })),
                    color: "color-mix(in srgb, var(--chart-3) 45%, transparent)", hollow: range === "0" ? undefined : () => true
                  }
                ]}
                yBands={nearGoal ? [{ from: GOAL.lo, to: GOAL.hi, label: `Goal ${GOAL.lo}–${GOAL.hi}` }] : []}
                onPick={pick}
                formatX={(v) => { const d = addDays(base, Math.round(v)); return range === "90" ? fmtShortDate(d) : monthYear.format(new Date(d + "T12:00:00")); }}
                formatY={(v) => fmtNum(v, 1)}
              />
            </div>
          </Card>
        </div>

        <div className="k-col">
          <WaistCard today={today} />
          <TdeeCard weights={weights.map((w) => ({ date: w.date, kg: w.value }))} />
          <AllWeighIns weights={weights} onOpen={setOpen} />
        </div>
      </div>

      {open && (
        <WeighSheet key={open.id} entry={open} today={today} onClose={close}
          onSave={(d, v) => void save(d, v, open)} onRemove={() => remove(open)} />
      )}
      {toast.node}
    </main>
  );
}

/** Compact weigh-in: date pill (default today, never in the future), kg field, optional hours slept, save. */
function WeighInput({ weights, today, onSave }: { weights: WeighIn[]; today: string; onSave: (date: string, kg: number | null, sleepHours: number | null) => Promise<void> }) {
  const health = useRows("health_daily");
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const [sleep, setSleep] = useState("");
  const existing = weights.find((w) => w.date === date);
  const slept = health.find((h) => h.date === date)?.sleep_total_min;
  async function save() {
    const v = parseDecimal(text);
    const h = parseDecimal(sleep);
    const kg = v != null && v >= 30 && v <= 250 ? Math.round(v * 100) / 100 : null;
    const hours = h != null && h > 0 && h <= 16 ? h : null;
    if ((kg == null && hours == null) || date > today) return;
    await onSave(date, kg, hours);
    setText("");
    setSleep("");
  }
  return (
    <div className="w-input">
      <DateButton value={date} max={today} onChange={setDate} label="Weigh-in date">{date === today ? "Today" : fmtShortDate(date)}<ChevronDown size={14} /></DateButton>
      <label className="field">
        <span className="sr-only">Weight in kg</span>
        <input inputMode="decimal" className="num" placeholder={existing ? fmtNum(existing.value, 1).replace(".", ",") : "kg"}
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
        <span className="field-suffix">kg</span>
      </label>
      <label className="field">
        <span className="sr-only">Hours slept the night before (optional)</span>
        <input inputMode="decimal" className="num" placeholder={slept ? fmtNum(slept / 60, 1).replace(".", ",") : "Slept"}
          value={sleep} onChange={(e) => setSleep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
        <span className="field-suffix">h</span>
      </label>
      <button className="btn btn-primary btn-icon" aria-label="Save weight and sleep" onClick={() => void save()}><CheckIcon /></button>
    </div>
  );
}

/** Waist at the navel every 2 weeks: the last value, its change, and a date + cm entry. */
function WaistCard({ today }: { today: string }) {
  const { local } = useStore();
  const rows = useRows("body_measurements");
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const waists = useMemo(
    () => rows.filter((r) => r.kind === "waist").map((r) => ({ date: r.date, cm: r.unit === "in" ? Number(r.value) * 2.54 : Number(r.value) })).sort((a, b) => a.date.localeCompare(b.date)),
    [rows]
  );
  const last = waists[waists.length - 1];
  const prev = waists[waists.length - 2];
  const onDate = waists.find((w) => w.date === date);
  async function save() {
    const v = parseDecimal(text);
    if (v == null || v < 40 || v > 200 || date > today) return;
    await saveWaist(local, date, Math.round(v * 10) / 10);
    setText("");
  }
  return (
    <Card className="w-waist">
      <div className="w-chart-head">
        <Label>Waist</Label>
        {last && <span className="k-muted w-waist-date">{fmtShortDate(last.date)}</span>}
      </div>
      <div className="w-waist-top">
        <Stat size="md" value={last ? fmtNum(last.cm, 1) : "—"} unit="cm" />
        {last && prev && (
          // Neutral on purpose: a rising waist is not "good" the way a rising lift is.
          <span className="w-rate"><span className="k-delta">{signedCm(last.cm - prev.cm)}</span><small>since {fmtShortDate(prev.date)}</small></span>
        )}
      </div>
      <div className="w-input w-input-waist">
        <DateButton value={date} max={today} onChange={setDate} label="Waist date">{date === today ? "Today" : fmtShortDate(date)}<ChevronDown size={14} /></DateButton>
        <label className="field">
          <span className="sr-only">Waist at the navel in cm</span>
          <input inputMode="decimal" className="num" placeholder={onDate ? fmtNum(onDate.cm, 1).replace(".", ",") : "At the navel"}
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
          <span className="field-suffix">cm</span>
        </label>
        <button className="btn btn-tinted btn-icon" aria-label="Save waist" onClick={() => void save()}><CheckIcon /></button>
      </div>
    </Card>
  );
}

/** Edit or remove one weigh-in. */
function WeighSheet({ entry, today, onSave, onRemove, onClose }: {
  entry: WeighIn; today: string; onSave: (date: string, value: number) => void; onRemove: () => void; onClose: () => void;
}) {
  const [date, setDate] = useState(entry.date);
  const [text, setText] = useState(fmtNum(entry.value, 2).replace(".", ","));
  const v = parseDecimal(text);
  const ok = v != null && v >= 30 && v <= 250 && date <= today;
  return (
    <Sheet title="Weigh-in" onClose={onClose}>
      <div className="w-sheet">
        <DateButton value={date} max={today} onChange={setDate} label="Date">{fmtShortDateYear(date)}<ChevronDown size={14} /></DateButton>
        <label className="field w-sheet-field">
          <span className="sr-only">Weight in kg</span>
          <input inputMode="decimal" className="num" value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
          <span className="field-suffix">kg</span>
        </label>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-glass" style={{ color: "var(--bad)" }} onClick={() => { onRemove(); onClose(); }}>Remove</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={!ok} onClick={() => { if (ok) { onSave(date, Math.round(v! * 100) / 100); onClose(); } }}>Save</button>
      </div>
    </Sheet>
  );
}

function AllWeighIns({ weights, onOpen }: { weights: WeighIn[]; onOpen: (w: WeighIn) => void }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => [...weights].reverse(), [weights]);
  return (
    <Card pad={false} className="w-all">
      <button className="w-all-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>All weigh-ins</span>
        <span className="k-num k-muted">{weights.length}</span>
        <ChevronDown className="w-all-chev" />
      </button>
      {open && (
        <div className="k-rows w-all-rows">
          {list.slice(0, limit).map((w, i) => {
            const prev = list[i + 1];
            return (
              <button key={w.id} className="k-row w-all-row" onClick={() => onOpen(w)}>
                <span>{fmtShortDateYear(w.date)}</span>
                <span className="w-all-val">
                  {prev && <Delta value={w.value - prev.value} digits={1} />}
                  <span className="k-num">{fmtNum(w.value, 1)}</span>
                  <ChevronRight style={{ color: "var(--fg2)" }} />
                </span>
              </button>
            );
          })}
          {list.length > limit && <button className="k-row w-more" onClick={() => setLimit(limit + 120)}>Show more</button>}
        </div>
      )}
    </Card>
  );
}

const signedCm = (d: number) => `${d > 0.04 ? "+" : d < -0.04 ? "−" : "±"}${fmtNum(Math.abs(d), 1)} cm`;

const WINDOWS = [14, 28, 42, 56] as const;

/** Maintenance estimated from what you logged and how your weight moved. */
function TdeeCard({ weights }: { weights: Weigh[] }) {
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const [win, setWin] = useState<`${(typeof WINDOWS)[number]}`>("28");

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
  const result = asOf ? adaptiveTdee(intake, weights, asOf, Number(win)) : null;

  return (
    <Card className="w-tdee">
      <div className="w-chart-head">
        <Label>Maintenance</Label>
        <Segmented label="Window" value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: `${w}` as const, label: `${w} d` }))} />
      </div>
      {result ? (
        <>
          <Stat size="lg" value={fmtNum(result.tdee, 0)} unit="kcal" sub={`${fmtShortDate(result.from)} – ${fmtShortDate(result.to)}`} />
          <div className="k-grid-2">
            <Stat size="sm" label="Ate" value={fmtNum(result.avgIntake, 0)} unit="kcal" />
            <Stat size="sm" label="Trend" value={`${result.weightChangeKg >= 0 ? "+" : ""}${fmtNum(result.weightChangeKg, 2)}`} unit="kg" />
          </div>
          <details className="w-how">
            <summary>How it works</summary>
            <p>Average intake on {result.intakeDays} logged days, minus the weight trend ({result.weighIns} weigh-ins) × 7,700 kcal per kg, per day.</p>
          </details>
        </>
      ) : (
        <Stat size="md" value="—" sub={win !== "56" ? "Not enough data · try longer" : "Not enough data"} />
      )}
    </Card>
  );
}
