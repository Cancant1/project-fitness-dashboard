# Research round 1: build spec (confirmed by Mario, 11 Oct 2026)

**Source:**
- the playbook (`../docs/playbook/`), especially DECISIONS.md (R1-01 … R1-30 and the "Mario's answers" entry);
- the research files in `../docs/playbook/research/`.

**Ids:** each item names its playbook id. Use those ids in `Signal.why`, and add any missing ones to
`src/coach/evidence.ts` with a one-line summary taken from the playbook.

**Three parts, each built by a separate agent:**
- **E:** engine and coach (`src/plan`, `src/coach`, `src/lib`).
- **U:** pages and logger UI. Built after E.
- **W:** Apple Watch import (`supabase/`, a new settings screen, docs).

## Part E: engine and coach

### E1. Effort label per exercise (Mario: "tell me where to go max and where not")

Add `effort` to every `PrescribedExercise`, and per set where it differs:

| Value | When | Label |
|---|---|---|
| `max` | rep-out sets | "Max set: go until a stop sign; count clean reps" |
| `controlled` | normal working sets of main lifts and compounds | "Stop at {n} reps, even if more are there" |
| `failure` | isolation failure sets | "To failure: last rep you can do with good form" |
| `stop_sign` | isolation while E9 applies | "Hard, but stop at the first stop sign" |
| `easy` | warm-ups, the shoulder care block, the wrist ladder's isometric step | "Easy: technique, not effort" |
| `care` | wrist ladder | "Slow, 3 s up / 3 s down, last 1–2 reps hard but clean" |

`PlanSetRef` (set legacy_ref) carries `effort` so the logger can show it.

### E2. Minimum session (R1-02, P-MINIMUM)

- Add `prescribeMinimum(program, weekNo, dayKey, state, profile)` → `PrescribedDay`, flagged `minimum: true`. It
  contains:
  - the day's main lift(s): warm-up ramp + the rep-out only, as normal (deadlift day: ramp + top set);
  - then **1 failure set** each of the first 2 non-main, non-care accessories of that day (not the shoulder block);
    on Upper days, prefer one pull and one push.
  - Deload and taper weeks: the deload main-lift work instead of a rep-out.
- **TM and step rules apply as usual.**
- **Counting:** a minimum session counts as that day's session for consistency (sessions done) and for the floor.
  Its sets count as working sets.
- `startWorkout(..., { minimum: true })` stores `legacy_ref.plan.minimum = true`.

### E3. Missed week: move on (R1-01, P-ADHERENCE; replaces "repeat")

- **`consistency.missed_week`:**
  - No `repeat_week` action any more.
  - **Message:** "Week {w} was missed. No catch-up: carry on with week {w+1} as planned. Missed weeks count as an
    unplanned deload."
  - **Week 5 or 6 missed:** add "Train through week 7 instead of deloading", with an action
    `{kind: "skip_deload", weekNo: 7}`. It folds week 7 into a normal training week, type C, with the same notes
    as week 6.
  - Keep `repeat_week` in `applyAdjustments` for backward compatibility, but never offer it.
- **`consistency.long_break`:**
  - **14–27 days without a plan session:** TM −5% (as now).
  - **≥28 days:** message "Re-run calibration: rep-out at 75% of your last TM", with action
    `{kind: "recalibrate"}`. That makes the next session for each main lift a calibration rep-out at 75% of the
    last TM, using the provisional-TM rules.

### E4. TM cap past the old best (R1-03, P-PROG-TM)

- Old bests: squat e1RM 165, deadlift 235. Put them in plan data as `oldBestE1rm`.
- When the current TM ≥ the old best:
  - a plain hit (0 vs target) → TM unchanged;
  - any beat → at most +2.5 kg;
  - misses as now.
- **Messages:** the coach `strength.repout` text says "(capped past your old best)".

### E5. Step jumps (R1-04, P-PROG-STEP)

