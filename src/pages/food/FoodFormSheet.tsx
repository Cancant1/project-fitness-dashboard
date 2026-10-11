import { useState } from "react";
import type { Food } from "../../data/types";
import { parseFoodForm, servingOf, type FoodForm } from "../../lib/nutrition";
import { Sheet } from "../../ui/Sheet";
import { fmtQty, needsCheck } from "./ui";

export interface FoodValues { name: string; brand: string | null; serving: string; kcal: number; protein: number; carbs: number | null; fat: number | null }

/** Add or edit one food (one serving). Numbers accept "82,5". */
export function FoodFormSheet({ food, onSave, onRemove, onRestore, onClose }: {
  food: Food | null;
  onSave: (v: FoodValues) => void;
  onRemove?: () => void;
  onRestore?: () => void;
  onClose: () => void;
}) {
  const num = (v: number | null | undefined) => (v == null ? "" : fmtQty(v));
  const [form, setForm] = useState<FoodForm>({
    name: food?.name ?? "", brand: food?.brand ?? "", serving: food ? servingOf(food) : "",
    kcal: num(food?.kcal), protein: num(food?.protein), carbs: num(food?.carbs), fat: num(food?.fat)
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FoodForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function save() {
    const r = parseFoodForm(form);
    if (!r.ok) return setError(r.error);
    onSave(r.value);
    onClose();
  }

  const text = (k: "name" | "brand" | "serving", label: string, placeholder: string) => (
    <label className="field" htmlFor={`ff-${k}`}>
      <span className="food-label">{label}</span>
      <input id={`ff-${k}`} name={k} placeholder={placeholder} value={form[k]} onChange={set(k)} autoComplete="off" />
    </label>
  );
  const number = (k: "kcal" | "protein" | "carbs" | "fat", label: string, unit: string, placeholder = "") => (
    <label className="field" htmlFor={`ff-${k}`}>
      <span className="food-label">{label}</span>
      <input id={`ff-${k}`} name={k} inputMode="decimal" className="num" placeholder={placeholder} value={form[k]} onChange={set(k)} autoComplete="off" />
      <span className="field-suffix">{unit}</span>
    </label>
  );

  return (
    <Sheet title={food ? "Edit food" : "New food"} onClose={onClose}>
      <form className="food-form" style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        {food && needsCheck(food) && (
          <p className="row-sub" style={{ margin: "0 4px 4px" }}>These numbers are an estimate from the plan. Check the pack and save.</p>
        )}
        {text("name", "Name", "e.g. Magere kwark")}
        {text("brand", "Brand", "Optional")}
        {text("serving", "Serving", "e.g. 1 tub (500 g)")}
        <p className="section-label" style={{ marginTop: 8 }}>Per serving</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {number("kcal", "Energy", "kcal")}
          {number("protein", "Protein", "g")}
          {number("carbs", "Carbs", "g", "Optional")}
          {number("fat", "Fat", "g", "Optional")}
        </div>
        {error && <p role="alert" style={{ color: "var(--bad)", fontSize: 15, margin: "4px 4px 0" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {onRemove && <button type="button" className="btn btn-glass" style={{ color: "var(--bad)" }} onClick={() => { onRemove(); onClose(); }}>Remove</button>}
          {onRestore && <button type="button" className="btn btn-glass" onClick={() => { onRestore(); onClose(); }}>Restore</button>}
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
        </div>
      </form>
    </Sheet>
  );
}
