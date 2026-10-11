import { useState } from "react";
import type { FoodEntry, Meal } from "../../data/types";
import { fmtNum } from "../../lib/format";
import { rescaleEntry, servingText } from "../../lib/nutrition";
import { Sheet } from "../../ui/Sheet";
import { MealPicker, QuantityStepper } from "./ui";

/** Change servings or meal of a logged item, or remove it. */
export function EntrySheet({ entry, onSave, onRemove, onClose }: {
  entry: FoodEntry;
  onSave: (patch: Partial<FoodEntry>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(entry.quantity > 0 ? entry.quantity : 1);
  const [meal, setMeal] = useState<Meal>(entry.meal ?? "other");
  const next = rescaleEntry(entry, qty);

  return (
    <Sheet title={entry.name} onClose={onClose}>
      <MealPicker value={meal} onChange={setMeal} withOther={entry.meal === "other" || entry.meal == null} />
      <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="row-sub">{servingText(entry.serving_label)} each</span>
        <QuantityStepper value={qty} onChange={setQty} />
        <p className="num" style={{ fontSize: 15 }}>
          <strong>{fmtNum(next.kcal, 0)}</strong> kcal · <strong>{fmtNum(next.protein, 1)}</strong> g protein
          {next.carbs != null && <span className="muted"> · {fmtNum(next.carbs, 0)} g carbs</span>}
          {next.fat != null && <span className="muted"> · {fmtNum(next.fat, 0)} g fat</span>}
        </p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-glass" style={{ color: "var(--bad)" }} onClick={() => { onRemove(); onClose(); }}>Remove</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onSave({ ...next, meal }); onClose(); }}>Save</button>
      </div>
    </Sheet>
  );
}