- **Incline DB:**
  - rep-out ≥16 → +2 rack steps;
  - ≥10 → +1;
  - 6–9 → same;
  - ≤5 → −1.
  - **Stuck:** 3 consecutive rep-outs at 6–9 at the same load → the next week's normal sets become 3×6, then 3×7.
    Add a `normalReps` override in state; it resets on the next load increase.
- **Pull-up:**
  - ≥12 → +5 kg;
  - ≥10 → +2.5;
  - 6–9 → same;
  - ≤5 → −2.5.
  - **System mass:** e1RM displays for the pull-up use bodyweight (7-day average) + belt (D-SYSTEM-MASS).

### E6. APRE taper (R1-05, P-PROG-APRE)

- `lastLoggedWorkingLoad(key)`: the heaviest unflagged working load of that exercise in the 12 months before the
  plan start, from history (pre-plan sets).
- Once the current load ≥ that value, the APRE jumps become +2.5% (top+2…6) and +5% (≥ top+7). The minimum
  1 step still applies.

### E7. Early-deload trigger (R1-06, P-DELOAD)

`strength.misses` fires when either holds, with bodyweight not falling and sleep not short (as now):
- two consecutive rep-outs of the same lift ≥2 under target; or
- three consecutive rep-outs ≥1 under target.

A joint ache trend (`joints.trend` rising 2 weeks) also offers `deload_now`.

### E8. Checkpoint fallbacks (R1-07) and extra sets (R1-08)

- **`main_lift_set`, when behind on the squat:** add a **Friday light squat 2×3 at 75% TM**, placed before the BSS.
  - Deadlift: 1–2 back-off sets × 3–5 at 80% of that day's top-set load.
  - Incline and pull-up: +1 normal set (as now).
- **`extra_sets` at checkpoint 1 = fixed, not "two lagging muscles":**
  - +2 sets triceps and +2 sets biceps a week: +1 on each arm exercise on Tue and Sat (Bayesian curl, overhead
    extension, underhand curl, reverse-grip pushdown);
  - optional +1 rear delt fly on Tue (offered as a second action).
  - The message explains it (P-EXTRASETS).

### E9. Effort rule for the elbow and bad days (R1-11, P-EFFORT)

Elbow-loading isolation (curls, triceps extensions, pushdowns; tag them in the plan data as `elbowLoading: true`)
switches from `failure` to `stop_sign` when either:
- any elbow pain check ≥4/10 in the last 14 days; or
- the last 2 sessions were rated ≤2 on "How did it feel?". That case covers all isolation that week, not only the
  elbow-loading moves.

The prescription shows it with a note.

### E10. Triceps ranges (R1-10)

Reverse-grip pushdown, overhead extension and cross-body extension: rep range **12–20**.

### E11. Pairs (R1-09, P-TIMESAVE)

Add `pair?: string` (pair id) to slots, with the default pairs from playbook 02_training P-TIMESAVE:
- Tue: Bayesian ↔ flye; overhead extension ↔ laterals.
- Sat: underhand curl ↔ rear delt fly; reverse pushdown ↔ laterals.
- Mon: cross-body extension ↔ calf raise.
- Fri: preacher ↔ laterals.

**Rest:** `restSec` 45–60 s between the two, 75 s after the pair.

**Validation:** never two `elbowLoading` exercises in one pair. Add a test.

### E12. Restart and no make-up (R1-13, P-RESTART)

