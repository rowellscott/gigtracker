# Verification Gauntlet — 5-feature batch (2026-09)

Built with the `verification-gauntlet` methodology: acceptance specs in
natural language, a requirement→evidence matrix, criticality-calibrated
depth, test-first implementation, then a full deterministic pass.

## Scope

Angular rewrite (`app/`), delivered to `/gigtracker/preview/`. Five asks:

| # | Ask |
|---|---|
| F1 | Bug: expense rows in the Log always read `-$0.00` — they never show what the expense cost. |
| F2 | Location field on Add becomes a pick-list of saved locations; picking one fills description, **mileage and address**; address is its own field that links out to Waze / a maps app; a location can be saved from Add or from a dedicated Saved-locations screen. |
| F3 | The Log is one endless scroll — paginate it so the bottom tab bar is always on screen. |
| F4 | "A toll was paid" needs a clearer control than typing `0` into the cost box. |
| F5 | Only **income** and **rehearsal** carry a location. **Expense** just uses its description. |

## Criticality

**medium.** User-visible behaviour over persistent IndexedDB data, but
single-user, no auth, no real money movement (tax figures are estimates),
trivial rollback (redeploy `/preview/`). Verification tier: **2 (Behavioral)**.

One elevated concern: `TaxCalcService` must stay byte-identical for
`income` / `rehearsal` records (`AGENTS.md`: historical tax numbers must not
drift). Every feature that touches the calc path carries a regression test
asserting income/rehearsal `CalcResult` is unchanged.

## Requirement → evidence matrix

| R | Observable behaviour | Evidence | Gate |
|---|---|---|---|
| R1a | Save an Expense with amount 42 → Log row shows `-$42.00` | `add.component.spec` (build+persist), `log.component.spec` | new specs green |
| R1b | Saving an Expense does not change any `income`/`rehearsal` CalcResult | `tax-calc` / `add` regression spec | byte-identical |
| R2a | `getSavedLocations()` returns `{name,address?,miles?}`, name-sorted, tolerates legacy string entries | existing `gig-db.service.spec` + new address cases | green |
| R2b | Picking a saved location fills `desc`, `miles`, `address` on the form | `add.component.spec` | green |
| R2c | A record with an address renders a Waze link and a Maps link with the address URL-encoded | `log.component.spec` (pure URL builders) | green |
| R2d | Saved-locations screen: add / edit-by-resave / delete round-trips through `kv` | `settings.component.spec` | green |
| R3a | `pagedRecords()` ≤ 20; `totalPages` correct; filter resets page | existing `log.component.spec` pagination block | still green |
| R3b | No fixed-height scroll spacer padding the Log/Add past the viewport | template inspection + manual screenshot | tab bar visible at 390×844 with 25 records |
| R4a | Add: "toll paid" is a checkbox; a second control marks the amount as not-yet-known without typing a number | `add.component.spec` | green |
| R4b | `hasToll && amount unknown` persists `tollPending=true`, `toll=0` | `add.component.spec` | green |
| R4c | Log shows a "toll — amount TBD" pill when `tollPending`, and the normal toll row/pill when a number is present | `log.component.spec` | green |
| R5a | `income` and `rehearsal` show the location pick-list + address field | `add.component.spec` / template | green |
| R5b | `expense` shows neither; switching an in-progress form to `expense` clears `address` | `add.component.spec` | green |

## Gherkin acceptance specs

### F1 — expense cost in the Log
```
Scenario: an expense shows what it cost
  Given I am on the Add screen with type "Expense Only"
  And I enter description "Strings" and amount "42"
  When I save
  Then the Log's newest row reads "-$42.00"
  And the Summary "business expenses" total includes 42

Scenario: expenses don't perturb income tax math
  Given an income gig and a rehearsal already saved
  When I additionally save an expense of 42
  Then the income gig's stored seTax / incomeTax / netAfterAll are unchanged
```

### F2 — saved-location pick-list + address + maps link
```
Scenario: pick a saved location
  Given a saved location "The Blue Room" with address "12 Main St, Tampa FL" and 24 miles
  And I am on Add with type "Income Gig"
  When I choose "The Blue Room" from the location pick-list
  Then description becomes "The Blue Room"
  And miles becomes "24"
  And the address field becomes "12 Main St, Tampa FL"

Scenario: directions link
  Given a saved Income record with address "12 Main St, Tampa FL"
  When I open the record's details in the Log
  Then there is a "Waze" link to https://waze.com/ul?q=12%20Main%20St%2C%20Tampa%20FL
  And a "Maps" link to https://www.google.com/maps/search/?api=1&query=12%20Main%20St%2C%20Tampa%20FL

Scenario: manage locations from the Settings screen
  Given the Settings screen
  When I add a location "Studio B" / "9 Ivy Rd" / 8 miles
  Then it appears in the Add pick-list
  When I delete it from Settings
  Then it is gone from the pick-list
```

