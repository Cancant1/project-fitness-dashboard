# Reps. 2026 Full Revamp — Master Product, UX, Architecture, and Migration Plan

**Status:** core revamp implemented; advanced workflow completion, release acceptance, and real-device restore drill remain
**Created:** 26 August 2026  
**Scope:** the current `dashboard/` application, its predecessor in `app/`, the embedded workbook export, browser state, and GitHub synchronization  
**Primary constraint:** no workout, food, bodyweight, plan, note, or settings data may be silently lost, rewritten, or made unreachable  
**Purpose:** this is the source document to follow during the revamp. Later implementation work should update the decision log, milestone checklists, and migration counts here instead of creating another competing plan.
**Repository location:** `docs/reps-2026-full-revamp-master-plan.md`

---

## 1. Executive decision

Rebuild Reps. as a mobile-first, installable, local-first performance journal with five primary areas:

1. **Today** — the useful summary and next actions.
2. **Train** — active workout, history, programs, and exercise library.
3. **Progress** — strength, records, training load, bodyweight, and trends.
4. **Nutrition** — food diary, food library, targets, energy balance, and weight check-in.
5. **Plan** — training calendar, routines, blocks, goals, and return-to-training programs.

Profile, preferences, data, GitHub sync, and export move into a compact **Settings / Data** area instead of competing for primary navigation. “AI Export” becomes a contextual Share/Export action. “Return 8W” becomes a normal program/block that uses the same workout logger as every other workout. Strength, Records, and the exercise-history modal become one coherent Progress system.

The revamp is a controlled replacement, not a visual reskin. It includes:

- a new responsive information architecture and design system;
- complete redesigns of workout and food logging;
- one normalized, versioned data model;
- IndexedDB for durable asynchronous local records, with small UI preferences left in `localStorage`;
- the existing GitHub integration retained and hardened;
- explicit, idempotent data migrations with audit reports and rollback;
- removal of the predecessor app, duplicate analytics, dead helpers, inline-style sprawl, runtime CDN dependencies, and generated-source ambiguity only after migration acceptance.

### Non-negotiable release gates

- No unexplained decrease in record counts between any source and the migrated store.
- Every historical workout set, food entry, weight, note, plan/block, injury note, lifetime PR, routine, macro target, and equipment setting remains accessible.
- A workout and a food entry can be logged offline on a 390 px-wide phone with one hand.
- Browser back/forward, refresh, deep links, and an interrupted session work correctly.
- GitHub pull/push and two-device conflict handling pass the test matrix in §18.
- WCAG 2.2 AA is the minimum accessibility target.
- The current app stays recoverable until the new app has passed migration reconciliation and real-use validation.

---

## 2. What exists today

### 2.1 Runtime and code shape

The active application is a static React 18 dashboard in `dashboard/`. It loads React, ReactDOM, D3, and a web font from CDNs, then loads a checked-in generated bundle. The main implementation is approximately:

| Area | Current shape | Consequence |
|---|---:|---|
| `dashboard/styles.css` | ~6,000 lines | One global stylesheet owns shell, pages, charts, themes, and many overlapping breakpoints. Regression risk is high. |
| `components/views.jsx` | ~3,163 lines | Nutrition, planning, routines, exercises, and export share a monolith. |
| `components/log.jsx` | ~2,066 lines | The most important flow is a dense spreadsheet-style component with UI, calculations, and mutations intertwined. |
| `components/state.jsx` | ~1,896 lines | Persistence, migrations, sync, merge policy, selectors, and actions are coupled. |
| `components/strength.jsx` | ~1,584 lines | Rich visualization logic is separate from a second exercise-history analytics implementation. |
| `data/fitness-data.js` | ~17,735 lines | Generated workbook data is checked in as application data. |
| `app/` predecessor | ~20k generated-data lines plus old UI | A second application generation remains in the repository and uses a different storage key. |
| Tests | one sync-merge test file | Sync has useful regression coverage; UI, calculations, migrations, accessibility, and end-to-end flows do not. |

The sync regression suite currently passes. That is a useful baseline, but it covers only a fraction of the app’s risk.

### 2.2 Current navigation and routing

There are twelve top-level destinations: Dashboard, Log, Sessions, Strength, Records, Return 8W, Routines, Exercises, Body, Plan, AI Export, and Settings.

Navigation is component state rather than real URLs. Refresh and browser history do not reliably preserve location. Strength is an exception with partial hash state. The visible global search field has no implemented search behavior, and the sidebar advertises `Cmd+K` without a command palette. The build date shown in the shell is hardcoded and stale.

### 2.3 Current persistence and GitHub integration

- Current state key: `reps-app-state-v1`.
- Predecessor state key: `fitness-os-local-v3`.
- GitHub configuration and sync metadata use separate versioned keys.
- State is local-first and written as one JSON value to `localStorage`.
- A fine-grained token, owner, repository, branch, and path configure GitHub sync.
- The default remote file is `state/reps-app-state.json`.
- Manual Pull/Push, auto-pull, delayed auto-push, SHA retry, large-blob fallback, merge policies, and deletion tombstones already exist.
- The token is local-only and is not put in the synced state.
- Current schema declares version 1, but migrations are permissive object normalization rather than a strict sequence of version-to-version transformations.
- Many record types have stable IDs and tombstones, but several nested maps and scalar settings still use local-wins or last-object behavior without per-entity timestamps.

Preserve the good parts: offline-first behavior, manual control, remote Git history, deletions, stale-SHA recovery, and compact setup. Replace the fragile parts: synchronous whole-state writes, ambiguous migrations, incomplete per-entity metadata, silent merge decisions, and a single state component that owns everything.

### 2.4 Workbook and embedded-history inventory

`PPL 2026.xlsx` is not merely an import file; it contains history and domain knowledge that the current UI does not fully expose. It has 15 sheets:

- four workout blocks: Block 1 (F), Block 2, Block 2.5 (Injury), and Block 3;
- Foodlog, Stats, Weightlog, Plan, and Setup;
- untouched/template sheets: Untouched, 2x, 3x, 5x, 6x, and Bench Only.

The currently generated dataset reports these audit anchors:

| Data class | Current embedded baseline | Notes |
|---|---:|---|
| Planned workout slots | 144 | Six-week block structures, including overlapping injury/return programming. |
| Performed sessions | 48 | Dates currently span 5 Jan–23 May 2026. |
| Sets | 721 | 98 sets include notes. |
| Movement sets | Pull 241 / Push 253 / Legs 146 | Do not use these totals alone as a migration proof; reconcile every set. |
| Weight entries | 24 | Embedded summary anchor; runtime state may contain additional entries. |
| Nutrition days | 24 | Embedded summary anchor; runtime state may contain additional entries. |
| Workout blocks | 4 | Names, start overrides, week counts, and goals can also exist in browser state. |

The Stats sheet also contains information currently at risk of being hidden or dropped during “materialize effective state”:

- injury-management status and safety rules for shoulder, elbow, forearm, and thumb issues;
- programming rules and a longer-term training roadmap;
- lifetime PRs, including results older than the in-app session history;
- available equipment;
- goals and programming notes.

The current materialization path imports workouts, weights, kcal/protein overrides, food items, and block summaries, then disables workbook history. It does **not** fully materialize the Stats-sheet injuries, lifetime PRs, equipment, or roadmap. That path must not be used as the final migration.

The Foodlog includes repeated product names with different nutrition values. Food identity therefore cannot be based on normalized product name alone.

---

## 3. Page-by-page audit and destination map

### 3.1 Consolidation map

