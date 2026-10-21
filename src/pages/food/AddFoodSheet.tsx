import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Food, FoodEntry, Meal } from "../../data/types";
import { fmtNum, parseDecimal } from "../../lib/format";
import { entryFromFood, rankFoodsForAdd, servingOf, type AddGroup, type EntryDraft } from "../../lib/nutrition";
import { Sheet } from "../../ui/Sheet";
import { PlusIcon } from "../../ui/icons";
import { FoodLine, MealPicker, QuantityStepper, SearchIcon, fmtQty, mealLabel } from "./ui";

const EMPTY_QUICK = { name: "", kcal: "", protein: "", carbs: "", fat: "" };
const GROUP_LABEL: Record<AddGroup, string> = { favorite: "Favourites", recent: "Recent", all: "All foods" };
/** Quick picks in the quantity step (servings). */
const QUICK_QTY = [0.5, 1, 1.5, 2, 3];

/**
 * Pick a food (favourites = the 3 most logged this week, recent, the rest; archived foods are hidden), choose how
 * many servings, add. Quick add for one-offs.
 */
export function AddFoodSheet({ meal: initialMeal, day = null, today, foods, entries, onAdd, onClose }: {
  meal: Meal; today: string; foods: Food[]; entries: FoodEntry[];
  /** Short name of the day being logged to ("Tue 6 Oct"), or null for today. */
  day?: string | null;
  onAdd: (items: EntryDraft[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState(1);
  const [quick, setQuick] = useState(EMPTY_QUICK);
  const [quickError, setQuickError] = useState(false);
  const [added, setAdded] = useState<string[]>([]);

  const ranked = useMemo(() => rankFoodsForAdd(foods, entries, q, today), [foods, entries, q, today]);

  function add(food: Food, quantity: number) {
    void onAdd([entryFromFood(food, quantity, meal)]);
    setAdded((a) => [...a, food.name]);
    setPicked(null);
    setQty(1);
  }

  function addQuick() {
    const kcal = parseDecimal(quick.kcal);
    const protein = quick.protein.trim() ? parseDecimal(quick.protein) : 0;
    if (kcal == null || kcal < 0 || protein == null || protein < 0) return setQuickError(true);
    // Carbs and fat are optional: left empty they stay null (unknown), not 0.
    const optional = (text: string) => (text.trim() ? parseDecimal(text) : null);
    const carbs = optional(quick.carbs);
    const fat = optional(quick.fat);
    if ((quick.carbs.trim() && (carbs == null || carbs < 0)) || (quick.fat.trim() && (fat == null || fat < 0))) return setQuickError(true);
    const name = quick.name.trim() || "Quick add";
    void onAdd([{ meal, food_id: null, name, serving_label: null, quantity: 1, kcal, protein, carbs, fat, note: null }]);
    setAdded((a) => [...a, name]);
    setQuick(EMPTY_QUICK);
    setQuickError(false);
  }

  const title = added.length
    ? `Added ${added.length} to ${mealLabel(meal)}${day ? ` · ${day}` : ""}`
    : day ? `Add to ${day}` : "Add food";

  if (picked) {
    return (
      <Sheet title={title} onClose={onClose}>
        <MealPicker value={meal} onChange={setMeal} />
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{picked.name}</span>
            <span className="row-sub">{picked.brand ? `${picked.brand} · ` : ""}{servingOf(picked)}</span>
          </div>
          <QuantityStepper value={qty} onChange={setQty} />
          <div className="food-qty-quick" role="group" aria-label="Quick amounts">
            {QUICK_QTY.map((n) => (
              <button key={n} type="button" aria-pressed={qty === n} onClick={() => setQty(n)}>{fmtQty(n)}×</button>
            ))}
          </div>
          <p className="num" style={{ fontSize: 15 }}>
            <strong>{fmtNum(picked.kcal * qty, 0)}</strong> kcal · <strong>{fmtNum(picked.protein * qty, 1)}</strong> g protein
            {picked.carbs != null && <span className="muted"> · {fmtNum(picked.carbs * qty, 0)} g carbs</span>}
            {picked.fat != null && <span className="muted"> · {fmtNum(picked.fat * qty, 0)} g fat</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-glass" onClick={() => { setPicked(null); setQty(1); }}>Back</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => add(picked, qty)}>Add to {mealLabel(meal)}</button>
        </div>
      </Sheet>
    );
  }

  const groups = (["favorite", "recent", "all"] as AddGroup[])
    .map((g) => ({ g, items: ranked.filter((r) => r.group === g).map((r) => r.food) }))
    .filter((x) => x.items.length);

  return (
    <Sheet title={title} onClose={onClose}>
      <MealPicker value={meal} onChange={setMeal} />
      <label className="field" htmlFor="food-q">
        <SearchIcon style={{ color: "var(--fg2)", flex: "none" }} />
        <span className="sr-only">Search your foods</span>
        <input id="food-q" type="search" placeholder="Search your foods" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </label>
      {added.length > 0 && <p className="row-sub" style={{ margin: "0 4px" }}>Added: {added.slice(-3).join(", ")}</p>}

      {groups.map(({ g, items }) => (
        <section className="section" key={g}>
          <h3 className="section-label">{GROUP_LABEL[g]}</h3>
          <div className="list">
            {items.map((f) => (
              <div className="food-item" key={f.id}>
                <button className="food-row" onClick={() => { setPicked(f); setQty(1); }}>
                  <span className="food-row-text">
                    <span className="food-ellipsis">
                      {f.name}
                    </span>
                    <FoodLine food={f} />
                  </span>
                </button>
                <button className="food-icon-btn add" aria-label={`Add ${f.name}`} onClick={() => { setPicked(f); setQty(1); }}><PlusIcon /></button>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && (
        <p className="muted" style={{ margin: "0 4px", fontSize: 15 }}>
          {q ? "No food matches. Quick add it below, or " : "No foods yet. Quick add below, or "}
          <Link to="/food/library" onClick={onClose}>add it to your foods</Link>.
        </p>
      )}

      <section className="section">
        <h3 className="section-label">Quick add</h3>
        <div className="list" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="field" htmlFor="qa-name"><span className="sr-only">What</span><input id="qa-name" placeholder="What (optional)" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} autoComplete="off" /></label>
          <div className="grid-2" style={{ gap: 8 }}>
            <label className="field" htmlFor="qa-kcal"><span className="sr-only">Energy</span><input id="qa-kcal" className="num" inputMode="decimal" placeholder="0" value={quick.kcal} onChange={(e) => setQuick({ ...quick, kcal: e.target.value })} /><span className="field-suffix">kcal</span></label>
            <label className="field" htmlFor="qa-p"><span className="sr-only">Protein</span><input id="qa-p" className="num" inputMode="decimal" placeholder="0" value={quick.protein} onChange={(e) => setQuick({ ...quick, protein: e.target.value })} /><span className="field-suffix">g protein</span></label>
            <label className="field" htmlFor="qa-c"><span className="sr-only">Carbs</span><input id="qa-c" className="num" inputMode="decimal" placeholder="Optional" value={quick.carbs} onChange={(e) => setQuick({ ...quick, carbs: e.target.value })} /><span className="field-suffix">g carbs</span></label>
            <label className="field" htmlFor="qa-f"><span className="sr-only">Fat</span><input id="qa-f" className="num" inputMode="decimal" placeholder="Optional" value={quick.fat} onChange={(e) => setQuick({ ...quick, fat: e.target.value })} /><span className="field-suffix">g fat</span></label>
          </div>
          {quickError && <p role="alert" style={{ color: "var(--bad)", fontSize: 13, margin: "0 4px" }}>Enter the numbers as numbers.</p>}
          <button className="btn btn-tinted" style={{ height: 44, alignSelf: "flex-end" }} onClick={addQuick}>Add to {mealLabel(meal)}</button>
        </div>
      </section>
    </Sheet>
  );
}
