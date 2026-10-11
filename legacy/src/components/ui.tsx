import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { parseDecimalInput } from "../domain/utils";

export function Button({ variant = "default", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" | "soft" }) {
  return <button {...props} className={`button ${variant} ${className}`.trim()} />;
}

export function IconButton({ label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} aria-label={label} title={label} className={`icon-button ${className}`.trim()} />;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return <section className={`card ${interactive ? "interactive" : ""} ${className}`.trim()}>{children}</section>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ProgressBar({ value, max = 100, label, tone = "accent" }: { value: number; max?: number; label: string; tone?: "accent" | "protein" | "carbs" | "fat" | "good" }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? value / max * 100 : 0));
  return (
    <div className={`progress-bar ${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

const openDialogs: symbol[] = [];
let bodyOverflow = "";

export function Modal({ open, title, onClose, children, className = "" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const token = Symbol();
    if (!openDialogs.length) { bodyOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    openDialogs.push(token);
    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!scrimRef.current || !viewport) return;
      scrimRef.current.style.height = `${viewport.height}px`;
      scrimRef.current.style.top = `${viewport.offsetTop}px`;
      scrimRef.current.style.left = `${viewport.offsetLeft}px`;
      scrimRef.current.style.width = `${viewport.width}px`;
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    const preferred = ref.current?.querySelector<HTMLElement>("[autofocus]");
    const fallback = ref.current?.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), [tabindex='0']");
    (preferred || fallback)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== token) return;
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']"));
        if (!items.length) return;
        const first = items[0];
        const last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (!openDialogs.length) document.body.style.overflow = bodyOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-scrim" ref={scrimRef} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header><h2 id={titleId}>{title}</h2><IconButton label="Close" onClick={onClose}><X /></IconButton></header>
        <div className="modal-content">{children}</div>
      </div>
    </div>, document.body
  );
}

export function DecimalInput({ value, onValueChange, onFocus, onBlur, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & { value: number | null | undefined; onValueChange: (value: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : String(value));
  }, [value]);
  return <input {...props} type="text" inputMode="decimal" value={text} onFocus={(event) => { focused.current = true; onFocus?.(event); }} onChange={(event) => {
    const raw = event.target.value;
    setText(raw);
    if (!raw.trim()) onValueChange(null);
    else {
      const parsed = parseDecimalInput(raw);
      if (parsed != null) onValueChange(parsed);
    }
  }} onBlur={(event) => {
    focused.current = false;
    const parsed = parseDecimalInput(text);
    setText(parsed == null ? value == null ? "" : String(value) : String(parsed));
    onBlur?.(event);
  }} />;
}

export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`.trim()}><span>{label}</span>{children}{error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}</label>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => <button key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function Tabs({ items }: { items: Array<{ to: string; label: string; active: boolean; onClick: () => void }> }) {
  return <div className="tabs" role="tablist">{items.map((item) => <button key={item.to} role="tab" aria-selected={item.active} onClick={item.onClick}>{item.label}</button>)}</div>;
}