| Current page | Functionality that must survive | Current problems | Destination in revamp |
|---|---|---|---|
| **Dashboard** | Profile switch; GitHub status/actions; date; next workout; return-block progress; sessions/volume/weight/kcal/TDEE summaries; week strip; recent sessions; latest PRs | Too many small bordered modules; very narrow-looking desktop content in practice; weak hierarchy; some metrics appear with mixed history states; decorative density outruns usefulness | **Today**. Limit to next action, current-week status, three adaptive insights, recent event, and sync health. Deeper charts link to Progress/Nutrition. |
| **Log** | Planned/actual date; routine/day; session RPE and notes; set weight/unit/reps/RPE/note; targets and previous values; progression suggestions; set types; reordering; skip/remove/add; rest timer; plate calculator; clipboard output; reset/finish; moved-session logic | Mobile is a miniature spreadsheet with tiny columns and actions; too many controls visible at once; session lifecycle is implicit; exercise and Return logging are separate; draft/resume semantics are fragile | **Train → Active workout**, completely redesigned in §8. One logger for routine, ad-hoc, return, injury, and edited historical sessions. |
| **Sessions** | Search/filter; deleted toggle; summaries; soft-delete/restore; full session editing; add/remove exercises and sets | Separate from logging although it edits the same entities; search semantics are incomplete; card density and editing model duplicate logger concepts | **Train → History**. Session detail reuses read/edit variants of workout components. Search includes notes, exercises, split, date, tags, and source. |
| **Strength** | Exercise picker; top weight/e1RM/volume; interactive curves; comparison; ranges; block bands; annotations; rep distribution; heatmap; block multiples; session table; deep-link state | Powerful but isolated, complex, and duplicated by Exercise modal; empty states can dominate; charts prioritize available metrics over decisions | **Progress → Strength / Exercise detail**. Keep the best interactions, simplify defaults, preserve deep links, add accessible summaries. |
| **Records** | All-time bests; streak; training heatmap; lift records; PR feed; droughts; lifetime volume | Overlaps Strength and Dashboard; streak definition is opaque; workbook lifetime PRs can disappear because they are not session-derived | **Progress → Records** as a tab/section. Merge derived PRs with verified legacy PR facts and show provenance. |
| **Return 8W** | The actual 16-session Wed/Sat program; progression; holiday gap; symptom checks; RIR/energy/RPE/notes; drafts | Merely opening the page auto-creates **and activates** a hardcoded routine; it is date-specific; it has a second logger and schema path; hidden mutation is unsafe | **Plan → Program instance**. Convert to a reusable template/dated block. Explicit “Use this program” confirmation. Sessions launch the standard workout logger. |
| **Routines** | Create/import/edit/delete/activate; day and exercise ordering; targets/units/rules; progression-rule studio | Routine, program, block, and plan concepts overlap; rules are profile-global in places and per-exercise elsewhere; spreadsheet editor is dense | **Plan → Programs & templates**. Separate reusable routine templates from scheduled program instances; use a structured day builder. |
| **Exercises** | Derived catalog; group filters; custom exercises; default units; hide/restore; rename across app; last seen/trend; history | Catalog identity is name-based in several paths; rename maps are migration debt; Exercise modal duplicates Strength; no first-class aliases, muscles, equipment, cues, or substitutions | **Train → Exercise library** with details linking into **Progress**. Stable IDs, aliases, tags, equipment, cues, substitutions, and archive status. |
| **Body** | Energy/TDEE windows; target phase and weight; daily weight/food/macros; quick food add; trajectory; editable ledger; food library | It combines three jobs—food logging, weight/energy coaching, and historical ledger—into a very long page; observed desktop/mobile overflow, large blank regions, and repeated-looking ledger content; poor task focus | Split between **Nutrition → Diary**, **Nutrition → Energy & goals**, and **Progress → Bodyweight**. No mega-page. |
| **Plan** | Profile name/birthday/age/unit; macro visibility; weekday macro table; training blocks; block editing | Profile settings, nutrition goals, and training plans are mixed; macro presets/profile actions include unused state; block model overlaps Routines and Return | Training calendar/blocks remain in **Plan**. Macro targets move to **Nutrition → Goals**. Personal details and units move to **Settings → Profile**. |
| **AI Export** | Date range; include/exclude profile/equipment/macros/routine/sessions/food/weights/blocks; preview/copy/download | A utility is occupying primary navigation; equipment is hardcoded instead of reading canonical data; export preferences are another storage island | **Share / Export** action available from relevant pages and **Settings → Data**. Export canonical data, human summary, CSV, and AI context. |
| **Settings** | Profiles; themes; GitHub config; backup; effective-state export; import; copy; wipe | Eight aesthetic themes create design and QA sprawl; destructive/data actions are crowded together; sync conflict health is not prominent enough; profile details live elsewhere | **Settings** with Profile, Appearance, Workout preferences, Nutrition preferences, Data & GitHub, and About. System/light/dark only at launch. |

### 3.2 Cross-page defects to resolve

1. **No real router.** Introduce semantic URLs and route-level loading/error boundaries. Preserve selected exercise, session, date, and tab in URLs where useful.
2. **Non-functional global search.** Either implement it fully or remove it. The target is a command/search palette across exercises, sessions, notes, foods, and actions.
3. **Hidden mutations.** Nothing may create, activate, delete, migrate, or sync merely because a page rendered.
4. **Duplicated analytics.** Strength and ExerciseModal use overlapping data, metrics, and chart concepts.
5. **Duplicated logging.** ReturnSessionEditor and Log edit similar workout information through separate code paths.
6. **Inconsistent domain vocabulary.** “Routine,” “program,” “block,” “plan,” “session plan,” and “day” need explicit definitions (§7.1).
7. **Name-based identity.** Exercise renames and duplicate food names prove that display labels cannot be primary keys.
8. **Global CSS and inline styles.** Page-level styling and business state are hard to reason about or delete safely.
9. **Accessibility exposure.** Several small/icon-only controls need names and larger hit areas; drag reordering must retain click/tap alternatives; closed mobile drawers must not remain exposed to assistive technology.
10. **Mobile density.** Dense information is valuable, but tiny form controls are not. Mobile should disclose one decision layer at a time.
11. **Visual imbalance.** The interface uses many hairlines, compact mono labels, spreadsheet cells, and equal-weight panels, leaving weak hierarchy and—on tested layouts—large unused or unstable areas.
12. **Static/generated ambiguity.** Source, generated bundle, workbook export, two data copies, and predecessor app can drift.

---

## 4. Target information architecture

### 4.1 Desktop shell

Use a stable 232–256 px sidebar and a fluid main canvas. Navigation:

- Today
- Train
  - Active / Start workout
  - History
  - Programs
  - Exercise library
- Progress
  - Overview
  - Strength
  - Records
  - Bodyweight
- Nutrition
  - Diary
  - History
  - Foods & saved meals
  - Energy & goals
- Plan
  - Calendar
  - Current block
  - Program templates
- Settings / profile avatar

The main content width should adapt by task. Reading and settings views cap line length; tables and charts use the available canvas. Do not force every page into the same narrow maximum width.

### 4.2 Mobile shell

Use a five-item bottom bar: **Today, Train, Progress, Nutrition, Plan**. A central or floating `+` opens a fast action sheet:

- Start/resume workout
- Add food
- Log weight
- Add note/annotation
- Create ad-hoc workout

Settings and profile live behind the avatar. An in-progress workout produces a persistent resume strip above the bottom bar. The bottom bar respects safe-area insets and never obscures focused fields.

### 4.3 Navigation behavior

- Route examples: `/today`, `/train/live/:sessionId`, `/train/history/:sessionId`, `/progress/strength/:exerciseId`, `/nutrition/diary/:date`, `/plan/blocks/:blockId`, `/settings/data`.
- Browser history works; refresh returns to the same safe state.
- Unsaved edits are autosaved, not guarded by constant confirmation dialogs.
- `Cmd/Ctrl+K` opens global search/actions on desktop; a search icon opens the same experience on mobile.
- Search results are grouped by action, session, exercise, food, and note and are keyboard/touch accessible.
- Deep links never trigger state mutation.

---

## 5. 2026 design direction

### 5.1 Design concept: “precision performance journal”

The visual language should feel like a calm high-end training instrument, not a spreadsheet and not a neon bodybuilding template.

- **Hierarchy over borders:** use whitespace, tonal surfaces, typography, and section rhythm. Reserve borders for controls, tables, and true separation.
- **Neutral foundation:** one warm-neutral light palette, one graphite dark palette, and one high-contrast signal accent. Final colors must pass contrast tests before being named in code.
- **Typography:** a modern variable sans for UI and narrative; tabular numerals for sets, weights, calories, dates, and charts. Monospace is an accent, not the default voice of every label.
- **Shape:** 10–16 px surface radii, 8–12 px control radii, limited shadow, clear pressed/selected states.
- **Density modes:** comfortable and compact on desktop; comfortable only for touch-critical mobile logging. Density changes spacing, not information correctness.
- **Themes:** system, light, and dark. Retire the eight-theme QA burden. A future accent selector is acceptable if it does not create component variants.
- **Motion:** functional transitions of roughly 120–240 ms for panels, completion, and route continuity; no gratuitous parallax. Respect reduced-motion preference.
- **Copy:** short, direct, and specific. Show why a suggestion exists and what will happen if applied.

### 5.2 Responsive principles

- Design from 390 px first, then 768 px, 1024 px, and 1440+ px.
- Do not horizontally shrink desktop tables into mobile. Change their information shape into cards, disclosure rows, and focused editors.
- Minimum WCAG AA pointer target is 24 × 24 CSS px with spacing; Reps. will use **44 × 44 px for primary gym and food actions** and never put destructive targets adjacent to completion targets.
- All functionality provided by drag-and-drop also has move up/down or “Move to…” controls.
- Sticky headers, timers, and bottom navigation must not obscure keyboard focus at 320 px reflow or 200% zoom.
- Charts resize by their container, not only the viewport, and must never push the page wider than the viewport.

