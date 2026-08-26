# Reps. 2026

Reps. is a local-first training, nutrition, planning, and progress journal. The 2026 application replaces the old dashboard at `index.html`; the predecessor remains available at `Reps.html` during acceptance.

## Data safety

- On first launch, the app copies the existing Reps and Fitness OS browser values into an untouched IndexedDB backup before activating schema 2.
- The embedded workout export, public food catalog, routines, browser data, notes, weight history, targets, and legacy facts are reconciled into one versioned snapshot.
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

## Verification and production build

```sh
pnpm verify
pnpm audit:data
node tests/sync-merge.test.mjs
```

The production site is written to `dist/`. The build copies the legacy fallback and source data into that package. GitHub Pages builds and verifies the app through `.github/workflows/pages.yml`.

## Main areas

- Today: next actions and current signals.
- Train: workout logging, history, programs, and exercise library.
- Progress: volume, frequency, records, exercise history, and body weight.
- Nutrition: plate-based food logging, reusable foods/meals, targets, energy, and weigh-ins.
- Plan: calendar, agenda, routines, blocks, and the optional 8-week return plan.
- Settings: profile, appearance, logging defaults, backups, imports, migration evidence, and GitHub sync.

The detailed implementation and release checklist is in `../docs/reps-2026-full-revamp-master-plan.md`.