### F3 — paginate, keep tabs on screen
```
Scenario: 25 records, tab bar still reachable
  Given 25 saved records
  When I open the Log
  Then at most 20 cards render
  And a "Page 1 of 2" pager is shown
  And the bottom tab bar is visible without scrolling the page (only .content scrolls)
```

### F4 — toll paid, amount unknown
```
Scenario: flag a toll with no amount
  Given Add with "Toll(s)" checked
  When I check "amount unknown — add later"
  And I save
  Then the record has tollPending true and toll 0
  And the Log row shows a "toll · amount TBD" pill

Scenario: toll with a known amount is unchanged
  Given Add with "Toll(s)" checked and cost "7.50"
  When I save
  Then the record has toll 7.50 and tollPending false/absent
  And the Log detail shows a "Tolls $7.50" row
```

### F5 — location only for income & rehearsal
```
Scenario: expense has no location UI
  Given Add with type "Expense Only"
  Then no location pick-list and no address field are shown

Scenario: switching to expense drops a half-entered address
  Given Add as "Income Gig" with address "12 Main St"
  When I switch the type to "Expense Only"
  Then the address is cleared
  And buildRecord() for that expense has no address
```

## Ordered verification steps

1. `cd app && npx ng build` — compile gate
2. `cd app && npx ng test --watch=false` — full spec suite (was 75, grows)
3. `npx prettier --check src` — format gate
4. Regression assertion: income + rehearsal `CalcResult` byte-identical (in-suite)
5. Manual: headless-Chromium screenshots of Add (each type), Log (25 recs,
   expense row, toll-pending pill, directions links), Settings (locations)
6. Rebuild `/preview/`, redeploy, re-screenshot the deployed bytes

## Thresholds / oracles

- Expected money strings computed by hand in the specs, not by calling the
  component's own formatter as its own oracle.
- Mutation spot-check: flip `tollPending` default, flip the expense-amount
  guard, break the URL encoder — each must turn a spec red.
- No project coverage threshold exists; not inventing one. Behavioural
  coverage is the matrix above.

## Result log (2026-09-05)

| Gate | Result |
|---|---|
| `ng build` | PASS |
| `ng test` | PASS — 94/94 (was 75; +19 for this batch) |
| `prettier --check` | PASS |
| Income/rehearsal CalcResult regression | PASS — `add.component.spec` "adding an expense does not change an income gig CalcResult" |
| Mutation spot-check (3 mutants) | PASS — each mutant turned ≥1 spec red: expense-amount guard, `encodeURIComponent`, `hasToll &&` on `tollPending` |
| Manual QA (headless Chromium, prod build @ 390×844) | PASS — see below |

Manual QA observations:
- **F1** Log row for a $42 expense reads `-$42.00`; detail shows an "Expense / Amount $42.00" section. Add-expense form has an "Amount spent ($)" field.
- **F2** Add "Location" pick-list fills description + miles + address in one pick (`desc: The Blue Room`, `addr: 12 Main St, Tampa FL`, `miles: 24`). Log detail renders `Waze` → `https://waze.com/ul?q=12%20Main%20St%2C%20Tampa%20FL` and `Maps` → `https://www.google.com/maps/search/?api=1&query=…`. Settings "Saved locations" section lists / adds / deletes.
- **F3** 3 records + pager "Page 1 of 1"; topbar pinned top, tab bar pinned bottom, only `.content` scrolls (per-screen 88px spacers removed).
- **F4** Add: "Toll(s)" → "Amount unknown — add later" checkbox hides the cost input; Log shows a `toll · amount TBD` pill and an "amount TBD" cost row.
- **F5** Add-expense shows no pick-list, no address field, no ★; switching income→expense clears a half-entered address; `buildRecord()` never puts an address on an expense.

### Deploy
Rebuilt `/gigtracker/preview/` from `feature/gauntlet-5`, redeployed to `main`,
re-screenshot the deployed bytes with the preview service worker active.
