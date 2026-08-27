import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArchiveRestore, Check, Cloud, Database, Download, ExternalLink, HardDrive, Info, LockKeyhole, MonitorCog, RefreshCw, Save, ShieldCheck, Upload, UserRound } from "lucide-react";
import { useAppStore } from "../app/AppStore";
import { Button, Card, Field, PageHeader, Segmented } from "../components/ui";
import { listBackups, loadBackupSnapshot, requestPersistentStorage, storageEstimate } from "../data/db";
import { validateSnapshot } from "../data/schema";
import { measurementsCsv, nutritionCsv, trainingCsv } from "../domain/export";
import type { GithubSyncConfig, RepsSnapshot } from "../domain/types";
import { activeProfile, formatShortDate, nowIso } from "../domain/utils";

const sections = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: MonitorCog },
  { id: "training", label: "Training", icon: RefreshCw },
  { id: "nutrition", label: "Nutrition", icon: Check },
  { id: "data", label: "Data & GitHub", icon: Database },
  { id: "about", label: "About & migration", icon: Info }
] as const;
type SectionId = typeof sections[number]["id"];

export function SettingsPage() {
  const { snapshot, mutate, syncConfig, setSyncConfig, syncMeta, pullGithub, pushGithub, importSnapshot, exportSnapshot, createCheckpoint, refreshOutbox } = useAppStore();
  const navigate = useNavigate();
  const params = useParams();
  const section = sections.some((item) => item.id === params.section) ? params.section as SectionId : "profile";
  const [backups, setBackups] = useState<Awaited<ReturnType<typeof listBackups>>>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persistent: boolean }>({ usage: 0, quota: 0, persistent: false });
  const [outbox, setOutbox] = useState(0);
  const [importCandidate, setImportCandidate] = useState<RepsSnapshot | null>(null);
  const [importError, setImportError] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshData = async () => { setBackups(await listBackups()); setStorage(await storageEstimate()); setOutbox(await refreshOutbox()); };
  useEffect(() => { if (section === "data") void refreshData(); }, [section]);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const report = snapshot.migrationReport;

  const saveProfile = async (form: HTMLFormElement) => {
    const data = new FormData(form); await mutate("Updated profile", (draft) => { const item = draft.profiles.find((value) => value.id === profile.id); if (item) Object.assign(item, { name: String(data.get("name") || profile.name), birthday: String(data.get("birthday") || "") || undefined, preferredUnit: String(data.get("unit")) as "kg" | "lb", locale: String(data.get("locale") || "en-GB"), timeZone: String(data.get("timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone), updatedAt: nowIso() }); }); setMessage("Profile saved locally");
  };
  const saveTraining = async (form: HTMLFormElement) => {
    const data = new FormData(form); await mutate("Updated training settings", (draft) => { draft.settings.restSeconds = Number(data.get("rest")) || 90; draft.settings.preferredRpeMode = String(data.get("effort")) as typeof draft.settings.preferredRpeMode; }); setMessage("Training defaults saved");
  };
  const saveNutrition = async (form: HTMLFormElement) => {
    const data = new FormData(form); await mutate("Updated nutrition settings", (draft) => { draft.settings.mealView = String(data.get("mealView")) as "meal" | "time"; const item = draft.profiles.find((value) => value.id === profile.id); if (item) { item.trackCarbs = data.get("carbs") === "on"; item.trackFat = data.get("fat") === "on"; item.updatedAt = nowIso(); } }); setMessage("Nutrition preferences saved");
  };
  const saveGithub = (form: HTMLFormElement) => {
    const data = new FormData(form); const next: GithubSyncConfig = { ...syncConfig, enabled: data.get("enabled") === "on", owner: String(data.get("owner") || ""), repo: String(data.get("repo") || ""), branch: String(data.get("branch") || "main"), path: String(data.get("path") || "state/reps-app-state-v2.json"), token: String(data.get("token") || ""), autoSync: data.get("autoSync") === "on" }; setSyncConfig(next); setMessage("GitHub settings saved on this device");
  };
  const chooseImport = async (file: File | undefined) => {
    setImportError(""); setImportCandidate(null); if (!file) return;
    try { const parsed = JSON.parse(await file.text()); setImportCandidate(validateSnapshot(parsed.state ?? parsed)); }
    catch (cause) { setImportError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const confirmImport = async () => {
    if (!importCandidate) return;
    try {
      await importSnapshot(importCandidate);
      setImportCandidate(null);
      setMessage("Import complete; the previous state is in automatic backups");
      await refreshData();
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const restoreBackup = async (id: string) => { try { const state = await loadBackupSnapshot(id); setImportCandidate(state); setImportError(""); } catch (cause) { setImportError(cause instanceof Error ? cause.message : String(cause)); } };
  const persist = async () => { const granted = await requestPersistentStorage(); setMessage(granted ? "Persistent browser storage is enabled" : "The browser did not grant persistent storage; exports and GitHub sync remain available"); await refreshData(); };
  const downloadCsv = (name: string, contents: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reps-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`${name[0].toUpperCase()}${name.slice(1)} CSV exported`);
  };
  const theme = snapshot.settings.appearance.theme;
  const density = snapshot.settings.appearance.density;

  return <div className="page settings-page">
    <PageHeader eyebrow="Settings" title="Control your workspace" description="Preferences, sync, backups, and migration evidence in one place." />
    <div className="settings-layout"><aside className="settings-nav">{sections.map((item) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => navigate(`/settings/${item.id}`)}><Icon />{item.label}</button>; })}<a href="./Reps.html"><ExternalLink />Open legacy Reps.</a></aside><div className="settings-content">
      {message && <div className="settings-message" role="status"><Check />{message}<button onClick={() => setMessage("")}>Dismiss</button></div>}
      {section === "profile" && <Card><div className="card-header"><div><h2>Profile</h2><small>Personal settings only; historical records retain their original values</small></div><UserRound /></div><form onSubmit={(event) => { event.preventDefault(); void saveProfile(event.currentTarget); }}><div className="settings-form form-grid"><Field label="Display name"><input name="name" defaultValue={profile.name} /></Field><Field label="Birthday"><input name="birthday" type="date" defaultValue={profile.birthday || ""} /></Field><Field label="Preferred load unit"><select name="unit" defaultValue={profile.preferredUnit}><option value="kg">Kilograms</option><option value="lb">Pounds</option></select></Field><Field label="Locale"><input name="locale" defaultValue={profile.locale} /></Field><Field label="Time zone" className="full"><input name="timezone" defaultValue={profile.timeZone} /></Field></div><div className="settings-footer"><Button type="submit" variant="primary"><Save />Save profile</Button></div></form></Card>}
      {section === "appearance" && <Card><div className="card-header"><div><h2>Appearance</h2><small>Applied instantly on this device</small></div><MonitorCog /></div><div className="settings-form form-stack"><Field label="Theme"><Segmented value={theme} label="Theme" options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(value) => void mutate("Changed theme", (draft) => { draft.settings.appearance.theme = value; })} /></Field><Field label="Information density"><Segmented value={density} label="Density" options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} onChange={(value) => void mutate("Changed density", (draft) => { draft.settings.appearance.density = value; })} /></Field><div className="appearance-preview"><span className="eyebrow">Preview</span><h3>Modern, quiet, and information-dense</h3><p>Clear hierarchy, calm color, 44px touch targets, and a mobile layout built around the current task.</p><div><span>Protein</span><b>168 / 180 g</b></div></div></div></Card>}
      {section === "training" && <Card><div className="card-header"><div><h2>Workout logging</h2><small>Defaults apply to new sets; recorded history stays unchanged</small></div><RefreshCw /></div><form onSubmit={(event) => { event.preventDefault(); void saveTraining(event.currentTarget); }}><div className="settings-form form-grid"><Field label="Default rest timer"><select name="rest" defaultValue={snapshot.settings.restSeconds}>{[60, 75, 90, 120, 150, 180].map((value) => <option key={value} value={value}>{value < 60 ? value : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`}</option>)}</select></Field><Field label="Effort scale"><select name="effort" defaultValue={snapshot.settings.preferredRpeMode}><option value="rpe">RPE</option><option value="rir">RIR</option><option value="both">RPE + RIR</option><option value="off">Hidden</option></select></Field></div><div className="settings-footer"><Button type="submit" variant="primary"><Save />Save training defaults</Button></div></form></Card>}
      {section === "nutrition" && <Card><div className="card-header"><div><h2>Nutrition logging</h2><small>Choose the detail you want without discarding source data</small></div><Check /></div><form onSubmit={(event) => { event.preventDefault(); void saveNutrition(event.currentTarget); }}><div className="settings-form form-stack"><Field label="Diary grouping"><select name="mealView" defaultValue={snapshot.settings.mealView}><option value="meal">Meals</option><option value="time">Chronological time</option></select></Field><label className="check-row"><input name="carbs" type="checkbox" defaultChecked={profile.trackCarbs} /><span><strong>Show carbohydrates</strong><small>Display carb progress in the diary and Today.</small></span></label><label className="check-row"><input name="fat" type="checkbox" defaultChecked={profile.trackFat} /><span><strong>Show fat</strong><small>Display fat progress where source values exist.</small></span></label></div><div className="settings-footer"><Button type="submit" variant="primary"><Save />Save nutrition preferences</Button></div></form></Card>}
      {section === "data" && <div className="stack"><Card><div className="card-header"><div><h2>GitHub sync</h2><small>Local-first merge with one versioned schema 2 state file</small></div><span className={`sync-card-icon ${syncMeta.status}`}><Cloud /></span></div><form onSubmit={(event) => { event.preventDefault(); saveGithub(event.currentTarget); }}><div className="settings-form form-grid"><label className="check-row full"><input name="enabled" type="checkbox" defaultChecked={syncConfig.enabled} /><span><strong>Enable GitHub sync</strong><small>The app keeps working offline and queues changes locally.</small></span></label><Field label="Owner"><input name="owner" autoComplete="off" defaultValue={syncConfig.owner} placeholder="GitHub username" /></Field><Field label="Repository"><input name="repo" autoComplete="off" defaultValue={syncConfig.repo} placeholder="fitness-data" /></Field><Field label="Branch"><input name="branch" defaultValue={syncConfig.branch} /></Field><Field label="State file"><input name="path" defaultValue={syncConfig.path} /></Field><Field label="Fine-grained token" hint="Stored only in this browser; never written into the snapshot." className="full"><input name="token" type="password" autoComplete="off" defaultValue={syncConfig.token} /></Field><label className="check-row full"><input name="autoSync" type="checkbox" defaultChecked={syncConfig.autoSync} /><span><strong>Automatic sync</strong><small>Push 15 seconds after a local change when online.</small></span></label></div><div className="settings-footer split"><div className="sync-detail"><span className={`status-dot ${syncMeta.status}`} /><span><strong>{syncMeta.message}</strong><small>{syncMeta.lastSyncAt ? `Last sync ${new Date(syncMeta.lastSyncAt).toLocaleString()}` : "Not synced yet"} · {outbox} queued change{outbox === 1 ? "" : "s"}</small></span></div><Button type="button" onClick={() => void pullGithub()}><Download />Pull & merge</Button><Button type="button" onClick={() => void pushGithub()}><Upload />Push & merge</Button><Button type="submit" variant="primary"><Save />Save connection</Button></div></form></Card>
      <Card><div className="card-header"><div><h2>Backups and storage</h2><small>Full-fidelity JSON plus readable CSV exports; automatic checkpoints stay in this browser</small></div><HardDrive /></div><div className="data-actions"><Button variant="primary" onClick={exportSnapshot}><Download />Export full backup</Button><Button onClick={() => downloadCsv("training", trainingCsv(snapshot))}><Download />Training CSV</Button><Button onClick={() => downloadCsv("nutrition", nutritionCsv(snapshot))}><Download />Nutrition CSV</Button><Button onClick={() => downloadCsv("measurements", measurementsCsv(snapshot))}><Download />Body CSV</Button><Button onClick={() => fileRef.current?.click()}><Upload />Inspect import</Button><input ref={fileRef} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void chooseImport(event.target.files?.[0])} /><Button onClick={async () => { await createCheckpoint("Manual checkpoint"); setMessage("Manual checkpoint created"); await refreshData(); }}><ShieldCheck />Create checkpoint</Button><Button onClick={() => void persist()}><LockKeyhole />Request persistent storage</Button></div><div className="storage-meter"><span><i style={{ width: `${storage.quota ? Math.max(.5, storage.usage / storage.quota * 100) : 0}%` }} /></span><div><strong>{(storage.usage / 1024 / 1024).toFixed(1)} MB used</strong><small>{storage.quota ? `${(storage.quota / 1024 / 1024).toFixed(0)} MB available · ` : ""}{storage.persistent ? "persistent storage enabled" : "browser-managed storage"}</small></div></div>{importError && <div className="data-error">{importError}</div>}{importCandidate && <div className="import-review"><Database /><span><strong>Valid Reps schema 2 backup</strong><small>{importCandidate.sessions.length} workouts · {importCandidate.foodEntries.length} food entries · {importCandidate.measurements.length} measurements. Import creates a checkpoint first.</small></span><Button variant="primary" onClick={() => void confirmImport()}>Confirm import</Button><Button onClick={() => setImportCandidate(null)}>Cancel</Button></div>}<div className="backup-list"><span className="eyebrow">Recent automatic checkpoints</span>{backups.slice(0, 8).map((backup) => <div key={backup.id}><ArchiveRestore /><span><strong>{backup.reason}</strong><small>{new Date(backup.createdAt).toLocaleString()} · {backup.snapshot ? "schema 2 snapshot" : "untouched legacy keys"}</small></span>{backup.snapshot && <Button className="small" onClick={() => void restoreBackup(backup.id)}>Review restore</Button>}</div>)}</div></Card></div>}
      {section === "about" && <div className="stack"><Card><div className="card-header"><div><h2>Reps. 2026</h2><small>Local-first training and nutrition journal</small></div><Info /></div><div className="about-copy"><p>The core app now uses a canonical, versioned data model. The original scripts, workbook-derived data, and legacy page remain available as a read-only safety path during the transition.</p><div className="about-links"><a href="./Reps.html">Open legacy app <ExternalLink /></a><a href="https://github.com" target="_blank" rel="noreferrer">GitHub <ExternalLink /></a></div></div></Card><Card><div className="card-header"><div><h2>Migration reconciliation</h2><small>Evidence captured when the canonical database was first created</small></div><Database /></div>{report ? <div className="migration-report"><div className="migration-verdict"><span className={report.unexplainedDrops ? "bad" : "good"}>{report.unexplainedDrops ? <Info /> : <Check />}</span><span><strong>{report.unexplainedDrops ? `${report.unexplainedDrops} unexplained drops` : "Reconciled with no unexplained drops"}</strong><small>Generated {new Date(report.createdAt).toLocaleString()}</small></span></div><div className="migration-counts">{Object.entries(report.destinationCounts).map(([label, count]) => <div key={label}><span>{label.replace(/([A-Z])/g, " $1")}</span><b>{count.toLocaleString()}</b></div>)}</div><div className="migration-sources">{report.sources.map((source) => <div key={source.name}><span className={source.present ? "present" : "missing"} />{source.name}<small>{source.checksum ? `${source.checksum.slice(0, 12)}…` : source.present ? "available" : "not found"}</small></div>)}</div>{report.issues.length > 0 && <details><summary>{report.issues.length} migration note{report.issues.length === 1 ? "" : "s"}</summary>{report.issues.map((issue, index) => <p key={index}><b>{issue.level}</b> · {issue.source}: {issue.message}</p>)}</details>}</div> : <div className="settings-form">No migration report is attached to this snapshot.</div>}</Card></div>}
    </div></div>
  </div>;
}
