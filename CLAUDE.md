# Shop Hours

A small phone app (iPhone and Android) for logging hours worked on car body and paint projects (for example "AMX, 10/16/2026, 10 hrs, blocked 120 door/trunk jams"), with an optional estimated total for each project so the user can see how much is left. It's given away free to car and shop people: no accounts, no subscriptions, no server we run. Each user's data goes only to their own phone and their own Google Sheet. Users work in garages that may not have a signal, and most aren't technical. **Their data must never be lost.** That rule outranks every other consideration in this repo.

## Current state (v1.0.x)

It's a Home Screen web app: no build step, vanilla JS. One shared copy is served from GitHub Pages at https://emum.github.io/shop-hours/. Every change is backed up automatically to the user's Google Sheet through an Apps Script web app that each user deploys in their own account. Android is supported in principle but hasn't been tested on a real device yet.

```
app/index.html            the whole app: markup, CSS, JS in one file
app/sw.js                 offline cache (cache-first for app files, network for Google)
app/manifest.webmanifest  install metadata
app/marker.woff2          Permanent Marker font (SIL OFL), used for project names
app/icon-*.png            Home Screen icons
backup-script/Code.gs     Apps Script: receives changes, writes the sheet, serves restore
tests/gasmock.js          in-memory mock of SpreadsheetApp / ContentService / LockService
tests/script.test.js      unit tests for Code.gs against the mock
tests/e2e.py              Playwright run of the app at iPhone size against the mocked script, plus sync scenarios (timeouts, restore, sheet changes) on a fake clock
LICENSE                   MIT, except the font file, which keeps its own license
README.md                 end-user guide: what it is, setup (sheet, install, connect), troubleshooting
images/                   README screenshots (sample data, not test output)
.github/workflows/pages.yml  on push to main: run both test suites, then publish app/ to Pages
```

The README is written for car and shop people, not developers. Its steps, the Phone setup tab text in `Code.gs` and the app's Backup screen use the same words ("Web app link", "backup key", "Phone setup tab"). Change all three together. The troubleshooting table quotes the app's and script's error messages, so update it when those messages change.

## How it works

**Data model** (all in `localStorage`):
- `sh.data` holds `{projects:[{id,name,est|null,status:'active'|'done',created,updated}], entries:[{id,projectId,date:'YYYY-MM-DD',hours,note,created,updated}]}`. IDs are client-generated. Timestamps are ISO.
- `sh.outbox` is the queue of pending backup operations, `[{q, key:'p:<id>'|'e:<id>', op}]`.
- `sh.settings` is `{url, key}`, the Apps Script URL and its passphrase.
- `sh.sync` is `{lastOk, lastError, lastTry}`.

**Write path:** save to local storage first, then enqueue an op, then flush. Op types are `putProject`, `delProject`, `putEntry` and `delEntry`. Each item has at most one pending op. A newer op replaces the older one *in place*, which usually keeps projects ahead of their entries. "Send everything again" can still queue a project after its pending entries, so the script fills in the project name on the Entries tab when the project arrives. A flush POSTs up to 150 ops as one batch, removes them from the outbox only after `{ok:true}`, and backs off exponentially from 15 s to 10 min. Every call to Google is aborted after 45 s (`fetchJson`), so a stalled request can't block later flushes. A timeout also cuts the next batch to a third (minimum 10), and each success doubles it back toward 150. It also retries when the phone comes back online and when the app returns to the foreground.

**POST without a Content-Type header** (it is sent as text/plain) to avoid a CORS preflight, which Apps Script cannot answer. Keep it that way.