### 5.3 Component foundation

Build and document these primitives before feature pages:

- Button, IconButton, SegmentedControl, Tabs, Chip, Badge, Field, NumberField, SearchField, Select, DatePicker.
- Card, Section, Stat, ProgressMeter, EmptyState, InlineAlert, Toast, Skeleton.
- Sheet/Drawer, Dialog, Menu, CommandPalette.
- ResponsiveTable, DataList, Timeline, CalendarStrip.
- ChartFrame, ChartLegend, ChartTooltip, ChartSummary, DataQualityState.
- SetRow, ExerciseCard, WorkoutHeader, FoodRow, MacroMeter, WeightCheckIn.

Every primitive includes keyboard behavior, accessible name rules, loading/disabled/error states, dark mode, reduced motion, touch dimensions, and visual regression examples.

---

## 6. Product behavior principles

1. **The next action is obvious.** Today answers “what should I do now?”
2. **Logging is faster than correcting.** Defaults come from the plan, last performance, favorites, and recent behavior, but are always editable.
3. **History is immutable by default, editable deliberately.** Catalog or routine changes do not silently rewrite past records.
4. **Autosave is visible.** Show Saved / Saving / Offline / Sync needed without interrupting work.
5. **Suggestions explain themselves.** “Add 2.5 kg” includes the rule and evidence; it is never silently applied.
6. **Incomplete data is honest.** Distinguish zero, missing, planned, skipped, deleted, and not tracked.
7. **One entity, one editor.** The same workout/session components serve live, history edit, and special programs.
8. **Progressive disclosure.** Common actions stay visible; set types, annotations, plate details, and advanced rules live one tap away.
9. **Offline first.** Logging never waits on GitHub or network resources.
10. **Undo before confirm.** Use reversible soft deletion and toasts for ordinary mistakes; confirmations are reserved for irrecoverable operations.

---

## 7. Canonical domain model v2

### 7.1 Vocabulary

- **Routine template:** reusable arrangement of workout days and exercise prescriptions; no dates.
- **Program template:** one or more routine phases/blocks with progression and scheduling rules; reusable.
- **Program instance:** a template assigned to a profile with dates and status.
- **Training block:** a dated phase within a program instance.
- **Planned workout:** one scheduled occurrence with prescriptions.
- **Workout session:** what actually happened; may reference a plan but is independently durable.
- **Exercise:** canonical movement identity with aliases and metadata.
- **Set prescription:** target.
- **Set result:** actual performance.
- **Food definition:** reusable catalog item and serving options.
- **Food log entry:** historical snapshot of consumed quantity and nutrition.
- **Saved meal:** reusable bundle of food definitions/quantities.
- **Body measurement:** dated weight or future measurement type.

### 7.2 Entity requirements

Every durable entity gets:

- a stable, opaque ID (UUID/ULID; never derived solely from a display name);
- `profileId` where applicable;
- `createdAt`, `updatedAt`, and optional `deletedAt` in ISO 8601 UTC;
- `source` and optional `sourceRef` for workbook/v1/manual/import provenance;
- a schema-valid payload;
- an entity revision or content hash used by synchronization;
- raw/source fields retained when normalization could lose meaning.

### 7.3 Core records

| Entity | Required content |
|---|---|
| Profile | name, birthday optional, preferred units, locale/time zone, tracking preferences |
| Exercise | canonical name, aliases, movement pattern, muscles, equipment, default metric/unit, compound flag, cues, substitutions, archived status |
| RoutineTemplate | name, days, ordered exercise prescriptions, progression policy references |
| ProgramTemplate / Instance / Block | name, date rules, phase, goals, safety notes, weeks, linked planned workouts |
| PlannedWorkout | planned date/day, order, prescriptions, status, reschedule references |
| WorkoutSession | actual/planned date, status `draft/inProgress/completed/discarded`, routine/program refs, start/end/duration, RPE/RIR/energy, notes, ordered exercise performances |
| SetResult | type, load value/unit, reps, duration/distance when relevant, RPE/RIR, completion timestamp, note, prescription snapshot |
| FoodDefinition | name, brand optional, stable servings, macro values, source/verification, favorite/archive state |
| FoodLogEntry | date/time/meal, food ID optional, **name/serving/macros snapshot**, quantity, note, source |
| SavedMeal | name, ordered component snapshots/food refs, default time/meal, servings |
| BodyMeasurement | date/time, type, entered value/unit, normalized value, note |
| NutritionTarget | effective date range, weekday targets, phase, target weight, provenance |
| Annotation | type, date/range, exercise/session refs, text; covers injury/travel/deload/form change/notes |
| EquipmentProfile | equipment and plate inventory; no hardcoded export list |
| LegacyFact | source-backed PR, injury rule, or roadmap item not reducible to a normal session/entity |
| Tombstone | entity type/ID, deletedAt, device/revision; retained until all known peers have observed it |

### 7.4 Historical integrity rules

- Changing an exercise name updates the exercise record; sessions keep `exerciseId` plus a display-name snapshot for robust export.
- Changing food nutrition updates the catalog only; old entries retain their logged macro snapshots.
- Converting lb/kg changes display and future defaults, not the raw entered value of historical sets.
- Editing a routine never mutates completed sessions.
- Rescheduling a planned workout retains original date, new date, and link rather than overwriting history.
- Imported ambiguous values are kept with `sourceRaw` and a migration warning instead of guessed destructively.

---

## 8. Workout logging — complete redesign

### 8.1 Start and resume

Entry points:

- Today → Start next workout.
- Train → choose scheduled workout, routine day, previous workout duplicate, or empty workout.
- Plan → open a scheduled workout.
- Global `+` → start/resume.

Before creation, show a lightweight sheet with workout title, planned/actual date, routine/day, and optional template. Creating the session writes a durable `draft`; beginning the first set changes it to `inProgress`. Reload, offline mode, browser close, route change, and another page visit must preserve it.

Only one active workout per profile is the default. Starting another offers Resume current / Finish current / Start separate; it never silently discards.

### 8.2 Mobile focus mode

The default phone experience is an exercise-focused stack:

1. Sticky workout header: elapsed time, exercise progress, rest timer, autosave/sync state, Finish.
2. Current exercise card: name, prescription, previous performance, compact cue/safety note.
3. Large set rows: set number/type, previous, target, actual load/reps, RPE/RIR, completion.
4. Completion button reachable by thumb; completion starts rest timer and moves focus predictably.
5. Next exercise preview and exercise navigator.

Numeric entry behavior:

- correct numeric keyboard and decimal rules;
- unit shown adjacent, not squeezed into its own tiny column;
- quick ± increment buttons use exercise defaults;
- carry forward the last set when appropriate;
- tap previous or suggestion to apply, with immediate undo;
- no focus loss or scroll jump after entry;
- RPE/RIR optional per profile and set type;
- duration/distance inputs replace irrelevant load/reps fields for boxing/cardio/time-based work.

Advanced actions live in a row menu or exercise drawer: warm-up/drop/AMRAP/failure type, note, plate calculator, rest duration, superset group, replace, reorder, skip, and remove.

### 8.3 Desktop workout workspace

Use three adaptive panes:

- left: ordered exercises and completion state;
- center: current exercise set editor;
- right: previous sessions, progression explanation, notes/cues, rest timer/plate calculator.

At narrower desktop/tablet widths, the right pane becomes a drawer. Desktop adds bulk paste/edit and keyboard navigation without changing the underlying components or data model.

### 8.4 Exercise and set management

- Search and add multiple exercises without leaving the workout.
- Recents, routine exercises, and replacements rank ahead of the full library.
- Reorder by drag **and** move controls.
- Supersets/circuits are explicit groups, not naming conventions.
- Set types: warm-up, working, drop, AMRAP, failure, timed, and custom only if a real use appears.
- Add/remove/duplicate sets; removed completed sets are soft-deleted until session completion.
- Per-exercise unit, default rest, plate inventory, and cues persist as preferences.
- “Skip in future suggestions” is a prescription decision and must not delete history.

### 8.5 Suggestions and safety

- Progression logic is a pure, tested policy service. It consumes prescriptions, recent results, rep quality, RPE/RIR, pain/safety annotations, and configured increments.
- The UI states the recommendation and reason: hold, add load, add reps, deload, or review.
- Return/injury programs can add a pre-set symptom check and safe-range warning, but they use the standard session and set entities.
- Safety notes from the workbook migrate into annotations/policies and remain visible in relevant exercises/programs.
- No algorithm auto-increases a saved prescription without explicit confirmation.

### 8.6 Finish flow

Finish opens a compact summary:

- duration, completed exercises/sets, volume, estimated PRs, session RPE/energy;
- incomplete sets clearly marked with options to keep as planned/skipped or return;
- notes and date correction;
- progression proposals to accept individually or later;
- Finish & sync status.

