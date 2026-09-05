# Architecture

Angular 21, standalone, zoneless. Four tabs (`Add`, `Log`, `Summary`,
`Settings`) mounted one at a time by `App`; no router.

## Data layer — shared with the legacy app

`GigDbService` reads and writes the same on-device IndexedDB database the
original single-file PWA (`../index.html`) uses: database `GigTrackerDB`,
object stores `recs` (gig/rehearsal/expense records, keyed by `id`) and `kv`
(settings and small key/value state, keyed by `k`). The names and key paths
are fixed — changing them orphans an installed user's gig and tax history.
The Angular app is a new UI over the same storage, not a new schema.

## Tax math

- `TaxCalcService` — pure port of `calc()` from the legacy `index.html`:
  IRS mileage deduction, 50%-deductible meals, SE tax
  (`net × 0.9235 × 15.3%`), combined income tax. Same field names, same
  arithmetic; both sides must stay behaviourally identical or historical
  records' stored calculations drift.
- `TaxSettingsService` — single source of truth for the user's rates
  (`appSettings` in `kv`). Loads once (`ensureLoaded()`), exposes
  `settings()` plus derived `irsRate` / `combinedRatePct` signals. `Add`,
  `Log`, `Summary` and `Settings` all read rates from here instead of each
  loading and re-deriving them.

## Cross-tab state

`AppStateService` holds the small bit of UI state the legacy app kept in
module-level variables: which tab is active, and the record currently open
for editing. "Edit" on a Log card sets `editRecord` and switches to `Add`;
saving or cancelling clears it and returns to `Log`.

## Deployment

The legacy PWA is what's deployed at the domain root. The Angular preview
build is deployed under `/gigtracker/preview/` — `main.ts` registers the
service worker relative to `<base href>`, so the preview's SW scopes to that
subpath and leaves the live app untouched.
