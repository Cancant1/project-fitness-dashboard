import { useCallback, useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import type { Food, Meal } from "../../data/types";
import { fmtNum, parseDecimal } from "../../lib/format";
import { servingOf, stepQuantity } from "../../lib/nutrition";
import { MinusIcon, PlusIcon } from "../../ui/icons";

// Shared bits for the Food pages: meal names, a few icons, the undo toast, the quantity stepper, scoped styles.

export const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
  { key: "other", label: "Other" }
];
export const mealLabel = (m: Meal | null) => MEALS.find((x) => x.key === (m ?? "other"))!.label;

// ------------------------------------------------------------------ icons (same drawing rules as ui/icons.tsx)

type P = SVGProps<SVGSVGElement> & { size?: number };
function Svg({ size = 20, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}
export const RemoveIcon = (p: P) => <Svg size={22} {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><path d="M7.5 12h9" stroke="var(--surface)" strokeWidth={2.2} /></Svg>;
export const TrashIcon = (p: P) => <Svg {...p}><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7M10.2 10.5v5.5M13.8 10.5v5.5" /></Svg>;
export const SearchIcon = (p: P) => <Svg size={18} {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></Svg>;
export const StarIcon = ({ on, ...p }: P & { on?: boolean }) => (
  <Svg {...p}><path d="M12 3.8l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.8l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill={on ? "currentColor" : "none"} /></Svg>
);

// ------------------------------------------------------------------ undo toast

interface Toast { id: number; text: string; undo?: () => void }

/** One toast at a time; a new one replaces the old. Undo stays for 6 seconds. */
export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string, undo?: () => void) => {
    window.clearTimeout(timer.current);
    const id = Date.now() + Math.random();
    setToast({ id, text, undo });
    timer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const node = toast && (
    <div className="toast glass food-toast" role="status" key={toast.id}>
      <span className="food-ellipsis">{toast.text}</span>
      {toast.undo && (
        <button className="btn btn-plain btn-sm" style={{ height: 44, flex: "none" }} onClick={() => { toast.undo!(); setToast(null); }}>Undo</button>
      )}
    </div>
  );
  return { show, node };
}

// ------------------------------------------------------------------ controls

/** − value + on a 0.5 grid; the value can also be typed ("1,5"). */
export function QuantityStepper({ value, onChange, label = "servings" }: { value: number; onChange: (v: number) => void; label?: string }) {
  const [text, setText] = useState(fmtQty(value));
  useEffect(() => setText((t) => (parseDecimal(t) === value ? t : fmtQty(value))), [value]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="stepper">
        <button type="button" aria-label="Less" onClick={() => onChange(stepQuantity(value, -0.5))} disabled={value <= 0.5}><MinusIcon /></button>
        <div className="stepper-value">
          <input aria-label={label} inputMode="decimal" value={text} onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setText(e.target.value);
              const v = parseDecimal(e.target.value);
              if (v != null && v > 0) onChange(v);
            }}
            onBlur={() => setText(fmtQty(value))} />
        </div>
        <button type="button" aria-label="More" onClick={() => onChange(stepQuantity(value, 0.5))}><PlusIcon /></button>
      </div>
      <span className="row-sub">{label}</span>
    </div>
  );
}

/** 1.5 → "1,5" (Mario types commas). */
export const fmtQty = (q: number) => String(Math.round(q * 100) / 100).replace(".", ",");

export function MealPicker({ value, onChange, withOther = false }: { value: Meal; onChange: (m: Meal) => void; withOther?: boolean }) {
  return (
    <div className="segmented food-seg" role="group" aria-label="Meal">
      {MEALS.filter((m) => withOther || m.key !== "other").map((m) => (
        <button type="button" key={m.key} aria-pressed={value === m.key} onClick={() => onChange(m.key)}>{m.label}</button>
      ))}
    </div>
  );
}