The completed session is immediately available in History and Progress. PR celebration is restrained, fast, reduced-motion aware, and never blocks saving.

### 8.7 Workout logger acceptance criteria

- Log a normal three-set exercise on phone in fewer interactions than the current logger.
- Complete a set with load/reps using controls at least 44 px high.
- Resume the exact active set after refresh and offline restart.
- Log kg, lb, bodyweight-plus-load, assisted load, timed boxing, and note-only work.
- Edit a completed session using the same domain actions without creating a duplicate.
- Run the Return 8W template through this logger with every existing RIR, energy, symptom, and holiday behavior represented.
- No action relies exclusively on drag or swipe.

---

## 9. Food logging — complete redesign

### 9.1 Diary structure

Nutrition opens on today’s diary with:

- date navigation and clear “Today” return;
- calorie/protein primary targets, carbs/fat shown according to tracking preferences;
- entries grouped by Breakfast/Lunch/Dinner/Snacks by default, with optional time-based ordering;
- a sticky Add food action;
- daily note, completeness state, and weight check-in shortcut;
- copy day/meal, multi-select, move, edit, and undo deletion.

Meal grouping is a display preference; every entry stores date/time and optional meal to avoid locking data into one presentation.

### 9.2 Unified add-food flow

Use one full-height mobile sheet and two-column desktop panel:

1. Search is focused immediately.
2. Tabs/filters: Recent, Favorites, Saved meals, My foods, All.
3. Results show name, usual serving, calories, and protein; secondary macros on demand.
4. A `+` on a result adds it to a temporary **plate** without leaving search.
5. The plate supports quantity/serving edits, removal, target date/meal/time, and multi-add commit.
6. “Log items” commits the entire plate transactionally.

This applies the strongest pattern found in current food-log research: repeated search launches are unnecessary friction. MacroFactor’s documented plate flow, multi-add, quick add, favorites, and reusable meals are useful references, but Reps. should implement only the local catalog features it can support reliably.

### 9.3 Fast paths

- One-tap add of favorite/recent item at its remembered serving.
- Quick Add for kcal/protein/carbs/fat without polluting the reusable catalog.
- Copy yesterday, copy meal, paste to multiple dates, and edit after paste.
- Save selected diary entries as a Saved meal; “explode” into editable components when logging.
- Duplicate last serving from the food row.
- Optional barcode/label/AI entry is a later integration, not a release dependency; it requires a trustworthy data source and explicit review before commit.

### 9.4 Food catalog redesign

- Stable food IDs; duplicate names are allowed.
- Fields: product, optional brand, category, serving definitions, kcal/protein/carbs/fat per serving, source, source URL, verified flag, favorite, archived.
- Serving examples: grams, milliliters, piece, bottle, scoop, custom unit; conversion is explicit.
- The existing kcal/protein-only workbook catalog remains valid; missing carbs/fat remain `null`, not zero, unless the source explicitly says zero.
- Catalog edits do not rewrite historical food entries because entries store macro snapshots.
- Merge duplicate candidates only through a review screen showing every differing value and affected history count.
- Search tolerates aliases and spelling but does not merge identity automatically.

### 9.5 Weight, goals, and adaptive energy

Move weight and energy coaching into focused views:

- **Nutrition → Energy & goals:** phase, weekday targets, observed intake, adaptive maintenance range, recommendation, confidence/data sufficiency, and apply-target action.
- **Progress → Bodyweight:** raw weights, trend weight, goal trajectory, rate of change, and annotations.
- **Today/global +:** fast weight check-in.

Calculations must be pure, versioned, and covered by fixture tests. Every adaptive result states its window, required data, missing-day treatment, and confidence. Applying a new target creates a dated NutritionTarget record; it does not overwrite the target used to evaluate past adherence.

### 9.6 Food logger acceptance criteria

- Add a repeated breakfast of several items from search without reopening the logger.
- Log a new quick-add item without saving junk to the catalog.
- Edit quantity/serving and see macro totals update before commit.
- Copy yesterday or a saved meal, then alter one component.
- Add/edit/delete offline and sync later without duplicate entries.
- Preserve the workbook’s duplicate food labels as distinct reviewed records.
- Preserve missing macro values as unknown and communicate that state.

---

## 10. Today, Progress, Plan, and Settings redesign

### 10.1 Today

Default content, in order:

1. Next scheduled workout or Resume active workout.
2. Today’s nutrition/weight status with quick add.
3. Current-week adherence: sessions completed vs planned and one meaningful load/recovery signal.
4. One prioritized insight: e.g. progression ready, weight trend off target, incomplete nutrition logging, or sync problem.
5. Recent achievement/event and short activity list.

No more than three KPI cards appear above the fold. Every metric links to its source view. Users can hide Nutrition or bodyweight modules without corrupting data.

### 10.2 Progress

Progress Overview answers four questions:

- Am I training consistently?
- Am I getting stronger?
- Is training load balanced and recoverable?
- Is bodyweight moving toward the goal?

Tabs/sections:

- **Overview:** weekly adherence, effective sets/volume trend, top movement changes, bodyweight trend, important annotations.
- **Strength:** exercise detail/compare, e1RM/top-set/volume toggle, blocks, annotations, history.
- **Records:** verified session PRs, legacy PR facts, recent PRs, streak, droughts, lifetime volume.
- **Bodyweight:** raw/trend/goal, rate, weigh-in adherence, relevant nutrition overlay.
- **Training load:** weekly movement/muscle distribution and fatigue signals after data tagging is reliable.

The current ExerciseModal is removed. Clicking an exercise opens the canonical route in Progress. Exercise library and Progress share selectors and components.

### 10.3 Visualization rules

Every chart must have a user question and an action or interpretation. Apply these rules:

- show raw values and trend separately;
- include units, period, and data sufficiency;
- use comparison baselines and annotated events when meaningful;
- never encode meaning by color alone;
- provide a text summary and accessible data table or list;
- use a defined empty state for 0, 1, 2, and insufficient points;
- avoid truncated axes that exaggerate differences unless explicitly marked;
- make hover behavior available through focus/tap;
- prefer small multiples to overlaid lines when comparisons become illegible;
- do not duplicate the same metric on Today, Strength, Records, and an exercise modal.

Priority visualizations:

1. Weekly training adherence: planned vs completed.
2. Exercise progression: actual top set/e1RM/volume with block and annotation context.
3. Bodyweight: raw weigh-ins, smoothed trend, target corridor, rate.
4. Energy balance: intake and adaptive maintenance with data-quality band.
5. Movement/muscle volume: weekly trend, not just current totals, after tagging cleanup.
6. Session fatigue: set-to-set rep/load decay only when enough comparable sets exist.

### 10.4 Plan

- Calendar shows planned workouts, moved/skipped/completed status, boxing/holiday/recovery annotations, and blocks.
- Current program shows block goal, dates, phase, progression policy, and next changes.
- Program templates contain routine days and optional phase structure.
- The Return 8W data becomes a seeded program template and current instance; installing/activating is explicit.
- Routine builder uses a day list and exercise cards. Desktop supports drag plus buttons; mobile uses move controls and sheets.
- Program changes generate future planned workouts only; completed sessions never change.

### 10.5 Settings and data utilities

Sections:

- **Profile:** name, birthday optional, units, time zone/locale, profile switch/add/archive.
- **Appearance:** system/light/dark, density desktop, reduced motion follows system.
- **Training:** default units, RPE/RIR, rest times, plate inventory, PR formula, safety annotations.
- **Nutrition:** visible macros, meal/time view, quick-add preferences, target methodology.
- **Data & GitHub:** sync configuration/status, Sync now, conflict history, backups, import/export, migration report, storage health.
- **About:** build version from generated metadata, not a hardcoded date.

“Wipe data” sits behind a danger-zone flow that creates a downloadable pre-wipe backup, lists exact affected profiles/counts, requires typed confirmation, and preserves remote data unless remote deletion is separately requested.

---

## 11. Data-loss prevention and migration strategy

### 11.1 Source-of-truth inventory before any rewrite

Create a read-only preflight tool that records, without modifying anything:

1. SHA-256 and file size of `PPL 2026.xlsx`.
2. Counts/date ranges/IDs for every workbook-derived entity.
3. Raw current `reps-app-state-v1` value and checksum.
4. Raw predecessor `fitness-os-local-v3` value and checksum if present.
5. GitHub configuration excluding the token, sync metadata, remote path, remote SHA/commit, and a read-only downloaded remote state/checksum.
6. Any user JSON backups selected for import.
7. Counts by profile and entity, including deleted/tombstoned records.

Outputs:

- timestamped raw backup package;
- machine-readable `preflight-report.json`;
- human-readable reconciliation summary;
- warnings for corrupt JSON, unknown schemas, duplicate IDs, name collisions, impossible dates, missing units, and orphaned references.