**Script side:** it checks the key and takes a script lock. The key is the `APP_KEY` constant if someone typed one in. Otherwise it's a key `setup()` generated and saved in Script Properties, so it survives pasting in a newer `Code.gs`. `setup()` is the first function in the file, so the editor's Run button picks it. It also writes the key on a "Phone setup" tab with next steps. `@OnlyCurrentDoc` limits the permission request to that one spreadsheet. Rows are upserted by ID, and an incoming op is skipped if the sheet's `Updated` value is newer, so the last writer wins by `updated`. A delete copies the row to the `Deleted` tab before removing it. Every non-empty text cell (names, notes) is written with a leading `'`. Sheets drops the `'` and stores the rest as plain text, so nothing gets turned into a formula, date, number or boolean. A blank or unreadable `Updated` cell exports as `''`, so the phone's copy wins on restore. The Projects tab has live `SUMIF` columns for logged hours and hours left. A rename rewrites the project name on the Entries tab.

**Restore:** `GET ?key=…&action=export` returns everything. The app merges it in by ID, keeping the newer `updated` value, and never deletes anything on the phone. It skips any item with a delete still waiting in the outbox, so a restore can't bring back something just deleted.

**Setup ("Save and test"):** if the phone has never backed up, the link changed, or the sheet has fewer projects or entries than the phone, everything on the phone is queued again. Resending is safe because the script upserts by ID and skips stale copies.

## Invariants (do not break these)

1. Never remove an outbox item until the server has confirmed it.
2. Never delete or overwrite local data from a sync or restore without a newer `updated` value.
3. Nothing is ever hard-deleted from the sheet. Deletions go to the `Deleted` tab.
4. The app must fully work offline: opening, logging, editing and viewing totals.
5. Any change to the storage format needs a migration that runs on load. Never require anyone to reinstall or re-enter data.
6. Changing any file in `app/` means bumping `VERSION` in `sw.js`, and the matching `VERSION` in `index.html` (shown on the Backup screen).
7. Changing `Code.gs` must stay backward compatible with app versions already on people's phones. The app must also keep working with older scripts, because users update their own scripts rarely, if ever.

## Known limitations

- On iOS, a Safari tab and the Home Screen app have separate storage. Users must always open the app from the icon. Android's Chrome shares storage between the tab and the installed app.
- Deleting the Home Screen icon deletes local data. The fix is reinstalling and running Restore, but any changes still waiting in the outbox are gone.
- Edits made by hand in the sheet don't flow back to the phone, except through Restore, and only when the sheet's row is newer.
- Rows written by script versions before the always-`'` change may already have been converted by Sheets, for example a note of `3/4` stored as a date. That damage isn't undone automatically. Editing the entry on the phone rewrites the row correctly.
- The backup key travels in the URL query on GET requests. That's acceptable for an hours log, but not for anything sensitive.
- Persistence: the app calls `navigator.storage.persist()`. On iOS, data for Home Screen apps isn't subject to the 7-day eviction.

## Running and testing

```bash
# serve the app locally
python3 -m http.server 8765 --directory app      # then open http://localhost:8765

# backup script unit tests (Node 18+)
node tests/script.test.js

# end-to-end at iPhone size (pip install playwright && playwright install chromium)
cd tests && python3 e2e.py                       # screenshots land in tests/shots/
```

The service worker only registers over HTTPS, so local runs have no offline caching. To test the real thing on a phone, deploy to GitHub Pages or use an HTTPS tunnel.

Run both test suites before calling any change done. Extend them whenever you touch sync, restore or `Code.gs`.

## Conventions

- **No build step and no framework** for the web app unless a decision is made to change that. Keep `index.html` self-contained.
- **UI copy:** plain verbs, sentence case, written for someone in a garage with dirty hands. The button that says "Save entry" leads to "Saved…". Errors say what happened and what to do.
- **Design:** cool shop-gray background, project names on "masking tape" strips in a marker font, and the progress bar is also tape. Large tap targets (52 px and up) and tabular numbers. Supports light and dark mode and reduced motion.
- **Deploys:** for Apps Script, use Manage deployments, edit, then New version, so the URL stays the same. Every user deploys their own copy and will rarely update it, so `Code.gs` changes must stay compatible with older app versions, and the app with older scripts. For the app, push to `main`: `.github/workflows/pages.yml` runs both test suites and publishes `app/` to https://emum.github.io/shop-hours/ only if they pass. Every user runs that one copy.
