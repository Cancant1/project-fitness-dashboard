import { useCallback, useEffect, useRef, useState, type ReactNode, type SVGProps } from "react";
import type { Food, Meal } from "../../data/types";
import { fmtNum, parseDecimal } from "../../lib/format";
import { servingOf, stepQuantity } from "../../lib/nutrition";
import { MinusIcon, PlusIcon } from "../../ui/icons";
import "./food.css";

// Shared bits for the Food pages: meal names, a few icons, the undo toast, the quantity stepper. Styles live in food.css.

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


/**
 * Compact date pill that opens the native date picker (max = today, so no future days).
 * The input lies transparently over the pill: a tap on iOS opens the wheel; elsewhere showPicker() opens it.
 */
export function DateButton({ value, max, onChange, label, children }: {
  value: string; max: string; onChange: (iso: string) => void; label: string; children: ReactNode;
}) {
  return (
    <label className="date-btn">
      <span aria-hidden="true">{children}</span>
      <input type="date" aria-label={label} value={value} max={max}
        onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* not supported: native focus is enough */ } }}
        onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= max) onChange(v); }} />
    </label>
  );
}
