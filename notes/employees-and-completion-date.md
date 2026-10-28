# Employees on entries, and an estimated completion date

Branch: `employees-and-completion-date`. Requested 2026-10-26. Nothing here is built yet.
The two features are independent. The completion date is small and could ship first.

## Decisions (2026-10-28)
- **Each employee has their own hours.** Hours are never shared between people: an entry
  belongs to at most one employee. If the Log hours form lets you pick several people, it
  saves one entry for each.
- **One employee list** for the whole app.
- **Employee is optional** on an entry. Old entries and solo shops stay unassigned.
- **Show the estimated finish on the home screen's project list *and* the project screen.**
- **Update the README screenshots** (`images/home.png`, `images/project.png`,
  `images/log-hours.png`) to show employees and the estimated finish. Regenerate them with
  sample data, not test output. Add one of the employee list if it helps, and update the
  alt text and the README's "Using it" section.

---

## 1. Assign hours to employees

**Request:** each entry can name one or more employees, with a place to enter and manage
employee names.

### Questions to settle first
1. **When several people are on one entry, what do the hours mean?** "Mike and Dave, 8 hrs"
   could be:
   - **8 hours each** (16 labor hours against the estimate). The simplest way to build this
     is for the app to save one entry per person from a single form, each with the same date,
     hours and note.
   - **8 hours shared** (8 hours total). Then per-person totals can't be worked out.

   This decides how totals, the progress bar and the estimate work. *Recommendation: hours
   are per person, saved as one entry each.* The sheet then stays one row per person per day,
   which is easy to total by employee.
2. **One employee list for the whole app, or a list per project?** *Recommendation: one
   list, with the ability to retire a name without deleting its history.*
3. **Is an employee required on every entry?** *Recommendation: optional. Old entries and
   solo shops stay "unassigned".*

### Sketch (if one entry per person)
- **Data:** `data.employees = [{id, name, active, created, updated}]`, and entries gain
  `employeeId` (blank = unassigned). Old entries need no migration. A missing field means
  unassigned. If "shared hours" is chosen instead, entries get an `employeeIds` list.
- **App:**
  - **Backup → Employees** (or a new **People** screen): add, rename, and *retire* rather
    than delete (retired names stay on old entries but are hidden from the picker).
  - Log hours form: tap-to-select name chips (large tap targets). It remembers the last
    selection.
  - Project screen: hours per employee. CSV export gets an Employee column.
- **Sheet / script:**
  - New **Employees** tab. **Employee** and **Employee ID** columns are *added at the end*
    of Entries (columns I–J), so existing columns and formulas don't move.
  - New ops `putEmployee` / `delEmployee`. Restore exports employees too.
  - A deleted employee goes to the Deleted tab, like everything else.
- **Keeping data safe (invariants 5 and 7):**
  - An older script would silently drop employee names. Raise `SCRIPT_VERSION` *and*
    `SCRIPT_LATEST`.
  - Until someone's script is updated, the app should keep their employee names on the
    phone and say *"Update the backup script to back up employee names"*. It must never
    quietly lose them.
  - Old app versions sending entries without employees to the new script must leave the
    employee columns as they are, not blank them.
- **Tests:** script tests for the new ops and columns, old-app-to-new-script and
  new-app-to-old-script behavior, and e2e for the picker, per-employee totals and Restore.

---

## 2. Estimated completion date on the project screen

**Request:** show when the project should be done, based on hours logged so far and how many
days have been worked.

### How it would be worked out
- **Hours per day worked** = hours logged ÷ number of days with entries.
- **How often days are worked** = days worked ÷ calendar days since the first entry
  (for example 3 days a week).
- **Days of work left** = hours left on the estimate ÷ hours per day worked.
- **Estimated finish** = today + (days of work left ÷ how often days are worked), shown as a
  date.
- Prefer **recent pace** (say the last 6 weeks) so it follows how the job is going now, and
  fall back to the whole history when there's little recent data.

### When to show it
- Only for active projects that have an estimate and hours left.
- Only once there are at least 3 days worked. Before that: *"Log a few more days to see an
  estimated finish."*
- Over estimate: no date (the screen already shows hours over).
- Show the working behind it, so it's believable. For example: *"At your pace (6.5 hrs a day,
  about 3 days a week), you'll finish around Dec 14."* Wording to follow the UI copy rules.

### Notes
- It's worked out on the phone, so there's no sync, script or storage change. It works
  offline.
- With employees (feature 1), pace uses total labor hours.
- **Tests:** e2e with a fixed clock, covering normal pace, too little history, over
  estimate, finished projects and projects with no estimate.

### Question
- Should the home screen's project list show the estimated date too, or only the project
  screen?
