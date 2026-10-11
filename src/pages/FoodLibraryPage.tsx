import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { Food } from "../data/types";
import { fmtNum } from "../lib/format";
import { libraryList, newFood, servingOf } from "../lib/nutrition";
import { Card, PageHead, Segmented } from "../ui/kit";
import { ChevronLeft, PlusIcon } from "../ui/icons";
import { FoodFormSheet, type FoodValues } from "./food/FoodFormSheet";
import { SearchIcon, StarIcon, needsCheck, useToast } from "./food/ui";

/** Your foods: search, add, edit, favourite, remove (archive) with undo, and bring removed foods back. */
export function FoodLibraryPage() {
  const { local } = useStore();
  const foods = useRows("foods");
  const [q, setQ] = useState("");
  const [removed, setRemoved] = useState(false);
  const [editing, setEditing] = useState<Food | "new" | null>(null);
  const toast = useToast();
  const close = useCallback(() => setEditing(null), []);

  const list = useMemo(() => libraryList(foods, q, removed), [foods, q, removed]);
  const inUse = foods.filter((f) => !f.archived).length;
  const archived = foods.length - inUse;

  function archive(f: Food) {
    void local.save("foods", { id: f.id, archived: true });
    toast.show(`Removed ${f.name}`, () => void local.save("foods", { id: f.id, archived: false }));
  }
  function restore(f: Food) {
    void local.save("foods", { id: f.id, archived: false });
    toast.show(`${f.name} is back`, () => void local.save("foods", { id: f.id, archived: true }));
  }

  function save(v: FoodValues) {
    if (editing === "new") {
      void local.save("foods", newFood({ ...v, source: "custom" }));
      toast.show(`Added ${v.name}`);
      return;
    }
    if (!editing) return;
    const [first, ...rest] = editing.servings;
    void local.save("foods", {
      id: editing.id, name: v.name, brand: v.brand, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat,
      servings: [{ ...(first ?? { id: "serving-1", amount: 1, unit: "serving" }), label: v.serving }, ...rest],
      legacy_ref: { ...editing.legacy_ref, checked_at: new Date().toISOString() }
    });
  }

  return (
    <main className="page">
      <PageHead eyebrow={<Link to="/food" className="food-back"><ChevronLeft /> Food</Link>} title="Foods">
        <button className="btn btn-primary food-chip" onClick={() => setEditing("new")}><PlusIcon /> New food</button>
      </PageHead>

      <div className="food-lib">
        <div className="food-lib-tools">
          <label className="field food-search" htmlFor="lib-q">
            <SearchIcon />
            <span className="sr-only">Search foods</span>
            <input id="lib-q" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
          <Segmented label="Show" value={removed ? "removed" : "use"} onChange={(v) => setRemoved(v === "removed")}
            options={[{ value: "use", label: `In use ${inUse}` }, { value: "removed", label: `Removed ${archived}` }]} />
        </div>

        {list.length > 0 ? (
          <Card pad={false} className="food-lib-list k-rows">
            {list.map((f) => (
              <div className="food-item" key={f.id}>
                <button className="food-lib-row" onClick={() => setEditing(f)}>
                  <span className="food-lib-name">
                    <span className="food-ellipsis">{f.name}{needsCheck(f) && <span className="food-dot" role="img" title="Check the label" aria-label="Check the label" />}</span>
                    <span className="row-sub food-ellipsis">{servingOf(f)}</span>
                  </span>
                  <span className="food-lib-num"><b>{fmtNum(f.kcal, 0)}</b><small>kcal</small></span>
                  <span className="food-lib-num"><b>{fmtNum(f.protein, 0)}</b><small>g prot</small></span>
                </button>
                {removed ? (
                  <button className="btn btn-tinted btn-sm btn-restore" onClick={() => restore(f)}>Restore</button>
                ) : (
                  <button className="food-icon-btn star" aria-pressed={f.favorite} aria-label={f.favorite ? `Unfavourite ${f.name}` : `Favourite ${f.name}`}
                    onClick={() => void local.save("foods", { id: f.id, favorite: !f.favorite })}>
                    <StarIcon on={f.favorite} />
                  </button>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <p className="k-empty" style={{ height: 120 }}>{q ? "No match" : removed ? "Nothing removed" : "No foods yet"}</p>
        )}
      </div>

      {editing && (
        <FoodFormSheet
          food={editing === "new" ? null : editing}
          onClose={close}
          onSave={save}
          onRemove={editing !== "new" && !editing.archived ? () => archive(editing) : undefined}
          onRestore={editing !== "new" && editing.archived ? () => restore(editing) : undefined}
        />
      )}
      {toast.node}
    </main>
  );
}