The GitHub token is not exported into normal backup packages. Existing local configuration remains untouched during migration.

### 11.2 Migration algorithm

Implement explicit steps:

- `workbook -> interchange-v1`
- `fitness-os-local-v3 -> interchange-v1`
- `reps-app-state-v1 -> interchange-v1`
- `github schema 1 -> interchange-v1`
- `interchange-v1 -> canonical schema 2`

Each transformation is pure, idempotent, fixture-tested, and version-pinned. Do not have UI components perform migrations.

Merge precedence is field-specific and reported:

- Same stable/current record: choose the more complete/newer entity using explicit timestamps and retain the losing source in provenance.
- Same planned slot with a completed local session: preserve both plan and actual link; do not collapse them into a single ambiguous record.
- Same name but no stable identity: create separate candidates and flag for review.
- Deleted record: honor a valid newer tombstone; retain in backup and audit counts.
- Conflicting scalar/profile setting: choose newest timestamp when available; otherwise preserve current app value and report the alternative.
- Legacy PR/injury/equipment/roadmap facts: create LegacyFact, Annotation, or EquipmentProfile records rather than dropping them.

### 11.3 Required reconciliation

For every source and destination, compare:

- total and active/deleted counts by entity;
- min/max date;
- IDs and source references;
- set counts by session and exercise;
- sum/checksum of numeric payloads without relying on floating-point display formatting;
- note counts and hashes;
- unit distribution;
- orphaned references;
- duplicates/collision decisions;
- source records with no destination and destination records with no source.

Migration passes only when every source record is either linked to a destination or listed as an explicit reviewed exclusion. “The totals look close” is not acceptance.

Use current embedded counts—144 slots, 48 performed sessions, 721 sets, 24 weight entries, and 24 nutrition days—as fixture anchors, then add live browser/GitHub records on top. Sentinel checks should include an early workout, latest performed workout, a noted set, each block, one duplicate-name food, a weight/nutrition day, every legacy lifetime PR, every injury rule, and equipment.

### 11.4 Cutover and rollback

1. Leave all legacy files, storage keys, and GitHub remote content unchanged.
2. Import into a separate IndexedDB v2 database.
3. Generate and review reconciliation.
4. Run the app in **shadow mode**: v2 reads for comparison, v1 remains production source.
5. Fix every unexplained discrepancy and rerun idempotently.
6. Create two independent backups: local download plus timestamped GitHub commit/snapshot.
7. Switch the app to v2 only after the release gate is signed off.
8. Preserve v1 storage read-only for at least one full real-use validation cycle.
9. Provide v2 export and a compatibility/interchange export before any legacy cleanup.
10. Remove legacy readers only in the final cleanup milestone; never auto-delete old keys.

If rollback is needed, stop v2 writes, export all v2 changes, restore the pre-cutover package, and re-import post-cutover records through interchange tooling. Document every rollback action and count.

### 11.5 Continuous safeguards

- Transactional local writes per user action.
- Write-ahead/outbox records for GitHub sync.
- Automatic local checkpoint before import, bulk edit, conflict resolution, migration, and wipe.
- Manual JSON and CSV exports by domain/date range.
- Import always supports dry-run and count preview.
- Storage quota/usage status and `navigator.storage.persist()` request when supported.
- Corruption handling opens in recovery mode; it never initializes an empty profile over unreadable data.

---

## 12. GitHub integration v2

### 12.1 Preserve the integration, simplify its contract

Keep a portable JSON snapshot in the configured private repository. In the first revamp release, retain one remote state file because it gives an atomic file update, straightforward manual inspection/export, and Git commit history. Do not prematurely shard into many files and create cross-file atomicity problems.

Recommended remote envelope:

- `app: "reps"`
- `schemaVersion: 2`
- `snapshotId`, `createdAt`, `updatedAt`
- `deviceId`, `baseRemoteSha`, logical revision
- entity collections with stable IDs/revisions/timestamps
- tombstones
- migration provenance
- payload checksum
- non-secret sync metadata

Warn well before size becomes operationally awkward (for example at 5 MB) and measure serialization/pull/merge time. GitHub’s Contents API supports normal behavior through 1 MB, raw/object retrieval from 1–100 MB, and no support above 100 MB; the current large-blob fallback should remain covered by tests.

### 12.2 Sync behavior

- Local commit is immediate; remote sync is asynchronous.
- One status language everywhere: Saved locally, Syncing, Synced, Offline, Conflict, Needs attention.
- Pull on explicit user action and optionally on app start/focus with throttling.
- Push from an outbox after a quiet period and on safe background/visibility transitions; never block workout/food completion.
- Use remote SHA as compare-and-swap. On stale SHA: fetch, validate, merge by entity, rerun invariants, then push.
- Per-entity merge uses ID, revision/timestamp, and tombstones. Nested maps become actual entities or versioned records instead of blanket local-wins.
- Same-entity concurrent conflicts that cannot be resolved safely enter a conflict inbox with local, remote, and combined previews.
- A pre-push checkpoint exists locally. GitHub commit history remains another recovery layer.
- Network/auth/rate-limit errors use bounded retry/backoff and actionable messages.
- A corrupt or wrong-app remote file is quarantined and shown; never merged as empty data.

### 12.3 Token and dependency security

- Continue using a fine-grained PAT scoped to the single repository with Contents read/write and an appropriate expiration; explain setup in-app.
- Token stays outside synced state, exports, diagnostics, logs, DOM text, and error payloads.
- Bundle React/D3/fonts or host them with the app instead of requiring runtime third-party script execution. Add a restrictive Content Security Policy compatible with GitHub API calls.
- Treat any future GitHub App/OAuth proxy as a separate architecture decision; it would require a trusted backend and is not necessary for this personal local-first revamp.

---

## 13. Technical architecture

### 13.1 Recommended stack

- React with TypeScript.
- Vite production build for a static deployment.
- A real client router with lazy route modules.
- IndexedDB behind a small typed repository layer; `localStorage` only for non-critical shell preferences and legacy reads.
- Feature-scoped reducer/actions or another minimal deterministic store; avoid a new large state dependency unless profiling proves it useful.
- D3 calculation primitives where existing custom visualization needs them; shared chart frames/components for UI and accessibility.
- Service worker plus web app manifest for app-shell offline support; data remains in IndexedDB, not the cache.
- Runtime schema validation for imports, local database upgrades, and GitHub payloads.

Do not add SSR, a general backend, social features, or a cloud database to this revamp.

### 13.2 Proposed source structure

```text
src/
  app/
    App.tsx
    router.tsx
    providers/
    shell/
  domain/
    workouts/
    planning/
    exercises/
    nutrition/
    body/
    progress/
    profiles/
  data/
    db/
    repositories/
    migrations/
    interchange/
    github-sync/
    backups/
  features/
    today/
    train-live/
    train-history/
    exercise-library/
    progress/
    nutrition-diary/
    nutrition-goals/
    plan/
    settings/
  shared/
    ui/
    charts/
    hooks/
    formatting/
    validation/
  test/
    fixtures/
    migration/
    e2e/
```

### 13.3 Boundaries

- UI calls domain actions; it does not write browser storage or GitHub directly.
- Domain actions validate and transact through repositories.
- Selectors/calculations are pure and receive explicit data/time zone.
- GitHub sync serializes canonical repositories through an adapter; domain code does not know about REST payloads.
- Workbook parsing produces interchange data, never UI globals.
- Generated build output is reproducible and not hand-edited.
- Build version/commit/date are injected at build time.

### 13.4 Performance budgets

At the 75th percentile on supported devices:

- LCP ≤ 2.5 s;
- INP ≤ 200 ms;
- CLS ≤ 0.1;
- route transitions show useful skeleton/content promptly;
- completing a set or food plate updates locally within one animation frame where practical;
- large history lists are paginated/virtualized only when profiling shows need;
- chart calculations are memoized by relevant record revisions, not entire app state;
- no whole-database serialization on every keystroke.

---

## 14. Redundant code and repository cleanup

Cleanup is gated after functional replacement and migration acceptance.

### 14.1 Consolidate

- Strength page and ExerciseModal analytics → one Progress exercise feature.
- Log and ReturnSessionEditor → one workout-session feature.
- Dashboard/Records/Strength metric calculations → shared tested selectors.
- Date, unit, e1RM, volume, session-completeness, food totals, and merge helpers → domain modules.
- Routine/plan/return block concepts → the program model.
- Profile fields spread across Plan/Settings/Body → canonical Settings and Nutrition goals.
- AI Export/effective-state backup/export → one interchange/export service.

### 14.2 Remove after proof

