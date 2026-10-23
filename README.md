# Shop Hours

Log the hours you put into each car or job, right from your phone, and see how many hours are left on your estimate.

**Free. No account, no subscription, no ads.** Every entry is backed up to a Google Sheet in *your own* Google account. Nobody else ever sees your hours.

<p>
  <img src="images/home.png" width="250" alt="Project list: '70 AMX with 40.5 hours logged and 359.5 of 400 left, F-100 bed, and a finished Chevelle door">
  <img src="images/project.png" width="250" alt="'70 AMX project: 40.5 hours logged, 359.5 left, and a list of dated entries with notes">
  <img src="images/log-hours.png" width="250" alt="Log hours form: project, date, hours with plus and minus buttons, and what got done">
</p>

- **Works with no signal.** Log hours in a garage with no bars. The app saves everything on the phone and backs it up as soon as you're back online.
- **Your own backup.** Every entry, edit and delete goes to your Google Sheet. Deleted entries are kept on a separate tab, so nothing is ever lost.
- **Estimates.** Give a job a rough total (say 400 hours) and the app shows what's left, with a masking-tape progress bar.
- **iPhone and Android.** It runs in the phone's web browser and installs on your Home Screen like an app. There's nothing to buy or download from an app store.

---

## Get it

It takes about 15 minutes, and you only do it once.

**You need:** a Google account (any Gmail address works), a computer for step 1, and your phone.

### Step 1: Make your backup sheet (on a computer, about 10 minutes)

Use a computer for this step. Google's script editor is very hard to use on a phone.

