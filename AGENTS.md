# AGENTS.md — gigtracker

## Two things live in this repo

- `index.html` / `manifest.json` / `sw.js` at the repo root — the original,
  live, deployed single-file PWA (GitHub Pages, `rowellscott.github.io/gigtracker/`).
  Zero build step by design (see `SETUP.md`).
- `app/` — an Angular 21 rewrite in progress. Standalone components,
  zoneless, no NgModules.

Until the rewrite ships, treat the two as independent: the root files are
what's actually deployed; `app/` is not wired into deployment yet.

## `app/` — build and test

This project's test runner is **Vitest**, not Karma — Angular 21's default,
not the older Angular convention most training data assumes. Do not write
a `karma.conf.js` or pass Karma-style flags (`--browsers=...`); there is no
Karma builder registered in `angular.json`, so any such flag or config is
inert or errors out.

- Install: `cd app && npm install`
- Build: `cd app && npx ng build`
- Test: `cd app && npx ng test --watch=false` (no `--browsers` flag needed
  or supported)

## Conventions

- IndexedDB database name and store names are fixed: `GigTrackerDB`, stores
  `recs` and `kv`. Both the legacy app and `GigDbService` (in `app/`) read
  the same on-device database — never change these names or an existing
  installed user's gig/tax history becomes unreachable.
- Tax/cost math lives in one place per side: `calc()` in `index.html` for
  the legacy app, `TaxCalcService` in `app/`. Both must stay behaviorally
  identical (same field names, same arithmetic) — see `TaxCalcService`'s
  docstring.