- `app/` predecessor after its storage migrator and behavior parity are verified.
- Legacy generated data copies and `routine.js` when canonical seed/import replaces them.
- Checked-in bundle as a source artifact if deployment can publish reproducible `dist/`; otherwise clearly mark and generate it only in release automation.
- Runtime Babel/vendor remnants and external CDN script dependencies.
- Eight legacy themes and their CSS.
- Unused imports/state such as Plan’s dormant profile/macro preset handlers.
- Inline style objects that duplicate component states/tokens.
- Obsolete CSS selectors after coverage confirms zero use.
- Superseded partial planning documents can move to `docs/archive/`; keep this master plan and decision history.

### 14.3 Guardrails

- Use static analysis for unused exports and CSS cautiously; dynamic/global usage must be mapped first.
- Delete by feature replacement PR, not one giant cleanup.
- Each removal PR includes bundle-size change, test evidence, and migration impact “none” or explicit.
- Never delete workbook/source backups or legacy keys as part of ordinary code cleanup.

---

## 15. Implementation roadmap with gates

### Milestone 0 — Freeze, inventory, and safety harness

**Deliver**

- Canonical terminology and schema proposal approved.
- Preflight/export/reconciliation tools.
- Raw fixture packages for workbook, current v1, predecessor v3, and GitHub schema 1.
- Baseline screenshots and functional recordings at 390, 768, and 1440 px.
- Current behavior matrix and known-defect list.
- CI running existing sync tests plus schema/migration fixture tests.

**Gate**

- Every source is readable and backed up.
- Stats-sheet omissions are represented in the target model.
- Current count/date/hash report can be reproduced.
- No production state has been changed.

### Milestone 1 — Foundation and shell

**Deliver**

- TypeScript/Vite app beside the existing dashboard.
- Design tokens and core component primitives.
- Router, desktop sidebar, mobile bottom navigation, command palette shell.
- IndexedDB repositories, canonical validation, versioned migrations, storage health.
- GitHub sync adapter using schema 2 fixtures and current conflict tests.
- PWA manifest/app-shell offline behavior.

**Gate**

- Shell works at target breakpoints, keyboard, zoom, light/dark, reduced motion.
- Offline create/read/update/delete fixture survives reload.
- v1 import is idempotent and reconciles without unexplained drops.
- GitHub schema 2 round-trip is byte/content equivalent after normalization.

### Milestone 2 — Train core

**Deliver**

- Workout session lifecycle and repositories.
- Mobile focus logger and desktop workspace.
- Exercise picker/library basics, set types, units, notes, RPE/RIR, timer, plate calculator, supersets, reorder alternatives.
- Finish summary, draft recovery, session history/detail/edit.
- Program/routine prescriptions feed the logger.
- Return 8W converted to a program instance with explicit activation.

**Gate**

- All §8 acceptance criteria pass.
- Current workout fixtures render and edit without field loss.
- No separate return logger remains.
- Offline/interrupted and concurrent GitHub workout tests pass.

### Milestone 3 — Nutrition core

**Deliver**

- Diary, unified add-food/plate flow, recents/favorites, quick add, saved meals, copy/multi-paste.
- Food catalog stable IDs/servings/provenance and duplicate review.
- Weight check-in, target records, energy calculation service.
- Nutrition history and bodyweight detail.

**Gate**

- All §9 acceptance criteria pass.
- Every v1/workbook food and weight record reconciles.
- Catalog edits provably do not alter historical macros.
- Offline/concurrent create/edit/delete tests pass.

### Milestone 4 — Today and Progress consolidation

**Deliver**

- Today task summary.
- Unified Progress Overview, Strength, Records, Bodyweight, and training-load foundation.
- Exercise detail route replaces modal.
- Shared chart frame, accessible summaries/tables, annotations, comparisons, deep links.
- Legacy PR/injury facts visible with provenance.

**Gate**

- No duplicated strength/exercise analytics implementation.
- Charts pass data-state, resize, keyboard/touch, contrast, and accessible-summary tests.
- Every displayed metric traces to a documented selector and unit.

### Milestone 5 — Plan, Settings, export, and GitHub UX

**Deliver**

- Plan calendar, program template/instance/block builder.
- Profile/training/nutrition/appearance settings.
- Data & GitHub health, conflict inbox, dry-run imports, backups.
- Contextual human/CSV/JSON/AI export using canonical equipment and data.
- Functional global search/command palette.

**Gate**

- All current Plan/Routines/Settings/Export functions are mapped and accepted or explicitly retired.
- GitHub setup, pull, push, stale-SHA merge, auth failure, corrupt remote, and large-file tests pass.
- Wipe flow cannot proceed without backup/count review/typed confirmation.

### Milestone 6 — Cutover, hardening, and cleanup

**Deliver**

- Shadow comparison and final migration report.
- Real-use validation on desktop and mobile.
- Accessibility audit, performance profiling, cross-browser pass.
- Cutover and rollback package.
- Feature-by-feature removal of predecessor/duplicate/generated/dead code.
- Updated user data/sync/recovery documentation.

**Gate**

- Non-negotiable gates in §1 all pass.
- Two independent backups exist and restore tests pass.
- Zero unexplained migration discrepancies.
- No P0/P1 defect; no unresolved data-integrity or sync defect.
- Legacy sources remain recoverable even after code cleanup.

---

## 16. Detailed work packages

Use these as implementation epics. Each must include design states, domain behavior, tests, migration impact, and responsive QA.

| ID | Work package | Depends on | Done when |
|---|---|---|---|
| SAF-01 | Source inventory and raw backup | none | All sources hashed, counted, downloadable, and non-mutated. |
| SAF-02 | Interchange schema and validators | SAF-01 | Every source parses into typed interchange or produces actionable errors. |
| SAF-03 | Reconciliation/reporting | SAF-02 | Record-level lineage and unexplained discrepancy count are available. |
| ARC-01 | TypeScript/Vite/static build | none | Reproducible dev/build/test/deploy; no runtime compiler/CDN scripts. |
| ARC-02 | IndexedDB repositories | SAF-02 | Transactional CRUD, upgrades, recovery, and quota reporting. |
| ARC-03 | GitHub schema 2 adapter | ARC-02 | Round-trip, SHA conflict, tombstones, corruption, >1 MB retrieval tested. |
| UI-01 | Tokens and primitives | ARC-01 | All states and accessibility examples verified. |
| UI-02 | Responsive shell/router | UI-01 | Five-area navigation, deep links, history, safe areas, command palette shell. |
| TRN-01 | Exercise identity/library | SAF-02, ARC-02 | Stable IDs, aliases, metadata, rename migration, archive/substitute. |
| TRN-02 | Plan/prescription model | TRN-01 | Templates, instances, blocks, planned sessions; history immutable. |
| TRN-03 | Workout lifecycle | TRN-01, ARC-02 | Draft/in-progress/completed/recovery actions are deterministic. |
| TRN-04 | Mobile workout focus | TRN-03, UI-01 | One-handed logger passes workflow/touch/accessibility tests. |
| TRN-05 | Desktop workout workspace | TRN-04 | Shared components plus productive desktop panes/bulk entry. |
| TRN-06 | Session history/edit | TRN-03 | Search, filters, restore, and same-entity edit replace duplicate UI. |
| TRN-07 | Return 8W migration | TRN-02, TRN-04 | Template/instance uses canonical logger and preserves safety/session fields. |
| NUT-01 | Food identity/catalog | SAF-02, ARC-02 | Duplicates and missing macros migrate without false merges/zeros. |
| NUT-02 | Plate add-food flow | NUT-01, UI-01 | Multi-add transaction, serving edits, recents/favorites work offline. |
| NUT-03 | Diary/history | NUT-02 | Group/time views, edit/copy/move/undo and search work. |
| NUT-04 | Saved meals/quick add | NUT-02 | Reusable bundles and non-catalog quick entries meet acceptance tests. |
| NUT-05 | Weight/energy/targets | ARC-02 | Dated targets, pure calculations, confidence and trend views verified. |
| PRG-01 | Shared analytics/selectors | TRN-03, NUT-05 | One tested source per metric; provenance and units documented. |
| PRG-02 | Progress exercise detail | PRG-01 | Strength + ExerciseModal consolidated with deep links. |
| PRG-03 | Records/overview/bodyweight | PRG-01 | Legacy facts + derived records and accessible charts visible. |
| HOM-01 | Today | TRN/NUT/PRG selectors | Useful five-section priority view; modules honor tracking settings. |
| SET-01 | Profiles/preferences | ARC-02, UI-01 | Settings consolidated; system/light/dark; profile data preserved. |
| SET-02 | Data/sync/recovery UX | SAF-03, ARC-03 | Dry runs, backups, status, conflicts, restore, safe wipe. |
| EXP-01 | Canonical exports | SAF-02 | JSON/CSV/human/AI output has ranges, provenance, no secrets. |
| QA-01 | Automated and device matrix | all | §18 executed in CI/device runs with evidence. |
| CLN-01 | Duplicate/dead code removal | accepted replacements | Each removal is proven and legacy data remains recoverable. |