/** iOS-style switch with a 44 px tap target. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="food-switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function FoodLine({ food }: { food: Food }) {
  return (
    <span className="row-sub food-ellipsis">
      {servingOf(food)} · <span className="num">{fmtNum(food.kcal, 0)}</span> kcal · <span className="num">{fmtNum(food.protein, 1)}</span> g protein
    </span>
  );
}

export const needsCheck = (f: Food) => f.source === "plan-estimate" && !f.legacy_ref?.checked_at;

// ------------------------------------------------------------------ scoped styles (tokens only)

const CSS = `
.food-layout { display: grid; gap: 24px; grid-template-columns: minmax(0, 1fr); grid-template-areas: "totals" "side" "meals"; }
.food-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.food-meals { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
@media (min-width: 900px) {
  .food-layout { grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr); grid-template-areas: "totals side" "meals side"; align-items: start; column-gap: 28px; }
  .food-side { position: sticky; top: 28px; }
}
.food-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.food-row { flex: 1; min-width: 0; min-height: 56px; border: 0; background: transparent; padding: 8px 0; color: inherit; text-align: left; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 15px; }
.food-row-text { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.food-row-nums { flex: none; text-align: right; display: flex; flex-direction: column; gap: 2px; }
.food-item { display: flex; align-items: center; gap: 4px; }
.food-item + .food-item, .food-item + .row, .row + .food-item { border-top: 1px solid var(--sep); }
.food-icon-btn { width: 44px; height: 44px; flex: none; border: 0; border-radius: 22px; background: transparent; color: var(--fg2); display: grid; place-items: center; cursor: pointer; }
.food-icon-btn:hover { background: var(--seg); }
.food-icon-btn.danger { color: var(--bad); }
.food-icon-btn.star[aria-pressed="true"] { color: var(--warm); }
.food-icon-btn.add { color: var(--accent-text); background: var(--accent-tint); }
.food-add-row { width: 100%; min-height: 44px; border: 0; background: transparent; color: var(--accent-text); font-size: 15px; font-weight: 500;
  display: flex; align-items: center; gap: 8px; padding: 0; cursor: pointer; }
.food-chip { height: 44px; border-radius: 22px; padding: 0 16px; font-size: 15px; }
.food-seg { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: 100%; border-radius: 25px; }
.food-seg button { height: 44px; border-radius: 22px; padding: 0 4px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.food-switch { width: 55px; height: 44px; flex: none; border: 0; background: transparent; padding: 0; cursor: pointer; display: grid; place-items: center; }
.food-switch > span { position: relative; width: 51px; height: 31px; border-radius: 16px; background: var(--track); transition: background 160ms ease; }
.food-switch > span::after { content: ""; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 14px; background: #FFFFFF;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18); transition: transform 160ms ease; }
.food-switch[aria-checked="true"] > span { background: var(--good); }
.food-switch[aria-checked="true"] > span::after { transform: translateX(20px); }
.food-toast { display: flex; gap: 8px; align-items: center; max-width: calc(100vw - 32px); padding: 0 6px 0 16px; min-height: 48px; }
.food-label { flex: none; width: 76px; font-size: 15px; color: var(--fg2); }
.food-form .field input { text-align: right; }
.food-form .field input[name="name"], .food-form .field input[name="brand"], .food-form .field input[name="serving"] { text-align: left; }
.food-sticky { position: sticky; bottom: 0; z-index: 1; margin: 0 calc(-1 * var(--gutter)); padding: 12px var(--gutter);
  background: var(--bg); box-shadow: 0 -1px 0 var(--sep); display: flex; flex-direction: column; gap: 8px; }
.food-lib { width: 100%; max-width: 820px; display: flex; flex-direction: column; gap: 16px; }
.food-search { flex: 1; min-width: 0; }
.food-search svg { color: var(--fg2); flex: none; }
.food-back { display: inline-flex; align-items: center; gap: 2px; height: 44px; margin-left: -6px; padding: 0 6px; font-size: 17px; color: var(--accent-text); }
`;

export function FoodStyles() {
  return <style href="reps-food" precedence="default">{CSS}</style>;
}
