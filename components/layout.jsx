/* global React, RepsIcons */
const { useState, useEffect, useRef } = React;
const I = RepsIcons;

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: I.Dashboard, kbd: "1" },
  { id: "log",       label: "Log",       icon: I.Log,       kbd: "2" },
  { id: "sessions",  label: "Sessions",  icon: I.Log,       kbd: "3" },
  { id: "strength",  label: "Strength",  icon: I.Trend,     kbd: "4" },
  { id: "routines",  label: "Routines",  icon: I.Routine,   kbd: "5" },
  { id: "exercises", label: "Exercises", icon: I.Exercises, kbd: "6" },
  { id: "body",      label: "Body",      icon: I.Body,      kbd: "7" },
  { id: "plan",      label: "Plan",      icon: I.Plan,      kbd: "8" },
  { id: "export",    label: "AI Export", icon: I.Export,    kbd: "9" }
];

function Sidebar({ view, setView }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">R</span>
        <span className="brand-name">Reps<span className="dot">.</span></span>
        <span className="brand-meta">v0.3</span>
      </div>
      <nav className="nav">
        {NAV_ITEMS.map(item => {
          const Ico = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "is-active" : ""}`}
              onClick={() => setView(item.id)}>
              <span className="nav-icon"><Ico /></span>
              <span>{item.label}</span>
              <span className="nav-kbd">{item.kbd}</span>
            </button>
          );
        })}
      </nav>
      <div className="nav-section">Workspace</div>
      <button
        className={`nav-item ${view === "settings" ? "is-active" : ""}`}
        onClick={() => setView("settings")}>
        <span className="nav-icon"><I.Settings /></span>
        <span>Settings</span>
        <span className="nav-kbd">0</span>
      </button>
      <div className="sidebar-foot">
        <span className="kbd">⌘</span><span className="kbd">K</span>
        <span>command</span>
      </div>
    </aside>
  );
}

function TopBar({ view, setView }) {
  const labels = {
    dashboard: "Dashboard", log: "Log", routines: "Routines",
    exercises: "Exercises", body: "Body", plan: "Plan", export: "AI Export",
    settings: "Settings", sessions: "Sessions", strength: "Strength"
  };
  const app = window.RepsState?.useApp?.();
  const profile = app?.activeProfile;
  return (
    <header className="topbar">
      <div className="crumb">
        <span>Reps</span>
        <span className="sep">/</span>
        <span className="here">{labels[view]}</span>
      </div>
      <div className="cmd">
        <span className="icon"><I.Search /></span>
        <input placeholder="Search exercises, sessions, notes…" />
        <span className="kbd">⌘K</span>
      </div>
      <div className="topbar-right">
        {profile && <ProfileSwitcher app={app} profile={profile} setView={setView} />}
        <span className="btn ghost sm" style={{cursor: "default", pointerEvents: "none"}}>
          <span className="icon"><I.Calendar /></span>
          <span className="mono">{(window.RepsData?.TODAY ? new Date(window.RepsData.TODAY + "T00:00:00Z").toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "")}</span>
        </span>
        <button className="btn primary sm" onClick={() => setView("log")}>
          <span className="icon"><I.Plus /></span>
          Log workout
        </button>
      </div>
    </header>
  );
}

function ProfileSwitcher({ app, profile, setView }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const profiles = app?.state?.profiles || [];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const switchProfile = (id) => {
    app?.setActiveProfile?.(id);
    setOpen(false);
  };

  return (
    <div className="profile-switcher" ref={ref}>
      <button
        className="btn ghost sm profile-trigger"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch profile">
        <span className="brand-mark profile-avatar">{profile.name[0]}</span>
        <span className="profile-trigger-name">{profile.name}</span>
        <span className="icon profile-chevron"><I.ChevronDown /></span>
      </button>
      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-title">Switch profile</div>
          {profiles.map(p => {
            const isActive = p.id === profile.id;
            return (
              <button
                key={p.id}
                className={`profile-option ${isActive ? "is-active" : ""}`}
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => switchProfile(p.id)}>
                <span className="brand-mark profile-avatar">{p.name[0]}</span>
                <span className="profile-option-copy">
                  <span className="profile-option-name">{p.name}</span>
                  <span className="profile-option-meta">{p.unit || "kg"} · {p.preset || "maintain"}</span>
                </span>
                {isActive && <span className="chip accent">active</span>}
              </button>
            );
          })}
          <div className="profile-menu-foot">
            <button className="btn ghost sm" onClick={() => { setOpen(false); setView("settings"); }}>
              <I.Settings /> Manage profiles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Mobile-only top app bar + slide-in navigation drawer (shown <= 980px via CSS).
function MobileNav({ view, setView }) {
  const [open, setOpen] = useState(false);
  const app = window.RepsState?.useApp?.();
  const profile = app?.activeProfile;
  const labels = {
    dashboard: "Dashboard", log: "Log", routines: "Routines",
    exercises: "Exercises", body: "Body", plan: "Plan", export: "AI Export",
    settings: "Settings", sessions: "Sessions", strength: "Strength"
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const go = (id) => { setView(id); setOpen(false); };

  return (
    <>
      <header className="m-appbar">
        <button className="m-icon-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <I.Menu />
        </button>
        <div className="m-appbar-title">
          <span className="m-appbar-brand">Reps<span className="dot">.</span></span>
          <span className="m-appbar-here">{labels[view]}</span>
        </div>
        <button className="m-icon-btn m-appbar-log" aria-label="Log workout" onClick={() => go("log")}>
          <I.Plus />
        </button>
      </header>

      <div
        className={`m-drawer-scrim ${open ? "is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"></div>

      <aside className={`m-drawer ${open ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Main navigation">
        <div className="m-drawer-head">
          <div className="brand m-drawer-brand">
            <span className="brand-mark">R</span>
            <span className="brand-name">Reps<span className="dot">.</span></span>
            <span className="brand-meta">v0.3</span>
          </div>
          <button className="m-icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}><I.X /></button>
        </div>

        {profile && (
          <button className="m-drawer-profile" onClick={() => go("settings")}>
            <span className="brand-mark profile-avatar">{profile.name[0]}</span>
            <span className="m-drawer-profile-copy">
              <span className="m-drawer-profile-name">{profile.name}</span>
              <span className="m-drawer-profile-meta">{profile.unit || "kg"} · {profile.preset || "maintain"}</span>
            </span>
            <span className="icon m-drawer-profile-chev"><I.Chevron /></span>
          </button>
        )}

        <nav className="nav m-drawer-nav">
          {NAV_ITEMS.map(item => {
            const Ico = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id ? "is-active" : ""}`}
                onClick={() => go(item.id)}>
                <span className="nav-icon"><Ico /></span>
                <span>{item.label}</span>
              </button>
            );
          })}
          <div className="nav-section">Workspace</div>
          <button
            className={`nav-item ${view === "settings" ? "is-active" : ""}`}
            onClick={() => go("settings")}>
            <span className="nav-icon"><I.Settings /></span>
            <span>Settings</span>
          </button>
        </nav>
      </aside>
    </>
  );
}

window.RepsLayout = { Sidebar, TopBar, MobileNav, NAV_ITEMS };
