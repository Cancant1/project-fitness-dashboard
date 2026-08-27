import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Apple,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Dumbbell,
  Home,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Utensils,
  Weight,
  X
} from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { activeProfile, todayIso } from "../../domain/utils";
import { IconButton, Modal } from "../ui";

const nav = [
  { to: "/today", label: "Today", icon: Home },
  { to: "/train", label: "Train", icon: Dumbbell },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/nutrition", label: "Nutrition", icon: Utensils },
  { to: "/plan", label: "Plan", icon: CalendarDays }
];

const titleFor = (path: string) => {
  if (path.includes("/train/live")) return "Active workout";
  if (path.includes("/train/session")) return "Session";
  if (path.includes("/train/programs")) return "Programs";
  if (path.includes("/train/exercises")) return "Exercise library";
  if (path.includes("/progress/exercise")) return "Exercise progress";
  if (path.includes("/nutrition/foods")) return "Foods & meals";
  if (path.includes("/nutrition/energy")) return "Energy & goals";
  if (path.startsWith("/settings")) return "Settings";
  return nav.find((item) => path.startsWith(item.to))?.label || "Reps.";
};

export function AppShell() {
  const { snapshot, syncMeta } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobileMore, setMobileMore] = useState(false);
  const [query, setQuery] = useState("");
  const profile = snapshot ? activeProfile(snapshot) : null;
  const activeSession = snapshot?.sessions.find((session) => session.profileId === profile?.id && !session.deletedAt && (session.status === "draft" || session.status === "inProgress"));
  const activeIsLive = activeSession?.status === "inProgress" && activeSession.actualDate === todayIso();
  const activeAction = activeIsLive ? "Resume active workout" : "Open workout draft";
  const routeTitle = location.pathname.includes("/train/live") && activeSession
    ? activeIsLive ? "Active workout" : activeSession.actualDate < todayIso() ? "Past workout draft" : "Workout draft"
    : titleFor(location.pathname);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const searchResults = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    const actions = [
      { type: "Action", label: activeSession ? activeAction : "Start a workout", detail: activeSession?.title || "Train", to: activeSession ? `/train/live/${activeSession.id}` : "/train" },
      { type: "Action", label: "Add food", detail: "Nutrition diary", to: "/nutrition?add=food" },
      { type: "Action", label: "Log weight", detail: "Bodyweight check-in", to: "/nutrition/energy?add=weight" }
    ];
    const exercises = snapshot.exercises.filter((item) => !item.deletedAt && !item.archived).map((item) => ({ type: "Exercise", label: item.name, detail: item.movement, to: `/progress/exercise/${item.id}` }));
    const sessions = snapshot.sessions.filter((item) => !item.deletedAt).map((item) => ({ type: "Session", label: item.title, detail: item.actualDate, to: `/train/session/${item.id}` }));
    const foods = snapshot.foods.filter((item) => !item.deletedAt && !item.archived).map((item) => ({ type: "Food", label: item.name, detail: `${Math.round(item.kcalPerServing)} kcal`, to: `/nutrition/foods?food=${item.id}` }));
    return [...actions, ...exercises, ...sessions, ...foods]
      .filter((item) => !needle || `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(needle))
      .slice(0, 14);
  }, [snapshot, query, activeSession, activeAction]);

  const go = (to: string) => {
    navigate(to);
    setCommandOpen(false);
    setQuickOpen(false);
    setMobileMore(false);
    setQuery("");
  };

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <NavLink to="/today" className="brand" aria-label="Reps. Today"><span>R</span><strong>Reps.</strong><small>2026</small></NavLink>
        <nav aria-label="Primary navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            return <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}><Icon /><span>{item.label}</span></NavLink>;
          })}
        </nav>
        <div className="side-nav-foot">
          <button className="sync-summary" onClick={() => navigate("/settings/data")}>
            <span className={`status-dot ${syncMeta.status}`} />
            <span><strong>{syncMeta.dirty ? "Saved locally" : syncMeta.status === "synced" ? "Synced" : "Local-first"}</strong><small>{syncMeta.message}</small></span>
            <ChevronRight />
          </button>
          <NavLink to="/settings" className="nav-link"><Settings /><span>Settings</span></NavLink>
        </div>
      </aside>

      <div className="app-main">
        <header className="top-bar">
          <div className="mobile-brand"><span>R</span><strong>Reps.</strong></div>
          <div className="route-title"><span>{routeTitle}</span>{activeSession && !location.pathname.includes("/train/live") && <button onClick={() => navigate(`/train/live/${activeSession.id}`)}>{activeIsLive && <span className="live-dot" />}{activeIsLive ? "Resume" : "Open draft"} {activeSession.title}</button>}</div>
          <button className="command-trigger" onClick={() => setCommandOpen(true)}><Search /><span>Search anything</span><kbd>⌘K</kbd></button>
          <div className="top-actions">
            <button className="profile-trigger" onClick={() => navigate("/settings/profile")}><span>{profile?.name?.slice(0, 1).toUpperCase() || "R"}</span><small>{profile?.name}</small></button>
            <IconButton label="Quick add" className="quick-add" onClick={() => setQuickOpen(true)}><Plus /></IconButton>
          </div>
        </header>

        {activeSession && !location.pathname.includes("/train/live") && (
          <button className="active-session-strip" onClick={() => navigate(`/train/live/${activeSession.id}`)}>
            <span className="active-session-icon"><Dumbbell /></span>
            <span><small>{activeIsLive ? "Workout in progress" : activeSession.actualDate < todayIso() ? "Past workout draft" : "Workout draft"}</small><strong>{activeSession.title}</strong></span>
            <span className="active-session-resume">{activeIsLive ? "Resume" : "Open"} <ChevronRight /></span>
          </button>
        )}

        <main className="page-canvas"><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map((item) => {
          const Icon = item.icon;
          return <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? "active" : ""}><Icon /><span>{item.label}</span></NavLink>;
        })}
        <button onClick={() => setMobileMore(true)}><MoreHorizontal /><span>More</span></button>
      </nav>

      <Modal open={commandOpen} title="Search Reps." onClose={() => { setCommandOpen(false); setQuery(""); }} className="command-modal">
        <div className="command-search"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Exercises, sessions, foods, actions…" /></div>
        <div className="command-results">
          {searchResults.map((result) => <button key={`${result.type}-${result.to}-${result.label}`} onClick={() => go(result.to)}><span className="result-icon">{result.type === "Exercise" ? <Dumbbell /> : result.type === "Food" ? <Apple /> : result.type === "Session" ? <Check /> : <Sparkles />}</span><span><strong>{result.label}</strong><small>{result.type} · {result.detail}</small></span><ChevronRight /></button>)}
          {!searchResults.length && <div className="command-empty">No matches. Try an exercise, date, food, or action.</div>}
        </div>
      </Modal>

      <Modal open={quickOpen} title="Quick add" onClose={() => setQuickOpen(false)} className="quick-modal">
        <div className="quick-grid">
          <button onClick={() => go(activeSession ? `/train/live/${activeSession.id}` : "/train")}><span><Dumbbell /></span><strong>{activeSession ? activeIsLive ? "Resume workout" : "Open workout draft" : "Start workout"}</strong><small>{activeSession?.title || "Routine or empty"}</small></button>
          <button onClick={() => go("/nutrition?add=food")}><span><Utensils /></span><strong>Add food</strong><small>Search or quick add</small></button>
          <button onClick={() => go("/nutrition/energy?add=weight")}><span><Weight /></span><strong>Log weight</strong><small>Fast check-in</small></button>
          <button onClick={() => go("/plan")}><span><CalendarDays /></span><strong>Open plan</strong><small>Schedule and blocks</small></button>
        </div>
      </Modal>

      <Modal open={mobileMore} title="More" onClose={() => setMobileMore(false)}>
        <div className="mobile-more-list">
          <button onClick={() => go("/train/programs")}><CalendarDays />Programs<ChevronRight /></button>
          <button onClick={() => go("/train/exercises")}><Dumbbell />Exercise library<ChevronRight /></button>
          <button onClick={() => go("/nutrition/foods")}><Apple />Foods & meals<ChevronRight /></button>
          <button onClick={() => go("/settings")}><Settings />Settings<ChevronRight /></button>
          <a href="./Reps.html"><CircleUserRound />Legacy Reps.<ChevronRight /></a>
        </div>
      </Modal>

      <div className="sr-only" aria-live="polite">{syncMeta.message}</div>
    </div>
  );
}