- **First session after a gap ≥10 days:** rep-out sets get `capReps: target + 2` (note: "Stop at {n} even if more
  are there").
- **First week after a gap ≥14 days:**
  - no `extra_sets` or `main_lift_set` additions;
  - failure sets become `stop_sign`.
- **Weekly cap:** the coach signal `muscle.overreach` fires when logged working sets in a week exceed planned × 1.1:
  "Missed sets are gone; the next session is the plan."

### E13. Wrist ladder 3×/week (R1-15, J-ELBOW)

- **Monday and Friday:** a `wrist_extension` slot with 3 sets.
  - Reps by plan week: wk 0–1: 15 · 2–3: 12 · 4–5: 10 · 6–8: 8 · 9–12: 6 · then 2 sets of 8, once a week (Fri), to
    maintain.
  - 3 s up / 3 s down; `effort: care`.
  - Not counted as working sets (care work, as now).
- **Wednesday:** a home task in the ride day's conditioning card: "Wrist ladder at home: 3 × {reps}, dumbbell or
  water bottle".
- **Flare-up step:** after a morning elbow pain ≥2 above baseline, the next 3–7 days prescribe isometric holds
  (palm down, mid-range, 5 × 30–45 s), `effort: easy`. Then restart one rung lower.
- **Load:** progressive. Use dumbbell steps, with the double progression rule at the rung's reps.

### E14. Pain 0–10 (R1-16, J-PAINRULE)

- **Schema:** add `pain_score` (0–10, nullable) and `morning_score` (0–10, nullable) to `pain_checks`, via a new
  migration (`alter table add column if not exists`; numeric/int). Keep `during_set` and `next_morning` for old
  rows.
  - Writes set both: `during_set` = sharp if the "sharp" flag is set, else ache if score ≥1, else none.
- **Rules:**
  - **During:**
    - ≥6 or sharp → stop the exercise today (the logger shows it);
    - 4–5 → "hold load" (the next prescription doesn't increase that exercise; engine state `holdLoad[key]` until a
      session with ≤3).
  - **Morning:** score ≥ the site's baseline + 2 (baseline = median of the last 14 days' morning scores, or 0) →
    `joints.swap`.
  - **Trend:** morning scores rising over 2 consecutive weeks (weekly mean up both times) → act: "Cut {exercise}
    sets by a third" (action `{kind: "cut_sets", exerciseKey, fraction: 1/3, until}`), plus a red-flag reminder.
    No fysio booking: Mario declined.
- **`answerPainCheck`:** now takes a number.

### E15. Swap start loads (R1-17)

`swapStartLoad(fromKey, toKey, history)`:
- history load of the target × 0.9 (× 0.8 if older than 6 months);
- otherwise the same dumbbells for pressing swaps;
- pull-up → pulldown: 70% of system mass.

The swap action message includes the number. The first session of a swap: no rep-out, normal sets only.

### E16. Bodyweight rate (R1-21, N-RATE) and creatine (DECISIONS)

- **SE:** `slopeWithSe` gains an autocorrelation correction: SE × √((1+r)/(1−r)), where r = lag-1 autocorrelation
  of the residuals, clipped to 0–0.6.
- **Data:** require ≥20 weigh-ins; drop points more than 1.5 kg from a first-pass fit.
- **Creatine (started 2026-10-11):**
  - the fit uses weigh-ins from week 3 (Mon 2 Nov) on, so the first rate check is week 5;
  - `body.path` band shifted up by creatine water: 0 at week 0, ramping linearly to +0.7 kg at week 4, then +0.7.
  - Constant `CREATINE_START = "2026-10-11"` in plan data.
- **England:** exclude 2026-12-20 … 2027-01-03 from the rate fit; rate checks that would use that window say
  "skipped (holiday)".

### E17. TDEE label (R1-22, N-TDEE)

- **Label:** "maintenance (as logged)".
- **Data:** compute only with ≥24 of 28 days logged; leave missing days out; use 6,000 kcal/kg.
- **Exclusions:** leave out weeks 0–4 (creatine).

### E18. Sleep (R1-23, C-SLEEP)

- **Targets:** ≥7.5 h asleep before lifting days; lights-out target 23:15 the night before a lifting day (Mario
  sleeps 23:40–07:40).
- **Session flag:** `shortSleep` when the previous night was <6 h. Used in `strength.repout` messages: "{lift}
  missed after a short night (5.4 h); one-off misses after short nights don't count toward the early-deload rule".
  Exclude those from E7.

### E19. Caffeine and carbs cues (R1-20, R1-25)

