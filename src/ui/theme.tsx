import { useEffect, useState, type ReactElement } from "react";

// Appearance: System / Light / Dark. Stored per device; applied as data-theme on <html> (styles.css reads it).

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "reps-theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0D0E11" : "#F4F5F7"));
}

export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  // Keep every switch on screen in step (sidebar + phone header).
  useEffect(() => {
    const on = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener(KEY, on);
    return () => window.removeEventListener(KEY, on);
  }, []);
  const set = (c: ThemeChoice) => {
    applyTheme(c);
    try { localStorage.setItem(KEY, c); } catch { /* private mode: still applies for this visit */ }
    window.dispatchEvent(new CustomEvent(KEY, { detail: c }));
  };
  return [choice, set];
}

const OPTIONS: { value: ThemeChoice; label: string; icon: ReactElement }[] = [
  { value: "system", label: "System", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2.5" /><path d="M8 20h8M12 16v4" /></svg> },
  { value: "light", label: "Light", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg> },
  { value: "dark", label: "Dark", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg> }
];

/** Three-way appearance switch. `compact` shows icons only (phone header). */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useTheme();
  return (
    <div className={`k-seg theme-switch ${compact ? "compact" : ""}`} role="group" aria-label="Appearance">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={choice === o.value} aria-label={o.label} title={o.label} onClick={() => setChoice(o.value)}>
          {o.icon}{!compact && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
