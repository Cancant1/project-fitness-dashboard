import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { detectPRs, repBests, sessionBests, type PrEvent, type SessionBest } from "../lib/analysis";
import { addDays, daysBetween, fmtNum, fmtShortDate, todayIso } from "../lib/format";
import { PLAN } from "../plan/bridge";
import { ChevronRight, RecordsIcon } from "../ui/icons";
import { Card, Label, PageHead, Pill, Stat } from "../ui/kit";
import { RepCurve, YearBars } from "./progress/charts";
import { LIFTS, useTraining, type LiftDef, type TrainingIndex } from "./progress/data";
import { fmtLiftSet, fmtMetric, fmtMonthYear, fmtWhen, metricFor, metricName } from "./progress/format";
import "./progress/progress.css";

/** Records: a hall of fame. Trophy per main lift, the sheet's lifetime bests, recent PRs, then every exercise. */
export function RecordsPage() {
  const idx = useTraining();
  const today = todayIso();

  return (
    <main className="page pg rec">
      <PageHead eyebrow="Hall of fame" title="Records" />

      <div className="rec-trophies">
        {LIFTS.map((lift) => <Trophy key={lift.key} lift={lift} idx={idx} />)}
      </div>

      <div className="k-dash">
        <div className="k-col">
          <RecentPRs idx={idx} today={today} />
        </div>
        <div className="k-col">
          <SheetBests idx={idx} />
          <AllExercises idx={idx} />
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ trophies

function Trophy({ lift, idx }: { lift: LiftDef; idx: TrainingIndex }) {
  const id = idx.ids.get(lift.key);
  const sets = useMemo(() => (id ? idx.byExercise.get(id) ?? [] : []), [idx, id]);
  const data = useMemo(() => {
    const bests = sessionBests(sets, lift.metric);
    const top = bests.reduce<SessionBest | null>((a, b) => (!a || b.value > a.value ? b : a), null);
    return { bests, top, heaviest: repBests(sets, [1], "atLeast").get(1) ?? null };
  }, [sets, lift.metric]);
  const added = lift.metric === "added5";
  const top = data.top;
  const fmtSet = (s: Parameters<typeof fmtLiftSet>[0]) => fmtLiftSet(s, lift.metric);

  return (
    <Card className="rec-trophy">
      <div className="rec-trophy-head">
        <span className="rec-trophy-name">{lift.label}</span>
        {id && <Link to={`/exercise/${id}`} className="rec-link">All sets <ChevronRight /></Link>}
      </div>
      {top ? (
        <>
          <div className="rec-trophy-main">
            <Stat size="xl" tone="warm" value={fmtMetric(top.value, lift.metric)} unit={added && top.value === 0 ? undefined : "kg"}
              sub={<>{metricName(lift.metric)}{lift.key === "incline_db_press" ? " per hand" : ""} · <span className="k-num">{fmtSet(top.set)}</span></>} />
            <span className="rec-when">{fmtWhen(top.date, top.confidence)}</span>
          </div>
          {data.heaviest && (
            <div className="rec-heaviest">
              <Pill>Heaviest <b className="k-num">{fmtSet(data.heaviest)}</b></Pill>
              <span className="rec-when">{fmtWhen(data.heaviest.date, data.heaviest.confidence)}</span>
            </div>
          )}
          <div className="rec-trophy-charts">
            <RepCurve sets={sets} metric={lift.metric} caption="Rep maxes" height={110} />
            <YearBars bests={data.bests} metric={lift.metric} caption="Best per year" height={110} />
          </div>
        </>
      ) : (
        <p className="k-empty rec-none">Not logged yet</p>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ lifetime bests from the sheet

const SHORT: Record<string, string> = { "Incline DB Press": "Incline DB", "Weighted Pull-up": "Pull-up" };
const ORDER = ["Squat", "Deadlift", "Incline DB", "Pull-up"];
const rank = (name: string | null) => { const i = ORDER.indexOf(name ?? ""); return i < 0 ? ORDER.length : i; };

function SheetBests({ idx }: { idx: TrainingIndex }) {
  const { local } = useStore();
  const facts = useRows("facts");
  const list = useMemo(() => facts.filter((f) => f.kind === "lifetime_pr" && f.user_id === local.userId).map((f) => {
    const v = (f.value ?? {}) as { exercise?: string; exercise_id?: string; load_kg?: number; reps?: number; note?: string };
    const added = /added/i.test(v.note ?? "") || /pull-?up|chin/i.test(v.exercise ?? "");
    const name = v.exercise ? SHORT[v.exercise] ?? v.exercise : null;
    const value = v.load_kg != null && v.reps != null ? `${added ? "+" : ""}${fmtNum(v.load_kg)} × ${v.reps}` : null;
    return { id: f.id, name, value, load: v.load_kg ?? 0, title: f.title, exerciseId: v.exercise_id && idx.exerciseById.has(v.exercise_id) ? v.exercise_id : null };
  }).sort((a, b) => rank(a.name) - rank(b.name) || (a.name ?? a.title).localeCompare(b.name ?? b.title) || b.load - a.load), [facts, local.userId, idx]);

  if (!list.length) return null;
  return (
    <section>
      <Label>From your sheet</Label>
      <div className="rec-chips">
        {list.map((c) => {
          const body = (
            <>
              <RecordsIcon size={18} className="rec-chip-icon" />
              <span className="rec-chip-text">
                <span className="k-muted">{c.name ?? "Lifetime best"}</span>
                <b className="k-num">{c.value ?? c.title}</b>
              </span>
            </>
          );
          return c.exerciseId
            ? <Link key={c.id} to={`/exercise/${c.exerciseId}`} className="rec-chip" title={c.title}>{body}</Link>
            : <div key={c.id} className="rec-chip" title={c.title}>{body}</div>;
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ recent PRs

function RecentPRs({ idx, today }: { idx: TrainingIndex; today: string }) {
  const [all, setAll] = useState(false);
  const events = useMemo(() => detectPRs(idx.work).filter((e) => e.date >= addDays(today, -90)), [idx, today]);
  const shown = all ? events : events.slice(0, 6);
  const until = daysBetween(today, PLAN.startDate);

  return (
    <section>
      <Label action={events.length > 6 && !all ? <button type="button" onClick={() => setAll(true)}>Show all {events.length}</button> : undefined}>
        Recent PRs · 90 days
      </Label>
      {events.length ? (
        <Card className="rec-timeline">
          <ol>
            {shown.map((e) => <PrItem key={`${e.exerciseId}-${e.sessionId}`} e={e} name={idx.exerciseById.get(e.exerciseId)?.name ?? "Exercise"}
              added={e.exerciseId === idx.ids.get("weighted_pullup") || e.set.unit === "bodyweight"} />)}
          </ol>
        </Card>
      ) : (
        <Card className="rec-empty">
          <span className="rec-empty-ring" aria-hidden="true"><RecordsIcon size={26} /></span>
          <span className="rec-empty-text">
            <b>No PRs yet this block</b>
            <span className="k-muted">
              {until > 0 ? `Week 0 starts ${until === 1 ? "tomorrow" : `in ${until} days`}` : "Next one lands here"}
            </span>
          </span>
        </Card>
      )}
    </section>
  );
}

function PrItem({ e, name, added }: { e: PrEvent; name: string; added: boolean }) {
  const gain = e.value - e.previous;
  const fmtSet = (s: Parameters<typeof fmtLiftSet>[0]) => fmtLiftSet(s, added ? "added5" : "e1rm");
  return (
    <li className={`rec-pr ${e.kind}`}>
      <Link to={`/session/${e.sessionId}`}>
        <i className={`rec-pr-dot ${e.confidence === "estimated" ? "est" : ""}`} aria-hidden="true" />
        <span className="k-row-main">
          <span>{name}</span>
          <span>{e.kind === "e1rm" ? <>e1RM <b className="k-num">{fmtNum(e.value, 0)}</b> · {fmtSet(e.set)}</> : <><b className="k-num">{fmtSet(e.set)}</b> · {e.reps}+ reps</>}</span>
        </span>
        <span className="rec-pr-side">
          <span className="k-delta up">▲ {fmtNum(gain, 1)}</span>
          <span className="k-muted">{e.confidence === "estimated" ? `${fmtMonthYear(e.date)} est.` : fmtShortDate(e.date)}</span>
        </span>
      </Link>
    </li>
  );
}

// ------------------------------------------------------------------ all exercises

function AllExercises({ idx }: { idx: TrainingIndex }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const pullupId = idx.ids.get("weighted_pullup");
  const rows = useMemo(() => idx.exercises.filter((e) => !e.archived).map((e) => {
    const sets = idx.byExercise.get(e.id) ?? [];
    const metric = metricFor(sets, e.id === pullupId);
    const best = sessionBests(sets, metric).reduce<number | null>((m, b) => (m == null || b.value > m ? b.value : m), null);
    return { e, metric, best, last: sets.at(-1) ?? null };
  }).sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? "") || a.e.name.localeCompare(b.e.name)), [idx, pullupId]);

  const q = query.trim().toLowerCase();
  const found = q ? rows.filter((r) => `${r.e.name} ${r.e.aliases.join(" ")} ${r.e.muscle_direct ?? ""}`.toLowerCase().includes(q)) : rows;
  const shown = all || q ? found : found.slice(0, 10);

  return (
    <section>
      <Label action={!all && !q && found.length > 10 ? <button type="button" onClick={() => setAll(true)}>Show all {found.length}</button> : undefined}>
        All exercises
      </Label>
      <Card pad={false} className="rec-list">
        <label className="field rec-search">
          <span className="sr-only">Search exercises</span>
          <input placeholder="Search" value={query} onChange={(ev) => setQuery(ev.target.value)} />
        </label>
        <div className="k-rows">
          {shown.map(({ e, metric, best, last }) => (
            <Link key={e.id} to={`/exercise/${e.id}`} className="k-row rec-row">
              <span className="k-row-main">
                <span>{e.name}</span>
                <span>{last ? fmtWhen(last.date, last.confidence) : "Not logged"}</span>
              </span>
              <span className="rec-row-side">
                {best != null && <span className="k-num">{fmtMetric(best, metric)}{metric === "added5" && best === 0 ? "" : <small> kg</small>}</span>}
                <ChevronRight />
              </span>
            </Link>
          ))}
          {!shown.length && <div className="k-row k-muted">No match</div>}
        </div>
      </Card>
    </section>
  );
}