1. **Copy the Shop Hours sheet.** Sign in to Google, then open **[this copy link](https://docs.google.com/spreadsheets/d/1H14dK0yR73WcFe8N4eWGyClRi8nG8Ai50WOexEoqcs4/copy)** Google shows **Copy document**, *"The attached Apps Script file and functionality will also be copied."* That's the backup script, and it's what you want. Click **Make a copy**. (**View Apps Script file** just shows you the script's code first, if you're curious.)
   Your copy opens, named *Copy of Shop Hours Backup*. Click the name at the top left and take out *Copy of* so it's just **Shop Hours Backup**.
2. **Make your backup key.** Wait a few seconds until **Shop Hours** shows up in the menu bar, to the right of *Help*. Click **Shop Hours → Phone setup**.
   > **No Shop Hours menu after 10 seconds?** If you use **Brave**, click the lion icon in the address bar and turn **Shields off** for this site. An ad blocker can cause the same thing, so pause it for this site. Or do this step in **Chrome** or **Safari**. Then reload the page.
   The first time, Google asks for permission:
   - Click **Continue** (or **Review permissions**). If Google asks which account to use, pick yours.
   - If you see **"Google hasn't verified this app"**, click **Advanced**, then **Go to Shop Hours Backup (unsafe)**. Many people never see this screen.
   - You'll see **"Shop Hours Backup wants access to your Google Account."** It should say only *"View and manage spreadsheets that this application has been installed in."* **If it asks for anything else, such as your Drive or Gmail, click Cancel.** If you see checkboxes, tick them all. Then click **Continue** (on some accounts it says **Allow**).

   > **Is that safe?** Yes. "Installed in" means this one spreadsheet. The script can't open your other files, your email or anything else. It runs in your own account, and you can remove its access at any time in your Google Account settings.

   After a few seconds, new tabs appear and the **Phone setup** tab opens with your **backup key**. If nothing happens after you allow access, click **Shop Hours → Phone setup** again. Don't go on until you see the Phone setup tab.
3. **Put the script online.** Click **Extensions → Apps Script**. The script editor opens in a new tab.
   - Click the blue **Deploy** button at the top right. A menu opens with **New deployment**, **Manage deployments** and **Test deployments**. Pick **New deployment**.
   - A window opens. At its top left, next to *Select type*, click the **gear icon**. It lists **Web app**, **API Executable**, **Add-on** and **Library**. Pick **Web app**.
   - In **Description**, type **Shop Hours backup**. It's only a label for you, so any wording works.
   - Set **Execute as** to **Me** (your email address).
   - **Change Who has access to Anyone.** It starts out set to *Only myself*, and with that setting your phone can't reach the sheet. *Anyone with a Google account* doesn't work either.
   - Click **Deploy**.
   - If it says *"The Web App requires you to authorize access to your data"*, click **Authorize access** and answer the same permission screens as in part 2, ending with **Continue**.

   *Anyone* is what lets the app on your phone reach the sheet without signing in. Your backup key keeps everyone else out.
4. Google says *"Deployment successfully updated"* and shows a **Web app URL** (it starts with `https://script.google.com/macros/s/` and ends in `/exec`). Click **Copy** under the URL, then the blue **Done** button at the bottom of the window.
   Google also shows *"Version 1"*. That's Google's count of how many times you've deployed, not the Shop Hours version, so you can ignore it.
5. **Make your setup code.** Go back to your spreadsheet's tab, open the **Phone setup** tab, and paste the Web app URL into the box next to **Web app link**. The **Setup code** box below it fills in by itself.

   > **Don't share this sheet,** or screenshots of the Phone setup tab, even when asking for help. Anyone with the link and the key can read and change your backup. To share your hours with someone, use **Backup → Export CSV** in the app instead.

**Now get the setup code onto your phone.** The easiest way is to email it to yourself. You can also open the sheet in the Google Sheets app on your phone and copy it from the Phone setup tab.

<details>
<summary>Can't use the copy link? Set up the sheet by hand instead.</summary>

1. Go to **[sheets.new](https://sheets.new)** and name the new sheet **Shop Hours Backup**.
2. Click **Extensions → Apps Script**. Click *Untitled project* at the top left, name it **Shop Hours Backup**, and click **Rename**.
3. Open the **[backup script](backup-script/Code.gs)** and click its **copy button** (two overlapping squares, top right of the code). In the script editor, delete what's there, paste, and click the **Save** icon.
4. Close the script editor's tab, reload the spreadsheet, and carry on from part 2 above.

</details>

### Step 2: Install the app on your phone (about 2 minutes)

The app's address is **https://emum.github.io/shop-hours/**

**iPhone (use Safari)**

These steps are for **Safari**, the iPhone's built-in browser with the blue compass icon. Chrome, Brave and other iPhone browsers have different menus, which these steps don't cover yet. Use Safari for this part, even if you normally use another browser.

1. Open that address in **Safari**.
2. Tap **Share** (the square with the arrow) → **Add to Home Screen**. If there's an **Open as Web App** switch, leave it on. Tap **Add**.
3. **Close the Safari tab.** Don't set anything up in it.
4. Go to your Home Screen and open **Shop Hours from the new icon**. Do Step 3 there.

> **Important on iPhone:** the Home Screen icon and Safari keep **separate copies** of everything. Anything you set up or log in a Safari tab won't be in the icon app. From now on, **always open Shop Hours from the icon**. If the app ever shows a red box saying *"Open Shop Hours from your Home Screen"*, you're in a browser tab, not the app.

**Android**
1. Open that address in **Chrome**.
2. Tap the **⋮** menu → **Install app** (on some phones it says **Add to Home screen**). Tap **Install**.
3. Open Shop Hours from the new icon.

### Step 3: Connect the backup (about 1 minute)

1. Open Shop Hours **from the Home Screen icon** (on iPhone, not from Safari), then tap **Backup** (top right).
2. Paste the **setup code** into the first box. The backup key box fills in by itself. Tap **Save and test**.
   It should say ***Connected to "Shop Hours Backup"***.
3. Tap **Projects**, add your first car or job, and log some hours. A minute later the entry shows up on the sheet's **Entries** tab.

That's it.

---

## Using it

- **Log hours:** tap **Log hours**, pick the project, set the hours (the **−** and **+** buttons go by half an hour), and say what got done.
- **Fix a mistake:** tap any entry to change or delete it.
- **Estimates:** tap **Edit project** to add or change the estimated total at any time. Rough guesses are fine.
- **Finished a job:** **Edit project → Mark as finished** moves it to the Finished list. You can move it back.
- **The backup line** at the top of the screen tells you where things stand. *Everything backed up* means the sheet has it all. *2 changes waiting to back up* means there's no signal right now. They'll go out on their own once the phone is online.
- **In the sheet:** the **Projects** tab totals your logged hours and hours left for each job. The **Entries** tab has every entry. The **Deleted** tab keeps a copy of anything you delete.
- **Spreadsheet file:** **Backup → Export CSV** saves all your entries as a file you can email or open in Excel or Numbers.

Make your changes in the app, not by editing rows in the sheet. The sheet is the backup copy. Changes typed into it don't flow back to your phone.

## New phone, or deleted the app

1. Install the app again (Step 2) and connect the backup (Step 3).
2. Tap **Backup → Restore from Google Sheets**. All your projects and entries come back.

**Before deleting the app or switching phones, check that it says *Everything backed up*.** Deleting the app also deletes anything that hasn't been backed up yet.

## If something goes wrong

| The app says… | What to do |
|---|---|
| *That doesn't look like a Google Apps Script link* | Copy the **setup code** again from the Phone setup tab. If the Setup code box is empty, paste the **Web app URL** into the tab first (Step 1, part 5). |
| *That link didn't answer like the backup script* | Usually **Who has access** isn't set to **Anyone**. In Apps Script, click the blue **Deploy** button, then **Manage deployments**. Click the pencil, set it to **Anyone**, pick **New version**, and click **Deploy**. |
| *This backup script has no key yet* | In your Google Sheet, click **Shop Hours → Phone setup** (Step 1, part 2). |
| *The backup key does not match* | Copy the key again from the **Phone setup** tab of your sheet. |
| *Couldn't reach Google* | Check that the phone is online and try again. |
| *Changes waiting to back up* | Nothing's wrong. There's no signal right now, and they'll be sent automatically. Tap **Try now** to send them right away. |
| *Google took too long to answer* | Google was slow. The app tries again by itself. |

**On iPhone, the app is empty or asks for the backup link again:** you probably set it up or logged hours in a Safari tab, which keeps its own separate copy. Open Shop Hours from the Home Screen icon and connect the backup there (Step 3). Then tap **Backup → Restore from Google Sheets**. Anything that was backed up from Safari comes back.

## Updating the backup script

The app updates itself. The backup script lives in your Google account, so you update that part yourself. When a newer one is out, the app shows **Update the backup script** under the backup line. Your backups keep working until you get to it. To update:

1. Open your sheet, then **Extensions → Apps Script**. Replace all the code with the new [backup script](backup-script/Code.gs) and click **Save**.
2. Click the blue **Deploy** button at the top right, then **Manage deployments**, then the pencil icon. Set **Version** to **New version** and click **Deploy**.

Your Web app link and backup key stay the same, so there's nothing to change on your phone. The notice goes away the next time the app backs up.

## Your data

- Your hours and notes are stored on your phone and in your own Google Sheet, and nowhere else.
- The app is a web page hosted for free on GitHub Pages. GitHub serves the app's files, like any website, but your entries never go there. The app has no tracking or analytics.
- Keep your backup sheet to yourself. Its Phone setup tab holds your Web app link and backup key, and anyone with both can read and change your backup. Share your hours with **Export CSV** instead of sharing the sheet.

---

## For tinkerers

Everything is plain HTML and JavaScript with no build step:

```
app/              the app (published to GitHub Pages on every push to main, after the tests pass)
backup-script/    Code.gs, the Google Apps Script backup
tests/            unit tests for the script, and a browser test of the app against a fake Google
```

```bash
python3 -m http.server 8765 --directory app   # run it at http://localhost:8765
node tests/script.test.js                     # backup script tests (Node 18+)
cd tests && python3 e2e.py                    # browser tests (pip install playwright && playwright install chromium)
```

[CLAUDE.md](CLAUDE.md) explains how syncing and restoring work, and the rules that keep data safe. To host your own copy, fork this repo, then turn on **Settings → Pages → Source: GitHub Actions**.

## License

[MIT](LICENSE). Use it, change it and share it freely. The Permanent Marker font in `app/marker.woff2` has its own font license.
