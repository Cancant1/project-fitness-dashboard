import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows } from "../data/store";
import { fromIso } from "../lib/format";
import { isFlagged } from "../lib/analysis";
import { Bar, Card, Label, PageHead } from "../ui/kit";
import { SearchIcon } from "./food/ui";
import "./history.css";

const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const PAGE = 60;

/** History: find a session. Search, then a slim month-by-month timeline; 60 rows at a time. */
export function HistoryPage() {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("exercises");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  // Work sets and volume (kg × reps of clean, completed work sets) per session.
  const bySession = useMemo(() => {
    const m = new Map<string, { n: number; volume: number; exercises: Set<string> }>();
    for (const s of sets) {
      if (s.kind === "warmup") continue;
      const e = m.get(s.session_id) ?? { n: 0, volume: 0, exercises: new Set<string>() };
      e.n += 1;
      e.exercises.add(s.exercise_id);
      if (s.completed && !isFlagged(s) && s.load_kg != null && s.load_kg > 0 && s.reps) e.volume += s.load_kg * s.reps;
      m.set(s.session_id, e);
    }
    return m;
  }, [sets]);
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  // Scale volume bars to the 98th percentile so one odd session doesn't flatten the rest.
  const volTop = useMemo(() => {
    const v = [...bySession.values()].map((x) => x.volume).filter((x) => x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) * 0.98)]! : 1;
  }, [bySession]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => s.status === "completed" || s.status === "in_progress")
      .filter((s) => {
        if (!q) return true;
        const ex = [...(bySession.get(s.id)?.exercises ?? [])].map((id) => names.get(id) ?? "").join(" ");
        return `${s.title ?? ""} ${s.source} ${s.notes ?? ""} ${ex}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions, bySession, names, query]);

  const groups = useMemo(() => {
    const out: { month: string; rows: typeof list }[] = [];
    for (const s of list.slice(0, limit)) {
      const month = monthFmt.format(fromIso(s.date));
      if (out[out.length - 1]?.month !== month) out.push({ month, rows: [] });
      out[out.length - 1]!.rows.push(s);
    }
    return out;
  }, [list, limit]);

  return (
    <main className="page history">
      <PageHead eyebrow={`${list.length} sessions`} title="History" />

      <label className="field h-search" htmlFor="h-q">
        <SearchIcon />
        <span className="sr-only">Search workouts</span>
        <input id="h-q" type="search" placeholder="Exercise, block or note" value={query} autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
      </label>

      {groups.map((g) => (
        <section key={g.month}>
          <Label>{g.month}</Label>
          <Card pad={false} className="h-month">
            {g.rows.map((s) => {
              const info = bySession.get(s.id);
              const d = fromIso(s.date);
              const conf = s.status === "in_progress" ? "live" : s.date_confidence === "exact" ? "exact" : s.date_confidence === "estimated" ? "est" : "week";
              return (
                <Link key={s.id} to={`/session/${s.id}`} className={`h-row ${conf}`}
                  title={conf === "est" ? "Date estimated" : conf === "week" ? "Week known, day from the sheet" : undefined}>
                  <span className="h-date"><small>{weekdayFmt.format(d)}</small><b>{d.getDate()}</b></span>
                  <span className="h-rail" aria-hidden="true"><i /></span>
                  <span className="h-title">
                    <span>{s.title || s.source.replace(/^sheet:/, "")}</span>
                    {conf === "est" && <em className="h-est">est.</em>}
                  </span>
                  <span className="h-sets"><b>{info?.n ?? 0}</b> sets</span>
                  <span className="h-vol" aria-label={`Volume ${Math.round(info?.volume ?? 0)} kg`}>
                    <Bar value={(info?.volume ?? 0) / volTop} height={4} color="var(--chart-1)" />
                  </span>
                </Link>
              );
            })}
          </Card>
        </section>
      ))}

      {list.length > limit && (
        <button className="btn btn-tinted h-more" onClick={() => setLimit(limit + PAGE * 2)}>Show more</button>
      )}
      {!list.length && <p className="k-empty" style={{ height: 160 }}>{query ? "No match" : "No sessions yet"}</p>}
    </main>
  );
}
