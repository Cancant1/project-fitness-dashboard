/* global React, ReactDOM, RepsLayout, RepsDashboard, RepsLog, RepsViews */
const { useState, useEffect } = React;

// Minimal theming state hook (replaces the old prototype tweaks-panel host
// integration; persistence is handled by setTweak in App via localStorage).
function useTweaks(defaults) {
  const [values, setValues] = useState(defaults);
  const setTweak = (keyOrEdits, val) => {
    const edits = typeof keyOrEdits === "object" && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues(prev => ({ ...prev, ...edits }));
  };
  return [values, setTweak];
}

// Capture the static shell routine so imported private state can override it cleanly.
window.__DEFAULT_PLANNED_ROUTINE = window.__DEFAULT_PLANNED_ROUTINE || JSON.parse(JSON.stringify(window.PLANNED_ROUTINE || []));

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d97a3d",
  "theme": "paper",
  "density": "compact",
  "showCommandBar": true,
  "showWeekStrip": true,
  "sidebarStyle": "rail"
}/*EDITMODE-END*/;

const TWEAK_STORE_KEY = "reps-tweaks-v1";

const ACCENT_PRESETS = {
  "#d97a3d": { h: 50, c: 0.16 },    // warm orange
  "#7a8b3d": { h: 110, c: 0.13 },   // moss
  "#3d7aa8": { h: 245, c: 0.14 },   // signal blue
  "#a83d6e": { h: 0, c: 0.16 }      // magenta
};

const THEME_OPTIONS = [
  { id: "paper", label: "Paper", swatch: "linear-gradient(135deg,#f6f3ec,#e1dccf)" },
  { id: "cool", label: "Cool", swatch: "linear-gradient(135deg,#eef0f3,#c6ccd6)" },
  { id: "dark", label: "Dark", swatch: "linear-gradient(135deg,#0e0f12,#262931)" },
  { id: "midnight", label: "Midnight", swatch: "linear-gradient(135deg,#080b12,#12394a)" },
  { id: "liquid", label: "Liquid Glass", swatch: "linear-gradient(135deg,#ecf8ff,#b9d8e7 55%,#ffffff)" },
  { id: "soft-ui", label: "Soft UI", swatch: "linear-gradient(135deg,#f2f1f6,#d8d5e1)" },
  { id: "dopamine", label: "Dopamine", swatch: "linear-gradient(135deg,#fff36d,#ff6bcb 50%,#23d3ee)" },
  { id: "ember", label: "Ember", swatch: "linear-gradient(135deg,#fff4e7,#d4492f)" }
];

const DARK_THEME_IDS = new Set(["dark", "midnight"]);

function loadStoredTweaks(defaults) {
  try {
    const raw = localStorage.getItem(TWEAK_STORE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch (e) {
    return defaults;
  }
}

function activeRoutineDaysForProfile(profile) {
  const routines = profile?.routines || [];
  const activeRoutineId = profile?.activeRoutineId;
  const activeRoutine = routines.find(r => r.id === activeRoutineId) || routines[0];
  if (activeRoutine && activeRoutine.days && activeRoutine.days.length > 0) {
    return activeRoutine.days;
  }
  return [];
}

function syncActiveProfileGlobals(profile) {
  window.__repsLocalSessions = profile?.loggedSessions || [];
  window.__repsUseWorkbookHistory = profile?.hasHistory !== false;
  window.__repsSessionEdits = profile?.sessionEdits || {};
  window.__repsDeletedSessionIds = profile?.deletedSessionIds || [];
  window.__repsExerciseRenames = profile?.exerciseRenames || {};
  window.__repsCustomExercises = profile?.customExercises || [];
  window.__repsHiddenExercises = profile?.hiddenExercises || [];
  window.__repsLocalWeightEntries = profile?.weightEntries || [];
  window.__repsPlannedRoutine = activeRoutineDaysForProfile(profile);
  window.PLANNED_ROUTINE = window.__repsPlannedRoutine;
}

function applyTweaks(t) {
  const root = document.documentElement;
  root.dataset.theme = t.theme;
  root.dataset.density = t.density;

  const a = ACCENT_PRESETS[t.accent];
  if (a) {
    const dark = DARK_THEME_IDS.has(t.theme);
    root.style.setProperty("--accent", `oklch(67% ${a.c} ${a.h})`);
    root.style.setProperty("--accent-ink", `oklch(${dark ? 75 : 40}% ${a.c * 0.85} ${a.h})`);
    root.style.setProperty("--accent-soft", `oklch(${dark ? 28 : 94}% ${dark ? a.c * 0.4 : 0.04} ${a.h})`);
    root.style.setProperty("--accent-line", `oklch(${dark ? 38 : 86}% ${a.c * 0.5} ${a.h})`);
  }

  // Keep the iOS Safari status-bar / theme-color in sync with the active theme.
  try {
    const meta = document.getElementById("theme-color");
    if (meta) {
      const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
      if (bg) meta.setAttribute("content", bg);
    }
  } catch (e) {}
}

function App() {
  const [view, setView] = useState("dashboard");
  const [t, setRawTweak] = useTweaks(loadStoredTweaks(TWEAK_DEFAULTS));
  const setTweak = (keyOrEdits, val) => {
    const edits = typeof keyOrEdits === "object" && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setRawTweak(edits);
    try { localStorage.setItem(TWEAK_STORE_KEY, JSON.stringify({ ...t, ...edits })); } catch (e) {}
  };
  const appState = window.RepsState.useApp();
  const activeProfile = appState.activeProfile;

  syncActiveProfileGlobals(activeProfile);

  // Expose active profile's data to helpers.js and sync the active routine
  useEffect(() => {
    syncActiveProfileGlobals(activeProfile);
  }, [activeProfile]);

  useEffect(() => { applyTweaks(t); }, [t.accent, t.theme, t.density]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const map = { "1":"dashboard","2":"log","3":"sessions","4":"strength","5":"routines","6":"exercises","7":"body","8":"plan","9":"export","0":"settings" };
      if (map[e.key]) setView(map[e.key]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const { Sidebar, TopBar, MobileNav } = RepsLayout;
  const { Routines, Exercises, Body, Plan, ExportView } = RepsViews;
  const Settings = window.RepsSettings;
  const chooseTheme = (theme) => setTweak("theme", theme);

  return (
    <>
      <div className="shell">
        <Sidebar view={view} setView={setView} />
        <div className="main">
          <MobileNav view={view} setView={setView} />
          <TopBar view={view} setView={setView} />
          {view === "dashboard" && <RepsDashboard setView={setView} />}
          {view === "log"       && <RepsLog />}
          {view === "sessions"  && window.RepsSessions && <window.RepsSessions setView={setView} />}
          {view === "strength"  && window.RepsStrengthView && <window.RepsStrengthView />}
          {view === "routines"  && <Routines />}
          {view === "exercises" && <Exercises />}
          {view === "body"      && <Body />}
          {view === "plan"      && <Plan />}
          {view === "export"    && <ExportView />}
          {view === "settings"  && <Settings theme={t.theme} setTheme={chooseTheme} themes={THEME_OPTIONS} />}
        </div>
      </div>
    </>
  );
}

const { AppStateProvider } = window.RepsState;

ReactDOM.createRoot(document.getElementById("root")).render(
  <AppStateProvider>
    <App />
  </AppStateProvider>
);
