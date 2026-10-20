# Shop Hours: setup

Three parts, about 30 minutes total. Parts 1 and 2 are done once, on a computer. Part 3 is done on his iPhone.

```
shop-hours/
  app/             the app itself: upload these files to GitHub Pages
  backup-script/   Code.gs: paste this into the Google Sheet's Apps Script
  SETUP.md         this file
```

---

## Part 1: Google Sheet backup (about 10 minutes)

The sheet lives in whichever Google account creates it. Use his account if he should own his data outright, or yours if you'll be the one looking after it. Either way you can share the sheet with the other person afterward.

1. Go to **sheets.new** and name the sheet something like *Shop Hours Backup*.
2. Open **Extensions → Apps Script**.
3. Delete the starter code in `Code.gs`, then paste in everything from `backup-script/Code.gs`.
4. Near the top, change `CHANGE-ME` to a passphrase of your choosing, such as `const APP_KEY = 'amx-1970-blue';`. It's easiest without spaces. Click **Save**.
5. Click **Deploy → New deployment**. Click the gear next to *Select type* and choose **Web app**. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Then click **Deploy**.
6. Google will ask you to authorize. Pick the account, then on the *"Google hasn't verified this app"* screen click **Advanced → Go to (project name) (unsafe)** → **Allow**. That warning appears for every personal script. The script only has access to this one spreadsheet.
7. Copy the **Web app URL**. It ends in `/exec`.
8. **Test it.** In a browser, open that URL with `?key=` and your passphrase added to the end:
   `https://script.google.com/macros/s/XXXX/exec?key=amx-1970-blue`
   You should see `{"ok":true,"sheet":"Shop Hours Backup","projects":0,"entries":0}`. The sheet will now have **Projects**, **Entries** and **Deleted** tabs.

> **If you ever edit the script:** go to Deploy → Manage deployments, click the pencil, set Version to **New version**, then click Deploy. That keeps the same URL. Saving the code alone does not update the live version.

---

## Part 2: Put the app online with GitHub Pages (about 10 minutes)

The app has to be served over HTTPS for the iPhone to install it. GitHub Pages does that for free.

1. Create a new **public** repository, for example `shop-hours`. Only the app's code goes here. His hours, notes and the backup key are never in the repo.
2. Click **Add file → Upload files** and drag in **the contents of the `app/` folder** (`index.html`, `sw.js`, `manifest.webmanifest`, `marker.woff2` and the three `icon-*.png` files), not the folder itself. Commit.
3. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, then choose **main** and **/ (root)**. Click Save.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/shop-hours/`. Open it on your computer to check that it loads.

*Alternative:* Netlify also works. Drag the `app` folder onto app.netlify.com/drop, and sign in so the site is kept.

---

## Part 3: Install on his iPhone (about 5 minutes)

Before you start, text him three things: the app link, the backup URL from Part 1, and the passphrase. He'll copy and paste them.

1. Open the app link in **Safari**.
2. Tap **Share** (the square with the arrow) → **Add to Home Screen**. If there's an **Open as Web App** switch, leave it on. Tap **Add**.
3. Open **Shop Hours from the new Home Screen icon**, tap **Backup**, paste the backup link and the key, then tap **Save and test**. It should say *Connected to "Shop Hours Backup"*.
4. Go back, tap **Add a project** (for example *AMX*, estimate *400*), and log the first entry. A minute later the row will be on the sheet's Entries tab.

**Always open the app from the Home Screen icon.** The icon and a Safari tab keep separate data on iPhone. Entries made in a Safari tab won't show up in the installed app.

---

## How the backup works

- Every save, edit and delete is stored on the phone first and then sent to the sheet right away.
- With no signal in the garage, changes wait on the phone. The app shows how many are waiting and sends them as soon as it's online again. It retries automatically, or he can tap **Try now**.
- Deleting an entry in the app removes it from the Entries tab but copies it to the **Deleted** tab first. Nothing is ever erased outright.
- The **Projects** tab has live *Logged Hours* and *Hours Left* columns.
- **New phone, or the icon got deleted:** install the app again (Part 3, steps 1–3), then tap **Backup → Restore from Google Sheets**. Every project and entry comes back.
- Treat the sheet as the backup copy and make changes in the app. Editing rows by hand in the sheet won't reliably flow back to the phone.

## Updating the app later

If you change any file in `app/`, also bump `VERSION` at the top of `sw.js` (for example `shop-hours-1.1`), then upload both. On the phone, opening the app twice picks up the new version. His data is untouched.
