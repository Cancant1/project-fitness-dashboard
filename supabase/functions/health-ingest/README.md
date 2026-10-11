# health-ingest

Receives last night's sleep plus the latest resting heart rate and HRV from an iOS Shortcut, and writes the user's
`health_daily` row for the morning the night ended (Europe/Amsterdam). Setting up the Shortcut on the iPhone:
[`docs/APPLE_WATCH_SHORTCUT.md`](../../../docs/APPLE_WATCH_SHORTCUT.md).

- `index.ts`: HTTP, token check, database writes.
- `parse.ts`: pure parsing and aggregation (no imports). Tested from the app: `src/lib/healthIngest.test.ts`
  (`npx vitest run src/lib/healthIngest.test.ts`).

## Deploy

From the app folder (`project-fitness-dashboard`), with the CLI logged in and linked:

```sh
npx supabase@2.118.0 db push                                        # creates public.ingest_tokens (migration 20261012090000)
npx supabase@2.118.0 functions deploy health-ingest --no-verify-jwt  # the ingest token is the auth, not a Supabase JWT
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions by Supabase; nothing to set.

## Request

```
POST https://<project>.supabase.co/functions/v1/health-ingest
x-ingest-token: <token from the app's Apple Watch page>
content-type: application/json

{
  "sleep_text": "Core;2026-10-11T00:10:00+02:00;2026-10-11T01:00:00+02:00\nDeep;…",
  "resting_hr": 52,
  "hrv_sdnn_ms": 48.5
}
```

All fields are optional, but at least one value must come through.

| Field | Meaning |
|---|---|
| `sleep_text` | One sleep sample per line: `stage;start;end` (`;`, tab or `\|` between parts). A list of lines also works. |
| `sleep` | The same as objects: `[{ "stage", "start", "end" }]`. |
| `resting_hr` | Beats per minute. Numbers or text ("52", "52 count/min"); 25–220 accepted. |
| `hrv_sdnn_ms` | HRV (SDNN) in ms. "48,5" works; 1–500 accepted. |
| `date` | `YYYY-MM-DD`. Only used when no sleep was sent. |

The body may also be plain text (just the sleep lines).

**Stages:** Asleep, In Bed, Awake, Core, Deep, REM; Dutch Slaap, In bed, Wakker, Kern, Diep; HealthKit raw names
(`HKCategoryValueSleepAnalysisAsleepCore`) and values 0–5.

**Dates:** ISO 8601 (recommended; set the date format to ISO 8601 in the Shortcut), or what Shortcuts writes by
default: "11 Oct 2026 at 07:12", "11 okt. 2026 om 07:12", "Oct 11, 2026 at 7:12 AM", "11-10-2026 07:12", RFC 2822.
Times without an offset are read as Amsterdam time.

**Sleep rules:**
- Samples are grouped into separate sleeps (a gap of more than 3 h starts a new one), and only the last one is
  used, so an afternoon nap in the 18-hour window is left out.
- Overlapping samples of the same stage (Watch plus another app) count once.
- Total asleep = core + deep + rem, or "Asleep" when the source has no stages.
- If only In Bed comes through, the total stays empty.
- The date is the Amsterdam date of the latest sleep end. Without sleep, it is `date`, else today.

**Write:** the function selects the live row (user, date, `deleted_at is null`), then updates it by id or inserts it.
It doesn't use `onConflict` because the unique index is partial. `updated_at` is set to now (or just after the
stored value), so the `keep_newest` trigger accepts it, and `server_updated_at` is set by the touch trigger, so the
app pulls it on its next sync. Only fields that were sent are changed. `source` becomes `ios-shortcut`. The token's
`last_used_at` is updated.

## Responses

| Status | Body |
|---|---|
| 200 | `{ ok: true, date, created, sleep_total_min, sleep_deep_min, sleep_rem_min, sleep_core_min, sleep_awake_min, resting_hr, hrv_sdnn_ms, night, warnings }` |
| 401 | Missing, unknown or revoked token |
| 405 | Not a POST |
| 413 | Body over 256 KB |
| 422 | Nothing usable in the body (`warnings` says why) |
| 500 | Server or database error |

## Test with curl

```sh
curl -sS -X POST "$URL/functions/v1/health-ingest" \
  -H "x-ingest-token: $TOKEN" -H "content-type: application/json" \
  -d '{"sleep_text":"Core;2026-10-11 00:00;2026-10-11 06:30","resting_hr":52,"hrv_sdnn_ms":48}'
```
