import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../app/AppStore";
import { previewLegacyGithub } from "../data/github";
import type { RepsSnapshot } from "../domain/types";
import { Button, Card, Field } from "./ui";

export function LegacyRecovery() {
  const { syncConfig, importSnapshot } = useAppStore();
  const requestVersion = useRef(0);
  const [path, setPath] = useState("state/reps-app-state.json");
  const [preview, setPreview] = useState<RepsSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { requestVersion.current += 1; setPreview(null); setMessage(""); setError(""); }, [syncConfig, path]);

  const inspect = async () => {
    const version = ++requestVersion.current;
    setBusy(true); setError(""); setMessage(""); setPreview(null);
    try {
      const found = await previewLegacyGithub(syncConfig, path.trim());
      if (version === requestVersion.current) setPreview(found);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const recover = async () => {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      await importSnapshot(preview, "recover");
      setMessage("Profiles imported. Choose a profile in Settings → Profile, then use Push & merge in Data & GitHub to share the recovered journal with your other device.");
      setPreview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <Card>
    <div className="card-header"><div><h2>Missing your original profiles?</h2><small>The old app stored its history in a separate GitHub file.</small></div></div>
    <div className="settings-form form-stack">
      <p>Preview that file using your saved GitHub connection, then add its profiles and missing records. Existing records and the original file are kept.</p>
      <Field label="Original state file"><input value={path} disabled={busy} onChange={(event) => setPath(event.target.value)} /></Field>
      <Button onClick={() => void inspect()} disabled={busy}>{busy ? "Working…" : "Find original profiles"}</Button>
      {error && <p className="data-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {preview && <div className="stack">
        <strong>Found: {preview.profiles.map((profile) => profile.name).join(", ")}</strong>
        {preview.profiles.map((profile) => <p key={profile.id}>{profile.name}: {preview.sessions.filter((item) => item.profileId === profile.id).length} workouts · {preview.foodEntries.filter((item) => item.profileId === profile.id).length} food entries · {preview.measurements.filter((item) => item.profileId === profile.id).length} measurements</p>)}
        <p>A backup is created before importing. Matching existing records take precedence; the full original data is also preserved in your backup export.</p>
        <Button variant="primary" onClick={() => void recover()} disabled={busy}>Import these profiles</Button>
        <Button onClick={() => setPreview(null)} disabled={busy}>Cancel</Button>
      </div>}
    </div>
  </Card>;
}
