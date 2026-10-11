import { useCallback, useEffect, useMemo, useState } from "react";
import { useRows, useStore } from "../data/store";
import { supabase, supabaseConfigured } from "../data/supabase";
import { addDays, fmtNum, fmtShortDate, todayIso } from "../lib/format";
import { hashIngestToken, ingestEndpoint, newIngestToken } from "../lib/ingestToken";
import { Card, Label, PageHead, Pill, Stat } from "../ui/kit";
import { CheckIcon, CopyIcon, PlusIcon } from "../ui/icons";
import "./watch.css";

/** Token row as the page sees it; the hash is never read back. */
interface TokenRow { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }

const GUIDE_URL = "https://github.com/Cancant1/project-fitness-dashboard/blob/rebuild/docs/APPLE_WATCH_SHORTCUT.md";
const ENDPOINT = ingestEndpoint(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtWhen = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "Never");

/** Settings → Apple Watch: tokens for the iOS Shortcut, the endpoint to paste, and the last nights that came in. */
export function WatchSettingsPage() {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!supabaseConfigured) { setSignedIn(false); return; }
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <main className="page watch">
      <PageHead eyebrow="Settings" title="Apple Watch" />
      {signedIn === false ? (
        <Card className="watch-signin">
          <Stat size="md" value="Sign in to set this up" />
          <p className="k-muted">The Shortcut sends sleep, resting heart rate and HRV to your account, so it needs a signed-in app.</p>
        </Card>
      ) : signedIn ? (
        <div className="k-dash">
          <div className="k-col">
            <Tokens />
            <Endpoint />
          </div>
          <div className="k-col">
            <Nights />
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ------------------------------------------------------------------ tokens

function Tokens() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<{ id: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("ingest_tokens").select("id, label, created_at, last_used_at, revoked_at").order("created_at", { ascending: false });
    if (error) setError(friendly(error.message));
    else setTokens((data ?? []) as TokenRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const token = newIngestToken();
      const token_hash = await hashIngestToken(token);
      const { data, error } = await supabase
        .from("ingest_tokens").insert({ token_hash, label: label.trim() || "iPhone" }).select("id").single();
      if (error) throw error;
      setFresh({ id: (data as { id: string }).id, token });
      setLabel("");
      await load();
    } catch (e) {
      setError(friendly(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setConfirming(null);
    const { error } = await supabase.from("ingest_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) setError(friendly(error.message));
    if (fresh?.id === id) setFresh(null);
    await load();
  }

  const active = tokens?.filter((t) => !t.revoked_at) ?? [];
  const revoked = tokens?.filter((t) => t.revoked_at) ?? [];

  return (
    <Card className="watch-card">
      <Label action={<a href={GUIDE_URL} target="_blank" rel="noreferrer">Shortcut guide</a>}>Tokens</Label>

      {fresh && (
        <div className="watch-fresh" role="status">
          <span className="watch-fresh-head">New token</span>
          <code className="watch-code">{fresh.token}</code>
          <CopyButton text={fresh.token} label="Copy token" primary />
          <p className="watch-note">Paste it into the Shortcut now. You won't see it again.</p>
          <button className="btn btn-plain btn-sm watch-done" onClick={() => setFresh(null)}>Done</button>
        </div>
      )}

      <div className="watch-create">
        <label className="field">
          <span className="sr-only">Token name</span>
          <input placeholder="iPhone" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && void create()} />
        </label>
        <button className="btn btn-primary btn-sm watch-create-btn" disabled={busy} onClick={() => void create()}>
          <PlusIcon /> Create token
        </button>
      </div>

      {error && <p className="watch-error">{error}</p>}

      {tokens && tokens.length > 0 && (
        <div className="k-rows">
          {[...active, ...revoked].map((t) => (
            <div key={t.id} className={`k-row watch-token ${t.revoked_at ? "is-revoked" : ""}`}>
              <div className="k-row-main">
                <span>{t.label || "Token"}</span>
                <span>{t.revoked_at ? `Revoked ${fmtWhen(t.revoked_at)}` : `Made ${fmtWhen(t.created_at)} · used ${fmtWhen(t.last_used_at)}`}</span>
              </div>
              {t.revoked_at ? (
                <Pill>Revoked</Pill>
              ) : confirming === t.id ? (
                <span className="watch-confirm">
                  <button className="btn btn-plain btn-sm" onClick={() => setConfirming(null)}>Keep</button>
                  <button className="btn btn-glass btn-sm watch-revoke" onClick={() => void revoke(t.id)}>Revoke</button>
                </span>
              ) : (
                <button className="btn btn-plain btn-sm watch-revoke" onClick={() => setConfirming(t.id)}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}
      {tokens && tokens.length === 0 && !fresh && <p className="k-muted watch-empty">No tokens yet</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ endpoint

function Endpoint() {
  return (
    <Card className="watch-card">
      <Label>Shortcut URL</Label>
      {ENDPOINT ? (
        <>
          <code className="watch-code">{ENDPOINT}</code>
          <CopyButton text={ENDPOINT} label="Copy URL" />
        </>
      ) : (
        <p className="k-muted">No Supabase URL in this build</p>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ last nights

function Nights() {
  const { sync } = useStore();
  const health = useRows("health_daily");
  const [refreshing, setRefreshing] = useState(false);
  const today = todayIso();

  const nights = useMemo(() => {
    const byDate = new Map(health.map((h) => [h.date, h]));
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, -i);
      return { date, row: byDate.get(date) ?? null };
    });
  }, [health, today]);
  const last = nights.find((n) => n.row?.sleep_total_min != null);

  async function refresh() {
    setRefreshing(true);
    try { await sync.run(); } finally { setRefreshing(false); }
  }

  return (
    <Card className="watch-card">
      <Label action={<button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>}>Last 7 nights</Label>
      <Stat size="lg" value={last ? hours(last.row!.sleep_total_min!) : "—"} unit={last ? "h" : undefined}
        sub={last ? `Slept · ${last.date === today ? "last night" : fmtShortDate(last.date)}` : "Nothing received yet"} />
      <div className="watch-nights" role="table" aria-label="Sleep, resting heart rate and HRV, last 7 nights">
        <div className="watch-night watch-night-head" role="row">
          <span role="columnheader">Night</span>
          <span role="columnheader">Sleep</span>
          <span role="columnheader">RHR</span>
          <span role="columnheader">HRV</span>
        </div>
        {nights.map(({ date, row }) => (
          <div key={date} className="watch-night" role="row">
            <span role="cell">{date === today ? "Today" : fmtShortDate(date)}</span>
            <span role="cell" className="k-num">{row?.sleep_total_min != null ? `${hours(row.sleep_total_min)} h` : "—"}</span>
            <span role="cell" className="k-num">{row?.resting_hr != null ? row.resting_hr : "—"}</span>
            <span role="cell" className="k-num">{row?.hrv_sdnn_ms != null ? `${fmtNum(Number(row.hrv_sdnn_ms), 0)} ms` : "—"}</span>
          </div>
        ))}
      </div>
      {last?.row?.source === "manual" && <p className="k-muted watch-note">Last value typed in by hand</p>}
    </Card>
  );
}

const hours = (min: number) => fmtNum(min / 60, 1);

/** Server messages in plain words. */
function friendly(message: string): string {
  if (/ingest_tokens/.test(message) && /schema cache|does not exist/.test(message)) return "Not set up on the server yet (database update pending)";
  if (/fetch|network/i.test(message)) return "Offline · try again when connected";
  return message;
}

// ------------------------------------------------------------------ copy

function CopyButton({ text, label, primary = false }: { text: string; label: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / no permission: fall back to a hidden textarea.
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } finally { el.remove(); }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button className={`btn btn-sm ${primary ? "btn-primary" : "btn-tinted"} watch-copy`} onClick={() => void copy()}>
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : label}
    </button>
  );
}
