# Feature plan (12 Oct 2026, after session 1)

Status: **built** = in the app now; **next** = proposed, ready to build on Mario's yes; **later** = needs more work
or a decision.

## Built in this pass

| Feature | Where | Why |
|---|---|---|
| Post-session debrief | Today, under the finished session | Shows what the session changed: training-max change, next time's main lift, each accessory ▲ / = (and why). Makes the coach visible every training day. |
| "Last time" per exercise | Workout logger, under the title | Last session's sets and note for that exercise, so he doesn't have to remember. |
| Note per exercise | Workout logger → Note | Questions and observations for the check-in. |
| Update banner | Every page | "New version of Reps · Reload" when a new build is out. |
| Tempo pendulum | Wrist extension | 3 s up / 3 s down guide. |
| Up next after finishing | Today | Shows the next session, not today's again. |

## Next (small to medium, high value)

1. **Pre-session brief** (Today, lifting days before the session): one card that says:
   - today's focus (e.g. "Max set squat at 95, target 10");
   - caffeine yes/no;
   - candy timing;
   - any active swap or pain hold;
   - "last time" for the main lift.
2. **Pair auto-advance** in the logger: after ticking a set of A, jump to B (and back), with the short rest timer.
3. **Rest-timer signal:** a short beep and a screen flash when rest ends. Vibration isn't available on iPhone web apps.
4. **Notes overview:** a list of all exercise notes and session notes, newest first, for the check-in. Mark them
   "discussed".
5. **Week summary on Today:** turn "Too early" into progress: "1 of 4 sessions · Upper A tomorrow · 2,143 / 2,800
   kcal today".
6. **Food list clean-up:** the "Review" step from the original rebuild plan is still open (114 foods). Mario lists
   the foods he actually eats and the rest gets archived.
7. **Backup/export:** download all data as JSON or CSV (the old app had this).

## Later (bigger, or needs a decision)

- **Reminders:** e.g. "Session at 18:00" or "Sunday check-in". Web push on iPhone needs the app added to the Home
  Screen plus a server push service (VAPID keys + an Edge Function).
- **Sleep stages:** not available through Shortcuts; needs the paid Health Auto Export app.
- **In-app swap engine (phase 2):** the swap exercise replaces the slot, with its own history and start load.
- **Progress photos stored in the app:** private Supabase Storage bucket and a side-by-side compare.
- **Connie's account** and import.
- **A settings page:** equipment pins, goals, units, bodyweight goal, bedtime.
- **After the plan (from 1 Mar 2027):** Today shows "Rest day" every day and the check-in "Too early" once the 20
  weeks are over. Needs a "plan finished" state and the next block (found in the 12 Oct bug hunt).
