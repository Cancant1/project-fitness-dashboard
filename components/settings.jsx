/* global React, RepsState, RepsIcons */
const { useState: useS, useEffect: useE } = React;
const SI = RepsIcons;

function SettingsView({ theme, setTheme, themes = [] }) {
  const { state, activeProfile, setActiveProfile, addProfile, deleteProfile } = RepsState.useApp();
  const [newProfileName, setNewProfileName] = useS("");
  const currentTheme = theme || document.documentElement.dataset.theme || "paper";
  const themeOptions = themes.length ? themes : [
    { id: "paper", label: "Paper", swatch: "linear-gradient(135deg,#f6f3ec,#e1dccf)" },
    { id: "cool", label: "Cool", swatch: "linear-gradient(135deg,#eef0f3,#c6ccd6)" },
    { id: "dark", label: "Dark", swatch: "linear-gradient(135deg,#0e0f12,#262931)" }
  ];

  const chooseTheme = (nextTheme) => {
    if (setTheme) {
      setTheme(nextTheme);
      return;
    }
    document.documentElement.dataset.theme = nextTheme;
    try { window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { theme: nextTheme } }, "*"); } catch (e) {}
  };

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Profiles · appearance · data</div>
        </div>
      </div>

      {/* PROFILES */}
      <div className="panel">
        <div className="panel-head">
          <h3>Profiles</h3>
          <span className="label">{state.profiles.length} {state.profiles.length === 1 ? "profile" : "profiles"}</span>
        </div>
        <div className="panel-body">
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:12}}>
            {state.profiles.map(p => {
              const isActive = p.id === activeProfile.id;
              const pAge = RepsState.ageFrom(p.birthday);
              return (
                <div key={p.id} className={`routine-card ${isActive ? "is-active" : ""}`}>
                  <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
                    <div style={{display:"flex", alignItems:"center", gap:10}}>
                      <span className="brand-mark" style={{background: isActive ? "var(--accent)" : "var(--ink)"}}>{p.name[0]}</span>
                      <div>
                        <div style={{fontWeight:500}}>{p.name}</div>
                        <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>
                          {pAge != null ? `${pAge} yrs` : "no birthday"} · {p.unit} · {p.preset}
                        </div>
                      </div>
                    </div>
                    {isActive ? <span className="chip accent">active</span> : (
                      <button className="btn ghost sm" onClick={() => setActiveProfile(p.id)}>Switch</button>
                    )}
                  </div>
                  {!isActive && state.profiles.length > 1 && (
                    <button className="btn ghost sm" style={{alignSelf:"flex-start"}}
                      onClick={async () => { if (await window.RepsUI.confirm(`Delete profile "${p.name}" and all of its data?`, { confirmLabel: "Delete profile" })) deleteProfile(p.id); }}><SI.X /> Delete</button>
                  )}
                </div>
              );
            })}
            <div className="routine-card" style={{borderStyle:"dashed", justifyContent:"center"}}>
              <div className="kpi-label">Add new profile</div>
              <div style={{display:"flex", gap:6}}>
                <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                  placeholder="Name"
                  style={{flex:1, padding:"0 8px", height:28, border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontSize:"var(--t-sm)"}}
                  onKeyDown={e => { if (e.key === "Enter" && newProfileName.trim()) { addProfile(newProfileName.trim()); setNewProfileName(""); } }} />
                <button className="btn primary sm" disabled={!newProfileName.trim()}
                  onClick={() => { if (newProfileName.trim()) { addProfile(newProfileName.trim()); setNewProfileName(""); } }}>
                  <SI.Plus /> Add
                </button>
              </div>
            </div>
          </div>
          <div className="kpi-label" style={{marginTop: 10, color:"var(--muted)"}}>
            Edit profile details, macros, and blocks in <strong style={{color:"var(--ink)"}}>Plan</strong>; phase and calorie targets live in <strong style={{color:"var(--ink)"}}>Body</strong>.
          </div>
        </div>
      </div>

      {/* PREFERENCES */}
      <div className="panel">
        <div className="panel-head">
          <h3>Preferences</h3>
          <span className="label">appearance · stored locally</span>
        </div>
        <div className="panel-body">
          <div style={{display:"grid", gridTemplateColumns:"1fr", gap: 14}}>
            <div>
              <div className="kpi-label" style={{marginBottom: 8}}>Theme mode</div>
              <div className="theme-grid">
                {themeOptions.map(t => (
                  <button key={t.id}
                    className={`theme-option ${currentTheme === t.id ? "is-on" : ""}`}
                    onClick={() => chooseTheme(t.id)}>
                    <span className="theme-swatch" style={{ background: t.swatch }}></span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="kpi-label" style={{marginTop: 8, fontSize:10}}>
                Theme choice is stored locally per device and synced status-bar color follows it.
              </div>
            </div>
          </div>
        </div>
      </div>

      <GitHubSyncPanel />

      {/* DATA & STORAGE */}
      <DataStoragePanel />
    </div>
  );
}

function downloadJson(filename, value) {
  const dataBlob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(dataBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function DataStoragePanel() {
  const app = RepsState.useApp();
  const { state } = app;
  const [copied, setCopied] = useS(false);
  const [importStatus, setImportStatus] = useS("");
  const blob = JSON.stringify(state);
  const bytes = blob.length;
  const profilesCount = state.profiles.length;
  const foodDays = state.profiles.reduce((s, p) => s + Object.keys(p.foodByDate || {}).length, 0);
  const weightEntries = state.profiles.reduce((s, p) => s + (p.weightEntries?.length || 0), 0);

  const exportData = () => {
    downloadJson(`reps-backup-${new Date().toISOString().slice(0, 10)}.json`, state);
  };

  const exportEffectiveData = () => {
    const effective = app.exportEffectiveState();
    downloadJson(`reps-effective-state-${new Date().toISOString().slice(0, 10)}.json`, effective);
  };

  const importData = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const next = parsed?.app === "reps-dashboard" && parsed.state ? parsed.state : parsed;
      if (!next?.profiles?.length) throw new Error("Backup JSON does not contain profiles.");
      if (!(await window.RepsUI.confirm("Import this dashboard state and replace the local state in this browser?", { confirmLabel: "Import" }))) return;
      app.replaceState(next);
      setImportStatus("Imported");
      setTimeout(() => setImportStatus(""), 2200);
    } catch (e) {
      setImportStatus(e.message || "Import failed");
    }
  };

  const copyData = async () => {
    try { await navigator.clipboard.writeText(blob); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  const clearData = async () => {
    if (await window.RepsUI.confirm("This wipes all local profiles, food log, custom exercises, sync metadata, and settings in this browser. Continue?", { confirmLabel: "Wipe data" })) {
      localStorage.removeItem("reps-app-state-v1");
      localStorage.removeItem("reps-github-sync-config-v1");
      localStorage.removeItem("reps-github-sync-meta-v1");
      location.reload();
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Data & storage</h3>
        <span className="label">local-only</span>
      </div>
      <div className="panel-body" style={{display:"flex", flexDirection:"column", gap: 12}}>
        <div className="kpi-label" style={{lineHeight: 1.6}}>
          <strong style={{color:"var(--ink)"}}>How stats are stored</strong>
          <div style={{marginTop: 4, color: "var(--muted)"}}>
            Reps. is local-first by default. GitHub sync stores the same app state in your private data repo when configured:
          </div>
          <ul style={{margin: "6px 0 0 18px", color: "var(--muted)", fontSize: 12, lineHeight: 1.7}}>
            <li><span className="mono" style={{color:"var(--ink)"}}>localStorage</span> key <span className="mono" style={{color:"var(--ink)"}}>reps-app-state-v1</span> — profiles, macros, food log, custom exercises, hidden items, block renames, weight entries, per-date Log overrides.</li>
            <li><span className="mono" style={{color:"var(--ink)"}}>Effective state export</span> — one-time migration snapshot that folds legacy workbook history into normal synced app state.</li>
            <li><span className="mono" style={{color:"var(--ink)"}}>GitHub token</span> — stored separately in this browser only; never included in backups or pushed state.</li>
          </ul>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 10, padding: "10px 12px", background:"var(--surface-2)", borderRadius:"var(--r-sm)"}}>
          <div>
            <div className="kpi-label">Profiles</div>
            <div className="mono" style={{fontSize:16, fontWeight:500}}>{profilesCount}</div>
          </div>
          <div>
            <div className="kpi-label">Food days logged</div>
            <div className="mono" style={{fontSize:16, fontWeight:500}}>{foodDays}</div>
          </div>
          <div>
            <div className="kpi-label">Weight entries</div>
            <div className="mono" style={{fontSize:16, fontWeight:500}}>{weightEntries}</div>
          </div>
          <div>
            <div className="kpi-label">Local size</div>
            <div className="mono" style={{fontSize:16, fontWeight:500}}>{(bytes / 1024).toFixed(1)} KB</div>
          </div>
        </div>

        <div style={{display:"flex", gap: 6, flexWrap:"wrap"}}>
          <button className="btn sm" onClick={exportData}><SI.Download /> Backup .json</button>
          <button className="btn sm" onClick={exportEffectiveData}><SI.Download /> Export effective state</button>
          <button className="btn sm" onClick={copyData}>{copied ? "Copied" : "Copy to clipboard"}</button>
          <label className="btn sm">
            Import .json
            <input type="file" accept="application/json,.json" style={{display:"none"}}
              onChange={e => { importData(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {importStatus && <span className="chip">{importStatus}</span>}
          <button className="btn ghost sm" style={{marginLeft:"auto", color:"var(--bad)"}} onClick={clearData}>
            <SI.X /> Wipe local data
          </button>
        </div>
      </div>
    </div>
  );
}

function GitHubSyncPanel() {
  const app = RepsState.useApp();
  const [form, setForm] = useS(app.syncConfig);
  const [tokenDraft, setTokenDraft] = useS(app.syncConfig.token || "");
  const [tokenCopied, setTokenCopied] = useS(false);
  const [tokenVisible, setTokenVisible] = useS(false);
  useE(() => {
    setForm(app.syncConfig);
    setTokenDraft(app.syncConfig.token || "");
  }, [app.syncConfig.owner, app.syncConfig.repo, app.syncConfig.branch, app.syncConfig.path, app.syncConfig.enabled, app.syncConfig.token, app.syncConfig.autoSync]);

  const patchForm = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const saveConfig = (enabled = app.syncConfig.enabled) => {
    const next = {
      ...app.syncConfig,
      owner: form.owner.trim(),
      repo: form.repo.trim(),
      branch: form.branch.trim() || "main",
      path: form.path.trim() || "state/reps-app-state.json",
      token: tokenDraft.trim(),
      autoSync: form.autoSync !== false,
      enabled
    };
    const changed = ["owner", "repo", "branch", "path", "token", "enabled", "autoSync"]
      .some(key => (app.syncConfig[key] ?? "") !== (next[key] ?? ""));
    if (changed) app.updateSyncConfig(next);
    return next;
  };
  const copyToken = async () => {
    if (!tokenDraft) return;
    try {
      await navigator.clipboard.writeText(tokenDraft);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1800);
    } catch (e) {
      setTokenCopied(false);
      alert("Copy failed. Select the visible token field and copy it manually.");
    }
  };
  const statusClass =
    app.syncStatus.state === "error" ? "warn" :
    app.syncStatus.state === "ok" ? "good" : "";
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>GitHub sync</h3>
        <span className={`chip ${statusClass}`.trim()}>
          {app.syncConfig.enabled ? "enabled" : "disabled"}
          {app.syncMeta.dirty ? " · unsynced" : ""}
        </span>
      </div>
      <div className="panel-body" style={{display:"flex", flexDirection:"column", gap: 12}}>
        <div className="kpi-label" style={{lineHeight: 1.6}}>
          Sync uses one private repo file and one token per device. Use a fine-grained GitHub token with Contents read/write for your private data repository.
          With auto-sync on, the app pulls the latest state when opened or focused and pushes about 20 seconds after your last change — no buttons needed.
          Push merges this browser with GitHub and retries SHA conflicts; Pull keeps unsynced local edits and marks the app unsynced until the next push.
        </div>
        <div style={{display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap: 8}}>
          <label>
            <div className="kpi-label">Owner</div>
            <input value={form.owner || ""} onChange={e => patchForm({ owner: e.target.value })}
              style={{width:"100%", height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)"}} />
          </label>
          <label>
            <div className="kpi-label">Private data repo</div>
            <input value={form.repo || ""} onChange={e => patchForm({ repo: e.target.value })}
              style={{width:"100%", height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)"}} />
          </label>
          <label>
            <div className="kpi-label">Branch</div>
            <input value={form.branch || ""} onChange={e => patchForm({ branch: e.target.value })}
              style={{width:"100%", height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)"}} />
          </label>
          <label>
            <div className="kpi-label">State path</div>
            <input value={form.path || ""} onChange={e => patchForm({ path: e.target.value })}
              style={{width:"100%", height:30, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)"}} />
          </label>
        </div>
        <label>
          <div className="kpi-label">Fine-grained token for this device</div>
          <div style={{display:"flex", gap: 6}}>
            <input type={tokenVisible ? "text" : "password"} value={tokenDraft} onChange={e => setTokenDraft(e.target.value)}
              placeholder="github_pat_..."
              spellCheck="false"
              autoComplete="off"
              style={{flex:1, minWidth:0, height:32, padding:"0 8px", border:"var(--hair)", borderRadius:"var(--r-sm)", background:"var(--bg)", fontFamily:"var(--font-mono)"}} />
            <button className="btn sm" type="button" onClick={() => setTokenVisible(v => !v)} disabled={!tokenDraft}>
              {tokenVisible ? "Hide" : "Show"}
            </button>
            <button className="btn sm" type="button" onClick={copyToken} disabled={!tokenDraft}>
              {tokenCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </label>
        <label style={{display:"flex", alignItems:"center", gap: 8, cursor:"pointer"}}>
          <input type="checkbox" checked={form.autoSync !== false}
            onChange={e => patchForm({ autoSync: e.target.checked })} />
          <span className="kpi-label" style={{margin: 0}}>
            Sync automatically — pull on open/focus, push ~20s after changes
          </span>
        </label>
        <div style={{display:"flex", gap: 6, flexWrap:"wrap", alignItems:"center"}}>
          <button className="btn primary sm" onClick={() => saveConfig(true)}><SI.Check /> Save & enable</button>
          <button className="btn sm" onClick={() => app.pullRemoteState({ config: saveConfig() })}>Pull</button>
          <button className="btn sm" onClick={() => app.pushRemoteState({ config: saveConfig() })}>Push</button>
          <button className="btn ghost sm" onClick={app.disableSync}>Disable</button>
          <span className={`chip ${statusClass}`.trim()}>{app.syncStatus.message}</span>
          {app.syncMeta.lastSyncAt && <span className="mono muted" style={{fontSize: 10}}>last sync {new Date(app.syncMeta.lastSyncAt).toLocaleString()}</span>}
        </div>
      </div>
    </div>
  );
}

window.RepsSettings = SettingsView;
