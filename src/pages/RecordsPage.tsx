import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { detectPRs, repBests, sessionBests, type WorkSet } from "../lib/analysis";
import { addDays, fmtNum, todayIso } from "../lib/format";
import { ChevronRight } from "../ui/icons";
import { LIFTS, useTraining, type LiftDef, type TrainingIndex } from "./progress/data";
import { fmtKg, fmtSet, fmtWhen } from "./progress/ui";

const REP_COUNTS = [1, 3, 5, 8, 10] as const;

export function RecordsPage() {
  const idx = useTraining();
  const { local } = useStore();
  const facts = useRows("facts");
  const today = todayIso();
  const [query, setQuery] = useState("");

  const lifetime = useMemo(() => facts.filter((f) => f.kind === "lifetime_pr" && f.user_id === local.userId)
    .sort((a, b) => a.title.localeCompare(b.title)), [facts, local.userId]);

  const recent = useMemo(() => {
    const from = addDays(today, -90);
    return detectPRs(idx.work).filter((e) => e.date >= from);
  }, [idx, today]);

  const all = useMemo(() => {
    return idx.exercises.filter((e) => !e.archived).map((e) => {
      const sets = idx.byExercise.get(e.id) ?? [];
      const best = sessionBests(sets).reduce<number | null>((m, b) => (m == null || b.value > m ? b.value : m), null);
      const last = sets.at(-1);
      return { e, best, sets: sets.length, last };
    }).sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? "") || a.e.name.localeCompare(b.e.name));
  }, [idx]);

  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((r) => `${r.e.name} ${r.e.aliases.join(" ")} ${r.e.muscle_direct ?? ""}`.toLowerCase().includes(q)) : all;
  const names = idx.exerciseById;

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Flagged sets left out of every best</p>
          <h1 className="large-title">Records</h1>
        </div>
      </header>

      {lifetime.length > 0 && (
        <section className="section">
          <h2 className="section-label">Lifetime bests, as written in your sheet</h2>
          <div className="list">
            {lifetime.map((f) => {
              const v = (f.value ?? {}) as { as_logged?: string; note?: string; exercise_id?: string };
              const ex = v.exercise_id && names.has(v.exercise_id) ? v.exercise_id : null;
              const body = (
                <>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{f.title}</span>
                    <span className="row-sub">{[v.as_logged ? `“${v.as_logged}”` : null, v.note].filter(Boolean).join(" · ")}</span>
                  </span>
                  {ex && <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />}
                </>
              );
              return ex
                ? <Link key={f.id} to={`/exercise/${ex}`} className="row" style={{ color: "var(--fg)", padding: "8px 0" }}>{body}</Link>
                : <div key={f.id} className="row" style={{ padding: "8px 0" }}>{body}</div>;
            })}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-label">From your logs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(330px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
          {LIFTS.map((lift) => <LiftRecords key={lift.key} lift={lift} idx={idx} />)}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">Recent PRs · last 90 days</h2>
        <div className="list">
          {recent.map((e) => (
            <Link key={`${e.exerciseId}-${e.sessionId}`} to={`/session/${e.sessionId}`} className="row" style={{ color: "var(--fg)", padding: "8px 0" }}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{names.get(e.exerciseId)?.name ?? "Exercise"}</span>
                <span className="row-sub">
                  {e.kind === "e1rm"
                    ? <>Best e1RM <span className="num" style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtKg(e.value)}</span> (was {fmtKg(e.previous)}) · {fmtSet(e.set)}</>
                    : <>Heaviest for {e.reps}+ reps: <span className="num" style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtSet(e.set)}</span> (was {fmtNum(e.previous)})</>}
                </span>
              </span>
              <span className="row-sub" style={{ flex: "none", textAlign: "right" }}>{fmtWhen(e.date, e.confidence)}</span>
            </Link>
          ))}
          {!recent.length && <div className="row muted">No new bests in the last 90 days. They show up here as soon as you beat one.</div>}
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">All exercises</h2>
        <label className="field" htmlFor="r-q">
          <span className="sr-only">Search exercises</span>
          <input id="r-q" placeholder="Search exercise or muscle" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="list">
          {shown.map(({ e, best, sets, last }) => (
            <Link key={e.id} to={`/exercise/${e.id}`} className="row" style={{ color: "var(--fg)", padding: "8px 0" }}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{e.name}</span>
                <span className="row-sub">
                  {sets ? <>{best != null ? <>best e1RM <span className="num">{fmtKg(best)}</span> · </> : null}last {fmtWhen(last!.date, last!.confidence)} · {sets} sets</> : "Not logged yet"}
                </span>
              </span>
              <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />
            </Link>
          ))}
          {!shown.length && <div className="row muted">No exercise matches “{query}”.</div>}
        </div>
      </section>
    </main>
  );
}

function LiftRecords({ lift, idx }: { lift: LiftDef; idx: TrainingIndex }) {
  const id = idx.ids.get(lift.key);
  const data = useMemo(() => {
    const sets = id ? idx.byExercise.get(id) ?? [] : [];
    const bests = sessionBests(sets, lift.metric);
    const top = bests.reduce<(typeof bests)[number] | null>((a, b) => (!a || b.value > a.value ? b : a), null);
    return { top, reps: repBests(sets, REP_COUNTS, "atLeast") };
  }, [idx, id, lift]);
  const added = lift.metric === "added5";

  return (
    <div className="section" style={{ minWidth: 0 }}>
      <div className="section-row">
        <h3 style={{ fontSize: 17, fontWeight: 600 }}>{lift.label}</h3>
        {id && <Link to={`/exercise/${id}`} style={{ fontSize: 13, fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}>All sets</Link>}
      </div>
      <div className="list">
        <RecordRow label={added ? "Heaviest added, 5+ reps" : `Best e1RM${lift.key === "incline_db_press" ? " per hand" : ""}`}
          value={data.top ? `${added && data.top.value > 0 ? "+" : ""}${fmtKg(data.top.value)} kg` : "—"} set={data.top?.set} />
        {REP_COUNTS.map((r) => {
          const s = data.reps.get(r);
          return <RecordRow key={r} label={r === 1 ? "Heaviest set" : `Heaviest for ${r}+ reps`} value={s ? fmtSet(s) : "—"} set={s} />;
        })}
      </div>
    </div>
  );
}

function RecordRow({ label, value, set }: { label: string; value: string; set: WorkSet | undefined }) {
  const body = (
    <>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span>{label}</span>
        {set && <span className="row-sub">{fmtWhen(set.date, set.confidence)}{label.startsWith("Best") || label.startsWith("Heaviest added") ? ` · ${fmtSet(set)}` : ""}</span>}
      </span>
      <span className="num" style={{ fontWeight: 600, flex: "none" }}>{value}</span>
    </>
  );
  return set
    ? <Link to={`/session/${set.sessionId}`} className="row" style={{ color: "var(--fg)", padding: "6px 0" }}>{body}</Link>
    : <div className="row" style={{ padding: "6px 0" }}>{body}</div>;
}
