# GigTracker 2026 — Setup

No server. No accounts. No sync setup. Just open the app and go.

---

## Option A: GitHub Pages (recommended — free, permanent HTTPS URL)

Works on any phone instantly. Share the URL with any musician.

1. Go to **github.com** → sign up free → New repository
2. Name it `gigtracker` → Public → Create
3. Upload all files from this folder (drag and drop in the GitHub web UI)
4. Settings → Pages → Source: **main branch** → Save
5. Your app is live at `https://YOUR-USERNAME.github.io/gigtracker`

Open that URL in Chrome (Android) or Safari (iPhone) → browser prompts "Add to Home Screen" → done.

---

## Option B: Netlify Drop (even simpler, 30 seconds)

1. Go to **netlify.com/drop**
2. Drag the entire `gigtracker-v2` folder onto the page
3. Instant HTTPS URL — no account needed

---

## Option C: Local only (no internet required)

```bash
# Mac/Linux — serve locally
cd gigtracker-v2
python3 -m http.server 8080

# Open on phone (same WiFi): http://YOUR-MAC-IP:8080
# Find your IP: ipconfig getifaddr en0
```

Note: Service worker (offline mode) requires HTTPS or localhost. For local serving, use your Mac's browser at `http://localhost:8080` or use Option A/B for the phone.

---

## Install on Android

1. Open Chrome → go to your app URL
2. Chrome menu (⋮) → **Add to Home screen**
3. If you had to restart your phone after install — that's a one-time Chrome quirk, normal

## Install on iPhone

1. Open **Safari** (must be Safari, not Chrome)
2. Tap the Share button (box with arrow) → **Add to Home Screen**
3. Requires iOS 16.4 or later

---

## Backup workflow

Your data lives **only on your device**. Export regularly:

- ⚙ Settings → **Export CSV** → saves to Downloads, email to yourself, or save to iCloud/Google Drive
- ⚙ Settings → **Export full backup (JSON)** → restore on a new phone with the Import button
- The **dot** in the top-right header turns amber when it's been 14+ days since your last export

**Recommended:** Export CSV monthly. Your tax accountant can open it in Numbers/Excel directly.

---

## Moving to a new phone

1. On old phone: ⚙ → Export full backup (JSON) → save to cloud or email to yourself
2. On new phone: open the app URL, install it
3. ⚙ → Import → select the JSON file → all records restored

---

## Tax reference (2026)

| | |
|---|---|
| IRS mileage rate | **$0.725/mile** |
| Business meals | 50% deductible |
| Room/space rental | 100% deductible |
| SE tax formula | net income × 0.9235 × 15.3% |
| FL state income tax | $0 |
| Q1 due | Apr 15 |
| Q2 due | Jun 16 |
| Q3 due | Sep 15 |
| Q4 due | Jan 15, 2027 |
