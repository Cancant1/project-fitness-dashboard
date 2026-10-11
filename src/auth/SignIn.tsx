import { useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../data/supabase";

export function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
    setBusy(false);
    if (result.error) {
      setMessage({ kind: "error", text: result.error.message });
    } else if (mode === "up" && !result.data.session) {
      setMessage({ kind: "info", text: "Check your email and tap the confirmation link, then sign in here." });
      setMode("in");
    }
  }

  return (
    <main className="page" style={{ maxWidth: 420, justifyContent: "center", minHeight: "100dvh", paddingBottom: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="side-logo" style={{ width: 52, height: 52, borderRadius: 15, fontSize: 24 }}>R</div>
        <h1 className="large-title" style={{ marginTop: 16 }}>Reps</h1>
        <p className="muted">Training, food and weight — synced across your devices.</p>
      </div>

      {!supabaseConfigured && (
        <p className="card card-pad" style={{ color: "var(--bad)" }}>
          The app has no Supabase keys. Fill in .env.local and restart the dev server.
        </p>
      )}

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="list" style={{ padding: "0 4px 0 16px" }}>
          <label className="row" htmlFor="email">
            <span style={{ width: 84 }}>Email</span>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ flex: 1, border: 0, background: "transparent", outline: "none", minWidth: 0, height: 44 }} />
          </label>
          <label className="row" htmlFor="password">
            <span style={{ width: 84 }}>Password</span>
            <input id="password" type="password" required minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1, border: 0, background: "transparent", outline: "none", minWidth: 0, height: 44 }} />
          </label>
        </div>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} style={{ fontSize: 15, margin: "0 4px", color: message.kind === "error" ? "var(--bad)" : "var(--fg2)" }}>
            {message.text}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy} type="submit">
          {busy ? "One moment…" : mode === "in" ? "Sign In" : "Create Account"}
        </button>
        <button className="btn btn-plain" type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMessage(null); }}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}
