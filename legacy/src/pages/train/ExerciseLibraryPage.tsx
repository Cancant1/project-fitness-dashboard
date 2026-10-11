import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ArrowLeft, Dumbbell, Edit3, Plus, Search } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, Card, EmptyState, Field, Modal, PageHeader, Segmented } from "../../components/ui";
import type { Exercise, MovementGroup, Unit } from "../../domain/types";
import { movementFor, nowIso, searchExercise, uid } from "../../domain/utils";

type MovementFilter = "All" | MovementGroup;

export function ExerciseLibraryPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [movement, setMovement] = useState<MovementFilter>("All");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Exercise | "new" | null>(null);
  if (!snapshot) return null;
  const exercises = useMemo(() => searchExercise(snapshot.exercises.filter((item) => !item.deletedAt && (showArchived ? item.archived : !item.archived)), query)
    .filter((item) => movement === "All" || item.movement === movement)
    .sort((a, b) => a.name.localeCompare(b.name)), [snapshot.exercises, query, movement, showArchived]);

  const save = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    const stamp = nowIso();
    await mutate(editing === "new" ? "Created exercise" : "Updated exercise", (draft) => {
      const values = {
        name,
        movement: String(data.get("movement")) as MovementGroup,
        defaultUnit: String(data.get("unit")) as Unit,
        muscles: String(data.get("muscles") || "").split(",").map((v) => v.trim()).filter(Boolean),
        equipment: String(data.get("equipment") || "").split(",").map((v) => v.trim()).filter(Boolean),
        cues: String(data.get("cues") || "").split("\n").map((v) => v.trim()).filter(Boolean)
      };
      if (editing === "new") draft.exercises.push({ id: uid("exercise"), createdAt: stamp, updatedAt: stamp, source: "manual", aliases: [], substitutions: [], compound: false, archived: false, ...values });
      else {
        const exercise = draft.exercises.find((item) => item.id === editing?.id);
        if (exercise) Object.assign(exercise, values, { updatedAt: stamp });
      }
    });
    setEditing(null);
  };

  const toggleArchived = async (exercise: Exercise) => {
    await mutate(exercise.archived ? "Restored exercise" : "Archived exercise", (draft) => {
      const target = draft.exercises.find((item) => item.id === exercise.id);
      if (target) { target.archived = !target.archived; target.updatedAt = nowIso(); }
    });
  };

  return (
    <div className="page exercise-library-page">
      <PageHeader eyebrow="Train · Library" title="Exercise library" description="One stable movement catalog powers plans, workout logging, and progress." actions={<><Button onClick={() => navigate("/train")}><ArrowLeft />Train</Button><Button variant="primary" onClick={() => setEditing("new")}><Plus />New exercise</Button></>} />
      <Card className="library-card">
        <div className="library-toolbar"><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, muscle, equipment…" /></label><Segmented value={movement} label="Movement group" options={["All", "Push", "Pull", "Legs", "Conditioning", "Other"].map((value) => ({ value: value as MovementFilter, label: value }))} onChange={setMovement} /><Button className="small" variant={showArchived ? "soft" : "default"} onClick={() => setShowArchived((value) => !value)}><Archive />{showArchived ? "Archived" : "Current"}</Button></div>
        {exercises.length ? <div className="exercise-table"><div className="table-head"><span>Movement</span><span>Group</span><span>Equipment</span><span>Default</span><span /></div>{exercises.map((exercise) => <div className="exercise-row" key={exercise.id}><span className="exercise-name"><i><Dumbbell /></i><span><strong>{exercise.name}</strong><small>{exercise.muscles.join(" · ") || "Muscles not tagged"}</small></span></span><span><b className={`movement-dot ${exercise.movement.toLowerCase()}`} />{exercise.movement}</span><span>{exercise.equipment.join(", ") || "—"}</span><span className="mono">{exercise.defaultUnit}</span><span className="row-actions"><Button className="small" onClick={() => setEditing(exercise)}><Edit3 />Edit</Button><Button className="small" variant="ghost" onClick={() => void toggleArchived(exercise)}><Archive />{exercise.archived ? "Restore" : "Archive"}</Button></span></div>)}</div> : <EmptyState icon={<Search />} title="No movements found" description="Try another search or add a new movement. Archived exercises never disappear from past workouts." />}
      </Card>

      <Modal open={!!editing} title={editing === "new" ? "New exercise" : "Edit exercise"} onClose={() => setEditing(null)}>
        {editing && <form onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget); }}><div className="modal-body form-grid"><Field label="Name"><input name="name" required defaultValue={editing === "new" ? "" : editing.name} /></Field><Field label="Movement group"><select name="movement" defaultValue={editing === "new" ? movementFor("") : editing.movement}>{["Push", "Pull", "Legs", "Conditioning", "Other"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Default unit"><select name="unit" defaultValue={editing === "new" ? "kg" : editing.defaultUnit}>{["kg", "lb", "bodyweight", "assisted", "min", "reps"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Muscles" hint="Comma separated"><input name="muscles" defaultValue={editing === "new" ? "" : editing.muscles.join(", ")} /></Field><Field label="Equipment" hint="Comma separated"><input name="equipment" defaultValue={editing === "new" ? "" : editing.equipment.join(", ")} /></Field><Field label="Technique cues" hint="One per line" className="full"><textarea name="cues" rows={4} defaultValue={editing === "new" ? "" : editing.cues.join("\n")} /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">Save exercise</Button></div></form>}
      </Modal>
    </div>
  );
}
