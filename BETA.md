# Beta / staging setup

`/beta/` is a full copy of the app deployed alongside production at
`https://rowellscott.github.io/gigtracker/beta/`, for trying changes on
a phone before they touch the real app.

## Why this is safe to install and bang on

- **Separate IndexedDB** (`GigTrackerDB_beta` vs production's `GigTrackerDB`).
  IndexedDB is scoped per browser *origin*, not per path — `/` and `/beta/`
  are the same origin (`rowellscott.github.io`), so without this the beta
  build would read/write your real tax records. It won't: it has its own
  empty database. Test data in beta never appears in production and vice versa.
- **Separate manifest identity** (`beta/manifest.json`: its own `start_url`/
  `scope`/`id`, name "GigTracker BETA", amber theme). Installing it to your
  home screen creates a second, clearly-labeled icon — it never touches or
  replaces the real "GigTracker 2026" icon.
- **Separate service worker + cache name** (`gigtracker-beta-v1` vs
  production's `gigtracker-v4`). Its scope only covers `/beta/`, so it can
  never intercept or interfere with requests to the real app.

Net effect: install the BETA icon, try the new stuff for real on your phone
(fake entries, fake locations, whatever), and none of it can reach or break
the app you actually use for taxes.

## What NOT to do

Don't copy `beta/manifest.json` or `beta/sw.js` over the root ones — their
whole job is carrying the beta-only identity/isolation. The only thing that
promotes is the actual app logic in `index.html`.

## Promotion (production stays stable — only asked for, never automatic)

When a beta build has been tried and is good to ship:

1. Copy `beta/index.html` → `index.html` (full replace — this is where all
   the real logic lives), then **undo the beta-only edits** listed under
   "Refreshing beta" below. Skipping this would point production at the
   empty beta database.
2. Copy `beta/sync.js` → `sync.js`.
3. In root `sw.js`, bump `CACHE` by one (e.g. `gigtracker-v7` →
   `gigtracker-v8`) so already-installed phones actually pick up the update,
   and bring over beta's other `sw.js` changes (today: `./sync.js` in
   `SHELL`, and the fetch handler skipping non-GET and cross-origin requests,
   so Google sign-in and Sheets reads are never served from cache).
   Do **not** touch root `manifest.json` — its identity fields must stay
   stable forever; that's what keeps the real home-screen icon working
   without a reinstall.
4. Commit and push `index.html` + `sync.js` + `sw.js`.
5. The first production sync creates the "GigTracker Data" sheet. Put its id
   in the `gig-log` Claude skill (`scotts-dashboard/tools/claude-skills/gig-log/`)
   in place of the BETA sheet's id, and re-upload the skill.

That's it — ask me to "promote beta" and I'll do the above.

## Refreshing beta from production

To start a new beta round from what's currently live, copy root's
`index.html`, `sync.js` (once promoted), `icon-192.png`, `icon-512.png` into
`beta/` and re-apply the three beta-only edits in `beta/index.html`:
- `<title>`, the `apple-mobile-web-app-title` meta, and the topbar title →
  "GigTracker BETA" / 🧪
- `theme-color` meta → `#92400e`
- the `DB_NAME` constant → `'GigTrackerDB_beta'` (keep the version number in
  the `indexedDB.open(...)` call in sync with production). The sync sheet
  name follows `DB_NAME`, so beta always syncs to "GigTracker Data (BETA)"
  and can never touch the real sheet.

`beta/manifest.json` and `beta/sw.js` don't need touching unless production's
own manifest fields or SW logic changed.

## Google Sheet sync (in production since 2026-11-11)

Settings → **Connect Google Sheet** keeps records in a Google Sheet the app
creates in your Drive ("GigTracker Data", or "GigTracker Data (BETA)" from
`/beta/`). Every device that connects syncs against it, and Claude adds gigs
by appending a row to its **Inbox** tab (skill: `gig-log`).

- Tabs: `Inbox` (people and Claude write here; GigTracker fills `Imported`
  with the record id), `Records`, `Locations`, `Settings` (GigTracker owns
  these; edit records in the app, not in the sheet). `Gigs`, `Rehearsals`
  and `Expenses` are read-only views: one QUERY formula each over Records
  (`VIEW_TABS` in `sync.js`), re-created by the next sync if deleted.
- Merge: newest `updatedAt` wins per record; deletes are kept as
  `deleted = TRUE` so they reach every device. Inbox rows get an id derived
  from their content, so importing on two devices still makes one record.
- Sync runs on Connect, ⟳, ~3 s after any edit, and on returning to the app,
  while the Google sign-in (1 hour) is fresh. Otherwise ⟳ turns amber and a
  tap signs in again.
- Google side: Cloud project `scotts-dashboard`, OAuth client "GigTracker
  web" (origins `https://rowellscott.github.io`, `http://localhost:5174`),
  consent screen in Testing with rowell.scott@gmail.com as the test user.
  Scope `drive.file`: the app can only open the sheet it created.
- Logic lives in `sync.js` (no DOM/network) and is tested with
  `node --test test/*.test.mjs`. Local try-out: `python3 -m http.server 5174`
  from the repo root, then http://localhost:5174/beta/.