On lifting days, Today shows a cue from 15:00:
- **Calibration, D-week and test sessions:** "Key session: caffeine ok, ~150 mg at 17:15."
- **Otherwise:** "No caffeine today; candy ~30–40 g 30–60 min before."

Show only one of them.

### E20. Measurement (R1-27 as changed by Mario)

- **Photos:** remove tape measurement. Add a photo reminder every 4 weeks (weeks 0, 4, 8, 12, 16, 19), Thursday
  morning cue: "Progress photos: front, side, back, same spot and light." Mark done with a `body_measurements` row
  of kind `other`, value 1, note "photos".
- **Waist:** optional. Drop the "waist check due" cue unless Mario has logged a waist in the last 30 days.
  `body.waist` uses the slope of ≥3 readings (R1-28).

### E21. Habit metrics (R1-29, P-HABITS)

**Consistency signals:**
- `consistency.sessions` leads the verdict. The headline starts with sessions: "4 of 4 sessions." and so on.
- `consistency.missed_twice`: two planned lifting days in a row missed → watch, "Missed twice in a row. Next
  session: just the minimum session if that's all you've got."
- `consistency.comeback`: a session within 48 h of a miss → good, "Comeback within 48 h. That's the habit."
- `consistency.habit`: consecutive complete weeks with ≥4 sessions, as a meter n/6. At 6: "6 weeks at 4+ sessions:
  the habit threshold".
- Floor = 2 sessions; minimum sessions count.

**If-then cues** (`dailyCues`, priority after the pain prompt):

| Trigger | Cue |
|---|---|
| A planned lifting day yesterday with no session | "Missed yesterday → do it on your next free day (Wed or Sun). No doubling up." |
| Thursday with ≤1 session this week | "Fri = Lower A, Sat = Upper A. That's the floor." |
| Last 2 sessions rated ≤2, or <6 h sleep last night | "Take the minimum session today. It counts." |
| No session yet on a lifting day after 17:00 | "Not feeling it? Warm up and do the first exercise, then decide." |
| Sunday | "Plan the week: which 4 days?" (opens the week; just a link for now) |

### E22. Conditioning (R1-30)

- **Sunday rounds from week 4:** the prescription says "{n} rounds, of which 2 are burst rounds: 5 s all-out /
  10 s easy for 2 min (rope or shadow-boxing, no bag)".
  - Deload weeks: half, no bursts.
  - The note says "finish by 14:00".
- **Thursday:** a "Gassed? 1–5 + the round you faded" input stored in `conditioning` (kind boxing: use `rounds`
  for the fade round and a new `rating` column via the same migration as E14).
  - **Coach `conditioning.gassed`:** trend over 6 weeks; "Gassed 4 → 3: working." If unchanged by week 8 while the
    rounds progress: "Fading may be pacing: round 1 at ~80%, breathe out on punches."

### E23. Plan data renames

- `preacher_curl` display name → "Kneeling cable curl, elbow on knee (preacher-style)". Cue: "Upper arm braced on
  the raised knee, arm in front of the body; full stretch at the bottom with a soft lockout."
- Add `incline_hammer_curl` as an alternative to `underhand_cable_curl`: "Seated high-incline hammer curl", 12 kg,
  rep range 8–12. It is offered after 4 weeks of elbow pain 0–3 (a swap suggestion `info`). Not a default.

### E24. Variety at deloads (R1-12)

In weeks 7 and 10, add a note: "You may swap up to 2 accessories for a listed equivalent this week (same muscle)."
Equivalents are listed per accessory in the plan data (`alternatives: string[]`). No engine swap yet.

### Tests

Add unit tests for E2–E7, E9–E16, E21 and E22. Keep everything green.

## Part U: UI (after E)

- **Logger:**
  - an effort badge per exercise and per set (E1), with colour by tone: max = warm, controlled = plain,
    failure = accent, care/easy = muted;
  - pairs shown as A/B with the short rest;
  - a "stop today" banner after pain ≥6 or a sharp flag;
  - a capped rep-out shows "stop at {n}".
