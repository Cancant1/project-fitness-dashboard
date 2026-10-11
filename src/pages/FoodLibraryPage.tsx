import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { Food } from "../data/types";
import { libraryList, newFood } from "../lib/nutrition";
import { ChevronLeft, PlusIcon } from "../ui/icons";
import { FoodFormSheet, type FoodValues } from "./food/FoodFormSheet";
import { FoodLine, FoodStyles, SearchIcon, StarIcon, needsCheck, useToast } from "./food/ui";

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
      <FoodStyles />
      <header className="page-head">
        <div style={{ minWidth: 0 }}>
          <Link to="/food" className="food-back"><ChevronLeft /> Food</Link>
          <h1 className="large-title">Foods</h1>
        </div>
        <button className="btn btn-primary food-chip" style={{ flex: "none" }} onClick={() => setEditing("new")}><PlusIcon /> New food</button>
      </header>

      <div className="food-lib">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="field food-search" htmlFor="lib-q" style={{ flexBasis: 220 }}>
            <SearchIcon />
            <span className="sr-only">Search foods</span>
            <input id="lib-q" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          </label>
          <div className="segmented food-seg" role="group" aria-label="Show" style={{ flex: "1 1 220px", width: "auto" }}>
            <button aria-pressed={!removed} onClick={() => setRemoved(false)}>In use <span className="num">{inUse}</span></button>
            <button aria-pressed={removed} onClick={() => setRemoved(true)}>Removed <span className="num">{archived}</span></button>
          </div>
        </div>

        {removed && list.length > 0 && <p className="row-sub" style={{ margin: "0 4px" }}>Removed foods don't show when you add food. Restore any you still eat.</p>}

        {list.length > 0 ? (
          <div className="list">
            {list.map((f) => (
              <div className="food-item" key={f.id}>
                <button className="food-row" onClick={() => setEditing(f)}>
                  <span className="food-row-text">
                    <span className="food-ellipsis">
                      {f.name}
                      {f.brand && <span className="muted"> · {f.brand}</span>}
                      {needsCheck(f) && <span className="chip chip-warm" style={{ marginLeft: 8, height: 20, fontSize: 12 }}>Check label</span>}
                    </span>
                    <FoodLine food={f} />
                  </span>
                </button>
                {removed ? (
                  <button className="btn btn-tinted btn-sm" style={{ height: 44, borderRadius: 22, flex: "none" }} onClick={() => restore(f)}>Restore</button>
                ) : (
                  <button className="food-icon-btn star" aria-pressed={f.favorite} aria-label={f.favorite ? `Unfavourite ${f.name}` : `Favourite ${f.name}`}
                    onClick={() => void local.save("foods", { id: f.id, favorite: !f.favorite })}>
                    <StarIcon on={f.favorite} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: "0 4px", fontSize: 15 }}>
            {q ? "No food matches." : removed ? "Nothing removed." : "No foods yet. Tap New food."}
          </p>
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