---

## 17. Decisions and non-goals

### 17.1 Recommended decisions

| Decision | Choice | Reason |
|---|---|---|
| Product structure | Five task areas | Consolidates twelve pages without hiding core workflows. |
| Local database | IndexedDB | Asynchronous, indexed, transactional structured records; appropriate for growing logs. |
| Remote sync | GitHub private JSON snapshot | Preserves required integration and portable history without introducing a backend. |
| v2 remote layout | One atomic state file initially | Safer merge/restore semantics than premature multi-file sharding. |
| App delivery | Static React + TypeScript + Vite PWA | Keeps current hosting simplicity while adding robust build/offline behavior. |
| Workout UI | Mobile focus stack + desktop panes | Density appropriate to context, shared domain/components. |
| Food UI | Unified search + temporary plate + diary | Minimizes repeated actions and supports multi-item meals. |
| Design modes | System/light/dark | Modern, cohesive, and testable; removes theme sprawl. |
| Special programs | Data/templates, never special pages | Prevents hidden activation and duplicate loggers. |
| Migration | Staged, idempotent, reconciled, reversible | Data preservation is more important than fast cutover. |

### 17.2 Non-goals for the core revamp

- Social feed, followers, challenges, or public workout sharing.
- A general coaching AI that changes plans without review.
- Photo-based food estimation or barcode database before a reliable provider is selected.
- Wearables, HealthKit/Google Health Connect, or smartwatch apps.
- Progress photos or cloud media storage.
- Powerlifting scoring formulas as a headline feature.
- Full micronutrient database.
- A multi-user server/backend.
- Recreating every theme or every decorative chart.

These may be reconsidered after the core logging, sync, data integrity, and responsive experience are excellent.

---

## 18. Test and acceptance matrix

### 18.1 Migration/data tests

- Empty, current v1, predecessor v3, workbook-only, GitHub-only, and combined-source fixtures.
- Idempotent repeated import.
- Duplicate IDs, duplicate food names, exercise rename chain, missing units/macros, invalid dates, incomplete sets, orphan plan/session.
- Tombstoned and restored session/food/routine/block.
- Stats-sheet injuries, lifetime PRs, equipment, and roadmap survive.
- Numeric and note hashes match; source lineage exists.
- Corrupt/truncated JSON and unexpected schema open recovery, not empty initialization.
- Export then re-import produces equivalent canonical content.

### 18.2 GitHub/two-device tests

- Clean first push/pull and existing remote.
- Device A workout + Device B different food → both survive.
- Both devices edit different sets in same session → deterministic safe merge or conflict inbox.
- Edit vs delete for food/session/routine/block.
- Stale SHA, 404/new file, 401/403, rate limit, offline, timeout, corrupt remote, wrong app/schema.
- Auto-push while workout is being edited; visibility change; reopened tab.
- Remote file above 1 MB uses raw retrieval path.
- Token is absent from state/export/log/error/DOM snapshots.
- Pre-push backup and GitHub history restore both succeed.

### 18.3 Workout tests

- Scheduled, ad-hoc, duplicated, rescheduled, Return 8W, and edited historical sessions.
- kg/lb/bodyweight/assisted/timed work; decimals; warm-up/working/drop/AMRAP.
- Superset, add/remove/replace/reorder, drag alternative, timer, plate calculator.
- Set accept, undo, incomplete finish, accidental close, refresh, offline restart, concurrent tab.
- Progression hold/add/deload/safety fixtures and explicit apply.
- Search sessions by exercise, split, date, session note, exercise note, and set note.

### 18.4 Nutrition/body tests

- Search/add one or many; plate transaction rollback; favorites/recents.
- Serving conversion, unknown macro, quick add, saved meal explode, copy/paste dates.
- Edit/delete/undo/offline/concurrent sync.
- Catalog edit does not change historical entry snapshots.
- Weight raw/trend, missing days, target effective dates, energy windows/confidence.
- Duplicate-name foods remain distinct until reviewed.

### 18.5 Responsive/browser matrix

Minimum manual/automated widths: 320 reflow, 390 phone, 768 tablet, 1024 laptop, 1440 desktop, and a wide desktop. Test portrait and landscape where relevant.

Browsers: current Safari/iOS Safari, Chrome/Android Chrome, desktop Chrome, Firefox, and Safari. Test installed PWA and normal tab where supported.

Every primary flow is checked with:

- keyboard only;
- screen-reader landmarks/names/status announcements;
- 200% text zoom and 320 px reflow;
- touch targets and accidental-adjacent action risk;
- reduced motion;
- light/dark and system change;
- offline/throttled network;
- long names, large numbers, empty data, and multi-year history.

### 18.6 Accessibility acceptance

- WCAG 2.2 AA checklist and automated axe scan, followed by manual verification.
- Visible, non-obscured focus; logical focus order and modal focus return.
- Accessible names for every icon button.
- No closed drawer/dialog in the accessibility tree.
- Drag operations have tap/click and keyboard alternatives.
- Charts have keyboard/touch equivalents, text summaries, and tabular data.
- Status changes such as Saved, timer completion, set completion, sync error, and validation failure are announced without stealing focus.
- Color is never the only status indicator.

### 18.7 Release-quality acceptance

- Core Web Vitals budgets in §13.4.
- No console errors in supported flows.
- No uncontrolled data-schema warnings.
- Build is reproducible from source; generated files match CI output.
- Restore drill from local backup and GitHub commit is documented and executed.
- The new visual hierarchy is reviewed on actual populated history, not only empty demo data.

---

## 19. Research applied

Research was checked on 26 August 2026 and used as guidance, not as a request to clone other products.

### Accessibility and responsive interaction

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is the target. Its newer AA criteria include focus not obscured, dragging alternatives, and minimum target size.
- [W3C Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) defines a 24 × 24 CSS px AA minimum or sufficient spacing. Reps. adopts a stronger 44 px target for primary mobile logging controls.
- [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) supports the 320 px/zoom and sticky-content requirements.
- [W3C Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) requires a non-drag single-pointer alternative, supporting explicit move controls in routines and workouts.

### Local-first storage and offline delivery

