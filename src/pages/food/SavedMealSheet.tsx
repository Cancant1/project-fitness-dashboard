import type { SavedMeal } from "../../data/types";
import { fmtNum } from "../../lib/format";
import { sumEntries } from "../../lib/nutrition";
import { Sheet } from "../../ui/Sheet";
import { fmtQty, mealLabel } from "./ui";

/** Log a saved meal in one go, or item by item. Each item keeps its own meal. */
export function SavedMealSheet({ meal, day = null, onLog, onDelete, onClose }: {
  meal: SavedMeal;
  /** Short name of the day being logged to, or null for today. */
  day?: string | null;
  onLog: (items: SavedMeal["items"]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const total = sumEntries(meal.items);
  return (
    <Sheet title={meal.name} onClose={onClose}>
      <p className="row-sub num" style={{ margin: "0 4px" }}>
        {meal.items.length} items · {fmtNum(total.kcal, 0)} kcal · {fmtNum(total.protein, 0)} g protein
      </p>
      <div className="list">
        {meal.items.map((i, n) => (
          <div className="food-item" key={n}>
            <span className="food-row-text" style={{ flex: 1, padding: "8px 0" }}>
              <span className="food-ellipsis" style={{ fontSize: 15 }}>{i.quantity !== 1 ? `${fmtQty(i.quantity)} × ` : ""}{i.name}</span>
              <span className="row-sub food-ellipsis">{mealLabel(i.meal)} · <span className="num">{fmtNum(i.kcal, 0)}</span> kcal · <span className="num">{fmtNum(i.protein, 1)}</span> g</span>
            </span>
            <button className="btn btn-tinted btn-sm" style={{ height: 44, borderRadius: 22, flex: "none" }} onClick={() => onLog([i])}>Log</button>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={() => { onLog(meal.items); onClose(); }}>{day ? `Log all to ${day}` : "Log all"}</button>
      <button className="btn btn-plain" style={{ color: "var(--bad)", alignSelf: "center", height: 44 }} onClick={() => { onDelete(); onClose(); }}>Delete saved meal</button>
    </Sheet>
  );
}
