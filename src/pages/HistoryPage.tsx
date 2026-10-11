import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows } from "../data/store";
import { fmtShortDate } from "../lib/format";
import { ChevronRight } from "../ui/icons";

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function HistoryPage() {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("exercises");
  const [query, setQuery] = useState("");

  const setsBySession = useMemo(() => {
    const m = new Map<string, { n: number; exercises: Set<string> }>();
    for (const s of sets) {
      if (s.kind === "warmup") continue;
      const e = m.get(s.session_id) ?? { n: 0, exercises: new Set() };
      e.n += 1;
      e.exercises.add(s.exercise_id);
      m.set(s.session_id, e);
    }
    return m;
  }, [sets]);
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sessions
      .filter((s) => s.status === "completed" || s.status === "in_progress")
      .filter((s) => {
        if (!q) return true;
        const ex = [...(setsBySession.get(s.id)?.exercises ?? [])].map((id) => names.get(id) ?? "").join(" ");
        return `${s.title ?? ""} ${s.source} ${s.notes ?? ""} ${ex}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    const out: { month: string; rows: typeof list }[] = [];
    for (const s of list) {
      const month = monthFmt.format(new Date(s.date + "T12:00:00"));
      if (out[out.length - 1]?.month !== month) out.push({ month, rows: [] });
      out[out.length - 1]!.rows.push(s);
    }
    return out;
  }, [sessions, setsBySession, names, query]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{total} workouts</p>
          <h1 className="large-title">History</h1>
        </div>
      </header>
      <label className="field" htmlFor="h-q">
        <span className="sr-only">Search workouts</span>
        <input id="h-q" placeholder="Search exercise, block or note" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {groups.map((g) => (
        <section className="section" key={g.month}>
          <h2 className="section-label">{g.month}</h2>
          <div className="list">
            {g.rows.map((s) => {
              const info = setsBySession.get(s.id);
              return (
                <Link key={s.id} to={`/session/${s.id}`} className="row" style={{ color: "var(--fg)", padding: "8px 0" }}>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{s.title || s.source.replace(/^sheet:/, "")}</span>
                    <span className="row-sub">
                      {fmtShortDate(s.date)}{s.date_confidence !== "exact" ? (s.date_confidence === "estimated" ? " · date estimated" : " · week known") : ""}
                      {" · "}{info?.n ?? 0} sets
                    </span>
                  </span>
                  <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {!total && <p className="muted">No workouts yet. Your history appears here after the import.</p>}
    </main>
  );
}
