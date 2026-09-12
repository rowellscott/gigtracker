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
   the real logic lives).
2. In root `sw.js`, bump `CACHE` by one (e.g. `gigtracker-v4` →
   `gigtracker-v5`) so already-installed phones actually pick up the update.
   Do **not** touch root `manifest.json` — its identity fields must stay
   stable forever; that's what keeps the real home-screen icon working
   without a reinstall.
3. Commit and push `index.html` + `sw.js`.

That's it — ask me to "promote beta" and I'll do the above.

## Refreshing beta from production

To start a new beta round from what's currently live, copy root's
`index.html`, `icon-192.png`, `icon-512.png` into `beta/` and re-apply the
three beta-only edits in `beta/index.html`:
- `<title>`, the `apple-mobile-web-app-title` meta, and the topbar title →
  "GigTracker BETA" / 🧪
- `theme-color` meta → `#92400e`
- the `indexedDB.open(...)` call → `'GigTrackerDB_beta'` (keep the DB
  version number in sync with whatever production is using)

`beta/manifest.json` and `beta/sw.js` don't need touching unless production's
own manifest fields or SW logic changed.