- [MDN Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) documents that `localStorage` is synchronous and can block the UI with larger data, supporting its demotion to small preferences.
- [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) documents asynchronous indexed object storage and transactions, supporting the canonical local repository.
- [MDN storage quotas and persistence](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) documents Web Storage limits, best-effort eviction, and `navigator.storage.persist()`, supporting quota health and persistent-storage requests.
- [MDN PWA installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [PWA architecture overview](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app) support a manifest and service-worker app shell while keeping records in IndexedDB.

### GitHub integration

- [GitHub repository contents REST API](https://docs.github.com/en/rest/repos/contents) documents fine-grained Contents permissions and the ≤1 MB / 1–100 MB / >100 MB retrieval behaviors, which are explicit sync test cases.
- [GitHub personal access token guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) supports a fine-grained, repository-scoped, expiring token and minimum permissions.

### Logging workflow references

- [Hevy’s official workout feature guide](https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2025-Features-Guide) reinforces the value of previous performance, set types, supersets, rest timers, routines, and progress graphs. Reps. already owns much of this logic; the revamp should make it usable rather than add duplicate features.
- [MacroFactor’s official food logging guide](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor) documents a unified plate-based multi-add workflow. [Quick Add](https://help.macrofactorapp.com/en/articles/41-quick-add-calories-and-macros-to-your-food-log), [favorites](https://help.macrofactorapp.com/en/articles/257-favorite-foods), and [saved reusable meals](https://help.macrofactorapp.com/en/articles/239-save-a-meal-for-later-use) support the fast paths in §9.

### Build and performance

- [Vite production builds](https://vite.dev/guide/build) support a reproducible optimized static application rather than handwritten/ambiguous bundle steps.
- [React reducer and context guidance](https://react.dev/learn/scaling-up-with-reducer-and-context) supports separating deterministic feature updates from UI without requiring a large new state library.
- [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds) provide the LCP, INP, and CLS budgets used in §13.4.

---

## 20. Implementation protocol for later work

For every implementation task based on this plan:

1. Identify the work-package ID and milestone gate.
2. Read the affected current implementation and data shapes; do not rely only on this audit.
3. State data/migration impact before coding.
4. Implement through canonical domain actions and shared primitives.
5. Add unit/integration/e2e/accessibility evidence proportional to risk.
6. Verify populated desktop and mobile states visually.
7. Run migration reconciliation when a schema/import/export/sync path changes.
8. Update this document’s checklist/decision log with the actual decision.
9. Do not remove the replaced implementation until parity and migration are accepted.
10. End with exact changed files, tests, known limitations, rollback path, and the next unblocked work package.

### Suggested first implementation slice

Start with **SAF-01 → SAF-02 → SAF-03**, then **ARC-01 → ARC-02 → UI-01 → UI-02**. Do not begin by restyling the current Log or Body pages: that would deepen investment in the structures being replaced and would not solve the migration risk.

The first user-visible vertical slice should then be **TRN-01 + TRN-03 + TRN-04** using migrated fixture data, followed by **NUT-01 + NUT-02 + NUT-03**. This validates the two highest-frequency workflows and the new data layer before analytics and planning are rebuilt.

---

## 21. Final definition of done

The revamp is complete when Reps. feels like one product rather than a collection of pages: Today leads to action; Train makes logging effortless; Nutrition makes repeated meals fast; Progress explains trends without chart clutter; Plan schedules the work; Settings makes data ownership and GitHub health obvious. The current workbook, browser, and GitHub histories are reconciled record by record, recoverable from independent backups, and represented in the canonical model. Only then may the predecessor, duplicate loggers/analytics, generated-data ambiguity, and redundant styles be removed.

---

## 22. Implementation checkpoint — 26 August 2026

### Implemented in the current working tree

- **SAF-01/02/03:** schema-2 canonical snapshot, first-run untouched legacy-key backup, transactional IndexedDB persistence, runtime validation, migration report, checksums, date ranges, source/destination counts, and activation refusal on unexplained drops.
- **ARC-01/02:** typed domain entities, stable IDs, soft deletes/tombstones, checkpoints, portable JSON import/export, outbox state, storage quota/persistence controls, and a Vite/TypeScript production build.
- **SYNC-01/02:** existing GitHub configuration migration, repository/branch/path/token settings, local-first pull/push, entity reconciliation, pre-sync checkpoints, large-file read fallback, offline state, and delayed auto-sync. The token remains device-local and is excluded from the canonical snapshot.
- **UI-01/02:** responsive five-area shell, mobile bottom navigation, command search, quick add, shared dialogs/forms/cards/buttons, light/dark/system modes, compact density, keyboard focus handling, chart text alternatives, reduced-motion support, and local system fonts with no runtime font request.
- **TOD-01:** actionable Today screen with active/next workout, weekly signals, nutrition, recent sessions, weight, insight, and sync state.
- **TRN-01–05:** consolidated history, search across notes/sets, full routine/day/exercise editing, exercise library, session detail, soft-delete restore, and a fully new workout logger with autosave, previous-set copying, load/unit/reps, preference-aware RPE/RIR/both/hidden effort logging, set types, set/exercise notes, add/remove/reorder alternatives, progression suggestions, rest/elapsed timers, plate calculator, and finish summary.
- **NUT-01–05:** meal or chronological diary views, plate-based multi-add, recents/favorites ranking, quick totals, saved-meal creation/replay/archive, copy previous day, edit/delete/undo, preference-aware macro visibility, food library, duplicate-source visibility, energy intake, effective-dated targets, and weight logging/trends.
- **PRG-01–04:** overview, frequency/volume charts, strength exercise index, estimated records, preserved lifetime PRs, body-weight trend, and per-exercise complete set history.
- **PLN-01–03:** month calendar, agenda, move/skip controls, routine scheduling, block views, and an explicit idempotent 8-week return-program installer that creates a checkpoint first and protects the holiday gap.
- **SET-01–05:** profile, appearance, training, nutrition, GitHub, backups/storage, import review/confirmation, legacy access, and migration evidence.
- **REL-01:** static production package retains the legacy app and data scripts as a rollback path, adds a PWA manifest/service worker, and includes a GitHub Pages build/deploy workflow.

### Verification evidence completed

- Embedded data audit: 144 workout slots, 48 performed workout sessions, 24 weight entries, 24 nutrition-total days, 85 workbook food definitions, 96 public catalog definitions, 121 raw stats rows, and SHA-256 checksums for each embedded source.
- Automated tests cover embedded migration/reconciliation, ID uniqueness, note-only/skipped semantics, predecessor raw-state preservation, Strict Mode initialization coalescing, GitHub entity reconciliation, and idempotent return-program installation.
- The predecessor sync-merge regression suite remains green.
- Type checking and production build pass.
- Every new route was smoke-tested in the live browser; populated desktop Progress/Settings and 390 × 844 Today/Nutrition/workout views received visual inspection.
- Clean production-browser checks covered routine creation and prescription editing, chronological nutrition with macro visibility preferences, RIR workout entry, and browser diagnostics with zero errors or warnings.
- Live QA corrections: viewport-anchored dialogs, independently scrolling mobile food results with reachable actions, visible mobile effort logging, preference controls that affect their screens, quick-action deep links, duplicate exercise-ID normalization, one-time migration under React Strict Mode, and note-only sessions excluded from completed-workout analytics.

### Release acceptance still required before deleting legacy code

- Execute a restore drill using a real exported backup and a real GitHub commit on a disposable copy.
- Test GitHub sync with two real devices, simultaneous same-session edits, revoked credentials, 404 creation, rate limits, and a state file above 1 MB.
- Run automated accessibility scanning plus VoiceOver/TalkBack and keyboard-only checks.
- Verify Safari/iOS Safari, Chrome/Android, Firefox, installed PWA behavior, offline reload, 200% zoom, and the full width matrix from §18.5.
- Measure production Core Web Vitals and split the main JavaScript chunk if the real-device interaction budget requires it.
- Keep `Reps.html`, the source data scripts, legacy browser keys, and automatic backups until the user signs off after using the new logger with real entries.

## 23. Continuation checkpoint — 27 August 2026

### Added in this continuation

- **TRN-03 lifecycle correction:** opening or autosaving a workout no longer changes a `draft` into `inProgress`. A current-day session becomes active only when the first set is completed; a backdated session remains a draft until it is explicitly finished.
- **Deterministic discard:** pending autosave is cancelled before discard, tombstones are idempotent, completed history is protected, navigation replaces the deleted live route, and Train provides a second confirmed discard entry point.
- **Historical workout logging:** Train now has a dedicated “Log past workout” entry point with an actual-date field. The logger clearly identifies past logging, does not run a live timer, and the finish sheet permits title, date, and duration correction.
- **PRG-03 adherence:** Progress now compares planned and completed workouts over the last twelve calendar weeks, including zero-activity weeks, with a responsive and text-described paired-bar visualization.
- **EXP-01 CSV slice:** Settings can export training sets, nutrition entries, and body measurements as escaped, identifier-preserving CSV files in addition to the full canonical JSON backup. Deleted-record metadata is retained where relevant.
- **Cross-surface semantics:** Today, Train, the global header, the active-session strip, quick actions, and command search now distinguish a draft from a genuinely active workout.
- **Stable form focus:** shared dialogs no longer rerun their focus setup when a controlled field updates, so exercise search and other modal text entry accept uninterrupted multi-character typing while retaining Escape handling and focus return.
- **Locale-friendly workout decimals:** load, RPE, RIR, and session RPE fields preserve editable text and accept either a comma or period as the decimal separator. Values are normalized to finite numbers only after valid input, preventing transient `NaN` state without changing recorded units or history.
- **Opt-in workout timers:** session and rest timers are disabled by default for new and existing settings that do not define a preference. Settings → Training exposes independent toggles; disabled timers do not render, tick, auto-start, or infer a workout duration.

### Automated and browser evidence

- TypeScript type checking, eleven automated tests across six files, and the production build pass.
- Browser flow verified: select yesterday, create a backdated draft, confirm no live timer/status, open the finish sheet, discard, and return to Train with no active draft.
- Browser flow verified: create a current-day empty workout, allow autosave to run, navigate to Today, and confirm it is still presented as “Workout draft · not marked in progress.”
- Browser flow verified: type a multi-character exercise query without refocusing, enter both `22,5` and `22.5` loads without `NaN`, complete a set, and confirm no session or rest timer appears with default settings.

### Functionality still not fully implemented from the master plan

- **Workout power features:** explicit superset/circuit groups, multi-exercise add, duplicate/soft-delete sets, distance modes, desktop bulk paste, and a pure tested injury-aware progression policy.
- **Nutrition completion:** daily note/completeness state, copy-one-meal and paste-to-multiple-dates flows, broader duplicate-food review tooling, and energy-estimate confidence/explanation.
- **Progress depth:** muscle/load foundation, goal/body-composition views, chart data tables, and richer annotations/comparisons.
- **Data administration:** add/switch/archive profiles, conflict inbox, human/AI context exports, dry-run bulk tools, and the guarded wipe flow.
- **Release proof:** the two-device GitHub matrix, real backup/GitHub restore drill, accessibility assistive-technology pass, cross-browser/installed-PWA matrix, and production performance measurements remain mandatory before legacy removal.
