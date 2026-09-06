# Reps. 2026

Reps. is a local-first training, nutrition, planning, and progress journal. The 2026 application replaces the old dashboard at `index.html`; the predecessor remains available at `Reps.html` during acceptance.

## Data safety

- On first launch, the app copies the existing Reps and Fitness OS browser values into an untouched IndexedDB backup before activating schema 2.
- Existing browser and GitHub data, the public food catalog, routines, notes, weight history, targets, and legacy facts are reconciled into one versioned snapshot. The private workbook export is also reconciled when running the local migration copy.
- A migration with unexplained record drops is refused.
- Deletions are soft and recoverable; imports, sync operations, and program installation create checkpoints.
- The GitHub token stays only in local browser settings and is never included in exported or synced state.
- Keep `Reps.html`, the original `data/` files, and legacy browser keys until the restore drill and real-use sign-off are complete.

## Local run

Use Node 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `/app.html` for the source-development entry. The root page is a compiled fallback retained because this repository may be published directly from `main` by GitHub Pages.

## Verification and production build

```sh
pnpm verify
pnpm audit:data
node tests/sync-merge.test.mjs
```

The production site is written to `dist/`. The build copies the legacy fallback and public seed data into that package. The git-ignored private `data/fitness-data.js` workbook export is deliberately excluded. GitHub Pages builds and verifies the app through `.github/workflows/pages.yml`; the committed `dist/` package also keeps branch-based Pages publishing functional.

## Main areas

- Today: next actions and current signals.
- Train: workout logging, history, programs, and exercise library.
- Progress: volume, frequency, records, exercise history, and body weight.
- Nutrition: plate-based food logging, reusable foods/meals, targets, energy, and weigh-ins.
- Plan: calendar, agenda, routines, blocks, and the optional 8-week return plan.
- Settings: profile, appearance, logging defaults, backups, imports, migration evidence, and GitHub sync.

The current completion scope and remaining-work overview are in [the master plan, §25](docs/reps-2026-full-revamp-master-plan.md#25-implementation-and-remaining-work-overview--6-september-2026). Earlier advanced feature lists are deferred, not release requirements.

Local edits are saved before they are reported as saved. Pull merges into the latest saved state and remains pending until pushed. Push acknowledges only its uploaded revision; edits saved during upload remain pending. Pending status survives reload in IndexedDB. Existing automatic-sync preferences are preserved.

The previous app and committed production build remain necessary: recovery acceptance is still open, and GitHub Pages is currently configured to publish from the root of `main`. Do not delete these paths until the corresponding gates in §25 pass.