- **Start options:** on Today and Train, every planned day has "Start" and **"Minimum session (~30 min)"** (E2).
- **Pain sheet:** 0–10 slider per site plus a "sharp" toggle. The morning prompt on Today is 0–10.
- **Thursday:** a gassed rating input (1–5 + fade round) on the Conditioning card.
- **Monthly elbow check:** 3 questions, 0–10 each: worst pain this week, pain when gripping or lifting, difficulty
  with daily tasks. Monthly cue; stored as a `pain_checks` row with site `elbow_monthly` and the scores in `note`
  JSON. Not the PRTEE itself (copyright); a short version.
- **Wednesday:** the wrist-ladder home task shown in the ride card with a done checkbox.
- **Check-in page:**
  - a habit meter (n/6 weeks);
  - the missed-twice and comeback lines;
  - a photo reminder status;
  - the rate shown with ± (corrected SE).
- **Photos cue:** mark done (E20).
- **Plan day cards:** effort badges, pairs, the wrist ladder, burst rounds.

## Part W: Apple Watch import (D-WATCH)

**Goal:** each morning after the alarm, an iOS Shortcut sends last night's sleep plus the latest resting HR and HRV
to Supabase. The app's `health_daily` fills, and coach recovery uses it. No HRV training rule (C-READINESS).

1. **Migration:**
   - table `public.ingest_tokens`: id, user_id default `auth.uid()`, token_hash text unique, label, created_at,
     last_used_at, revoked_at;
   - RLS: own rows, select/insert/update; no delete.
   - The app stores only a SHA-256 hash.
2. **Edge function `health-ingest`** (Deno, `supabase/functions/health-ingest/index.ts`):
   - **Request:** POST, header `x-ingest-token`.
   - **Auth:** hash the token, look it up with the service role (env `SUPABASE_SERVICE_ROLE_KEY`, present in Edge
     Functions by default), reject revoked or unknown tokens.
   - **Body:** JSON `{ date?: "YYYY-MM-DD", sleep?: [{stage, start, end}], sleep_text?: string, resting_hr?: number,
     hrv_sdnn_ms?: number }`. `sleep_text` allows a simple line format from Shortcuts:
     `stage;start;end` per line, ISO or "d MMM yyyy HH:mm" dates; be lenient and test it.
   - **Sleep:** aggregate stages into deep/rem/core/awake minutes and total asleep (core + deep + rem, or "Asleep"
     for older watches). Date = the morning the night ended (local Europe/Amsterdam).
   - **Upsert:** `health_daily` on (user_id, date), source `ios-shortcut`. Bump `updated_at` and `server_updated_at`
     through the existing conventions/trigger. Update `last_used_at`.
   - **Response:** `{ok, date, sleep_total_min, resting_hr, hrv_sdnn_ms}`.
   - **CORS:** not needed.
   - Deploy with `npx supabase@2.118.0 functions deploy health-ingest --no-verify-jwt` (the token is the auth).
3. **App:**
   - a small **Settings → Apple Watch** page, reachable from the sidebar footer or the Today menu;
   - a **"Create token"** button: generates 32 random bytes (base64url) in the browser, saves the hash, and shows
     the token **once** with a copy button;
   - a list of tokens with revoke;
   - the endpoint URL to paste into the Shortcut (project URL + `/functions/v1/health-ingest`).
   - **The token never passes through Claude.**
4. **Guide:** `docs/APPLE_WATCH_SHORTCUT.md`. Step-by-step Shortcut build in plain language for iOS 17/18:
   - Find Health Samples (Sleep Analysis, start date in the last 18 h) → repeat → Text lines `stage;start;end`;
   - resting heart rate (latest);
   - HRV (latest, or the average of the last night);
   - Dictionary → Get Contents of URL (POST, JSON, header);
   - the Personal Automation "When my alarm is stopped" → Run Immediately.

   Include a test step and troubleshooting.
5. **Coach:** recovery already reads `health_daily`. Add `restingHr` 7-day vs 60-day baseline as info, and HRV as
   info only (C-READINESS).
