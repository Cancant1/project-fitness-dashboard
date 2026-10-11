import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { Exercise, Unit } from "../data/types";
import { fmtShortDate, todayIso } from "../lib/format";
import { Label, Segmented } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { ChevronRight, PlusIcon } from "../ui/icons";
import "./plan/forms.css";
import "./exercises.css";

type Order = "az" | "muscle";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
const TAG: Record<string, string> = {
  barbell: "Barbell", dumbbell: "DB", cable: "Cable", machine: "Machine", bodyweight: "Body", belt: "Belt", kettlebell: "KB", band: "Band"
};
const tagOf = (e: Exercise) => (e.equipment ? TAG[e.equipment] ?? cap(e.equipment) : e.default_unit === "min" ? "Time" : null);
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

/** The exercise library: search, A–Z or by muscle, last time done. */
export function ExercisesPage() {
  const exercises = useRows("exercises");
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order>("az");
  const [adding, setAdding] = useState(false);
  const year = todayIso().slice(0, 4);

  const lastDone = useMemo(() => {
    const date = new Map(sessions.filter((s) => s.status === "completed").map((s) => [s.id, s.date]));
    const m = new Map<string, string>();
    for (const s of sets) {
      const d = date.get(s.session_id);
      if (d && (m.get(s.exercise_id) ?? "") < d) m.set(s.exercise_id, d);
    }
    return m;
  }, [sessions, sets]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => !e.archived)
      .filter((e) => !q || `${e.name} ${e.aliases.join(" ")} ${e.muscle_direct ?? ""} ${e.equipment ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Exercise[]>();
    for (const e of list) {
      const k = order === "az" ? (/[a-z]/i.test(e.name.charAt(0)) ? e.name.charAt(0).toUpperCase() : "#") : e.muscle_direct ? cap(e.muscle_direct) : "Other";
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    const last = order === "az" ? "#" : "Other";
    return [...m].sort(([a], [b]) => (a === last ? 1 : b === last ? -1 : a.localeCompare(b)));
  }, [list, order]);

  const when = (d: string | undefined) => (!d ? "" : d.startsWith(year) ? fmtShortDate(d) : monthYear.format(new Date(`${d}T12:00:00`)));

  return (
    <main className="page exercises">
      <header className="k-head">
        <div>
          <p className="k-eyebrow">{list.length} {query ? "found" : "in your library"}</p>
          <h1 className="k-title">Exercises</h1>
        </div>
        <div className="k-head-actions">
          <button type="button" className="btn btn-primary ex-new" onClick={() => setAdding(true)}><PlusIcon /> New</button>
        </div>
      </header>

      <div className="ex-tools">
        <label className="field ex-search" htmlFor="ex-q">
          <span className="sr-only">Search exercises</span>
          <input id="ex-q" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Segmented label="Order" value={order} onChange={setOrder} options={[{ value: "az", label: "A–Z" }, { value: "muscle", label: "By muscle" }]} />
      </div>

      {list.length ? (
        <div className="ex-groups">
          {groups.map(([label, rows]) => (
            <section key={label} className="ex-group">
              <Label>{label}</Label>
              <div className="k-card ex-list">
                {rows.map((e) => {
                  const tag = tagOf(e);
                  const d = lastDone.get(e.id);
                  return (
                    <Link key={e.id} to={`/exercise/${e.id}`} className={`ex-row${e.available ? "" : " is-away"}`}
                      title={e.available ? undefined : "Not at this gym"}>
                      <span className="ex-name">{e.name}</span>
                      {tag && <span className="ex-tag">{tag}</span>}
                      <span className="ex-last">{when(d)}</span>
                      <ChevronRight className="ex-chev" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="k-card k-pad ex-empty">
          <span className="k-muted">{query ? "No match" : "No exercises yet"}</span>
          {query && <button type="button" className="btn btn-tinted ex-new" onClick={() => setAdding(true)}><PlusIcon /> Add "{query.trim()}"</button>}
        </div>
      )}

      {adding && <NewExerciseSheet exercises={exercises} initialName={query.trim()} onClose={() => setAdding(false)} />}
    </main>
  );
}

const KIND_LABEL: Record<Exercise["kind"], string> = { main: "Main lift", compound: "Compound", isolation: "Isolation", conditioning: "Conditioning", mobility: "Mobility" };
const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "belt", "kettlebell", "band"];
const MUSCLES = ["quads", "glutes", "adductors", "hamstrings", "calves", "abs", "chest", "back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "forearms", "rotator_cuff", "serratus"];
const UNITS: { value: Unit; label: string }[] = [{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }, { value: "bodyweight", label: "Body" }, { value: "min", label: "min" }];

function NewExerciseSheet({ exercises, initialName, onClose }: { exercises: Exercise[]; initialName: string; onClose: () => void }) {
  const { local } = useStore();
  const [name, setName] = useState(initialName);
  const [equipment, setEquipment] = useState("cable");
  const [unit, setUnit] = useState<Unit>("kg");
  const [kind, setKind] = useState<Exercise["kind"]>("isolation");
  const [muscle, setMuscle] = useState("");
  const [busy, setBusy] = useState(false);

  const equipmentOptions = useMemo(() => [...new Set([...EQUIPMENT, ...exercises.map((e) => e.equipment).filter((x): x is string => !!x)])], [exercises]);
  const muscleOptions = useMemo(() => [...new Set([...exercises.map((e) => e.muscle_direct).filter((x): x is string => !!x), ...MUSCLES])].sort(), [exercises]);
  const trimmed = name.trim();
  const duplicate = exercises.find((e) => e.name.trim().toLowerCase() === trimmed.toLowerCase() || e.aliases.some((a) => a.trim().toLowerCase() === trimmed.toLowerCase()));

  async function save() {
    if (!trimmed || duplicate) return;
    setBusy(true);
    await local.save("exercises", {
      name: trimmed, aliases: [], equipment: equipment === "other" ? null : equipment, default_unit: unit, kind,
      muscle_direct: muscle.trim() || null, muscle_indirect: [], available: true, cues: null, archived: false, legacy_ref: {}
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet title="New exercise" onClose={onClose}>
      <label className="f-label" htmlFor="ne-name">
        <span>Name</span>
        <span className="field"><input id="ne-name" autoFocus placeholder="Cable Y-raise" value={name} onChange={(e) => setName(e.target.value)} /></span>
      </label>
      {duplicate && <p className="f-error">"{duplicate.name}" already exists.</p>}
      <div className="f-label">
        <span>Logged in</span>
        <div className="f-seg-full"><Segmented label="Default unit" value={unit} onChange={setUnit} options={UNITS} /></div>
      </div>
      <div className="f-pair">
        <label className="f-label" htmlFor="ne-eq">
          <span>Equipment</span>
          <span className="field f-select">
            <select id="ne-eq" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              {equipmentOptions.map((x) => <option key={x} value={x}>{cap(x)}</option>)}
              <option value="other">Other</option>
            </select>
          </span>
        </label>
        <label className="f-label" htmlFor="ne-kind">
          <span>Kind</span>
          <span className="field f-select">
            <select id="ne-kind" value={kind} onChange={(e) => setKind(e.target.value as Exercise["kind"])}>
              {(Object.keys(KIND_LABEL) as Exercise["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </span>
        </label>
      </div>
      <label className="f-label" htmlFor="ne-muscle">
        <span>Main muscle</span>
        <span className="field"><input id="ne-muscle" list="ne-muscles" placeholder="side_delts" value={muscle} onChange={(e) => setMuscle(e.target.value)} /></span>
        <datalist id="ne-muscles">{muscleOptions.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <button type="button" className="btn btn-primary" disabled={!trimmed || !!duplicate || busy} onClick={() => void save()}>Add exercise</button>
    </Sheet>
  );
}
