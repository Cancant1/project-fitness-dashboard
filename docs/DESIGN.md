# Reps — design rules

Mario's feedback (11 Oct 2026): pages were "way too much information", "wordy", "PowerPoint-bar-esque", "ugly". He wants
elegant, gorgeous, inspiring, visual — "the best dashboard ever for this kind of thing". The reference implementation is
**Today** (`src/pages/TodayPage.tsx`, `today.css`) built on the kit (`src/ui/kit.tsx`, `kit.css`).

## Principles

1. **One job per page.** Decide the single question the page answers and put that answer first, big.
   - Today: what do I do today? · Workouts: start something / find a session · Progress: am I getting stronger?
   - Records: what have I achieved (inspire) · Plan: where am I in the block, what is this week?
   - Food: what have I eaten vs target · Weight: where is my weight going · History: find a past session.
2. **Show, don't tell.** Rings, sparklines, smooth area charts, radar, heatmaps, big rounded numbers. Prefer one beautiful
   chart over three tables.
3. **Words are a cost.** No explanatory sentences on dashboards. A caption is ≤ 5 words. Rules, methods and footnotes go
   behind a disclosure, a Sheet or a "How it works" page. Never repeat what a number already says.
4. **Fewer, bigger things.** 3–6 blocks per screen. Hero numbers 46–64 px (`--num`, rounded). Generous space (cards pad 20,
   gaps 16–24).
5. **Even and calm.** Equal-height tiles in a row, no orphan cells, no half-empty rows, no uneven columns. Two-column
   dashboard on desktop (`.k-dash` with two `.k-col`), single column on the phone (393 px, 16 px gutters, ≥ 44 px targets).
6. **Colour with purpose.** Blue (`--accent`, `--chart-1`) = actions and data. Pompeian red (`--warm`, `--chart-2`, hero
   gradient `--hero-1/2`) = the moment that matters: today's session, rep-outs, PRs, goals. Neutral greys for everything
   else. One hero (red) card per page at most. Tokens only; light and dark both.
7. **Interaction over density.** Segmented controls switch views (lift, range); tap a chart point for its value (AreaChart
   has a built-in tooltip); tap a row to drill in.
8. **No chrome noise.** No borders around everything, no outlined pill clusters, no circles around numbers unless they are
   the control. Selected state = filled pill or red dot, not a heavy outline.

## Kit (src/ui/kit.tsx)

`PageHead`, `Card` (`tone="hero" | "ink"`), `Label` (section label + action link), `Stat` (sm/md/lg/xl), `Delta`, `Ring`,
`Bar` (with marker), `Sparkline`, `AreaChart` (series, bands, refs, markers, tooltip), `Radar`, `WeekHeat`, `Segmented`,
`Pill`; CSS: `.k-dash`/`.k-col`, `.k-grid-2/3/4`, `.k-rows` + `.k-row` + `.k-row-main`, `.k-num`, `.k-muted`.
Page-specific styles go in a CSS file next to the page.
