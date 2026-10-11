import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSyncState } from "../data/store";
import { supabase } from "../data/supabase";
import { ThemeSwitch } from "../ui/theme";
import { FoodIcon, HistoryIcon, PlanIcon, ProgressIcon, RecordsIcon, TodayIcon, TrainIcon, WeightIcon } from "../ui/icons";

const TABS = [
  { to: "/", label: "Today", Icon: TodayIcon, end: true },
  { to: "/train", label: "Train", Icon: TrainIcon },
  { to: "/progress", label: "Progress", Icon: ProgressIcon },
  { to: "/food", label: "Food", Icon: FoodIcon },
  { to: "/plan", label: "Plan", Icon: PlanIcon }
];

export function Shell({ email }: { email: string }) {
  const { pathname } = useLocation();
  // A new page starts at the top (the router keeps the old scroll position otherwise).
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="side-brand">
          <img className="side-logo" src="./icon.svg" alt="" />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Reps</span>
            <span style={{ fontSize: 12, color: "var(--fg2)", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</span>
          </div>
        </div>
        <span className="side-group" style={{ paddingTop: 8 }}>Training</span>
        <SideLink to="/" end Icon={TodayIcon}>Today</SideLink>
        <SideLink to="/train" Icon={TrainIcon}>Workouts</SideLink>
        <SideLink to="/progress" Icon={ProgressIcon}>Progress</SideLink>
        <SideLink to="/records" Icon={RecordsIcon}>Records</SideLink>
        <SideLink to="/plan" Icon={PlanIcon}>Plan</SideLink>
        <span className="side-group">Body</span>
        <SideLink to="/food" Icon={FoodIcon}>Food</SideLink>
        <SideLink to="/weight" Icon={WeightIcon}>Weight &amp; energy</SideLink>
        <span className="side-group">Archive</span>
        <SideLink to="/history" Icon={HistoryIcon}>History</SideLink>
        <div className="side-foot">
          <ThemeSwitch compact />
          <SyncBadge />
          <button className="btn btn-plain btn-sm" style={{ justifyContent: "flex-start", padding: 0 }} onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="main">
        <Outlet />
      </div>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab">
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SideLink({ to, end, Icon, children }: { to: string; end?: boolean; Icon: typeof TodayIcon; children: React.ReactNode }) {
  return (
    <NavLink to={to} end={end} className="side-link">
      <Icon size={17} />
      {children}
    </NavLink>
  );
}

export function SyncBadge() {
  const s = useSyncState();
  const text =
    s.kind === "syncing" ? "Syncing…" :
    s.kind === "offline" ? (s.pending ? `Offline · ${s.pending} to sync` : "Offline · saved on this device") :
    s.kind === "error" ? `Not synced · retrying` :
    s.pending ? `${s.pending} to sync` : "Synced";
  const color = s.kind === "error" ? "var(--bad)" : "var(--fg2)";
  return <span role="status" style={{ fontSize: 12, color }} title={s.kind === "error" ? s.message : undefined}>{text}</span>;
}
