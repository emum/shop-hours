/**
 * Shop Hours — Google Sheets backup
 *
 * Most people get this by copying the template sheet linked in README.md, which
 * already has it attached. In the copy: Shop Hours > Phone setup (or Run in the
 * editor), then Deploy > New deployment > Web app (Execute as: Me, Who has
 * access: Anyone). It can also be pasted into Extensions > Apps Script of any sheet.
 *
 * The app sends every new, changed or deleted entry here as soon as it is saved.
 * Nothing is ever erased outright: deleted rows are copied to the "Deleted" tab first.
 *
 * @OnlyCurrentDoc  (the script can only open the spreadsheet it belongs to)
 */

// Leave this as 'CHANGE-ME': setup() makes a backup key and shows it on the
// "Phone setup" tab, and the key survives pasting in a newer version of this file.
// A passphrase typed here instead takes priority over the generated one.
const APP_KEY = 'CHANGE-ME';

const SETUP_TAB = 'Phone setup';
const START_TAB = 'Start here'; // the template's welcome tab; removed once setup runs

// Bump this whenever the script's behavior changes. Every response carries it.
// SCRIPT_LATEST in app/index.html is the version people should have: raise it
// only when an update matters to existing users, since raising it asks everyone
// to update. The first published script sent no version; the app counts that as 1.
const SCRIPT_VERSION = 4;

const SHEETS = {
  projects: {
    name: 'Projects',
    headers: ['Project ID', 'Project', 'Est. Hours', 'Logged Hours', 'Hours Left', 'Status', 'Created', 'Updated'],
    widths: [110, 180, 90, 100, 90, 80, 150, 150],
  },
  entries: {
    name: 'Entries',
    // Employee columns came later (v4), so they go at the end where nothing else moves.
    headers: ['Entry ID', 'Date', 'Project', 'Hours', 'Note', 'Project ID', 'Created', 'Updated', 'Employee', 'Employee ID'],
    widths: [110, 90, 150, 60, 420, 110, 150, 150, 130, 110],
  },
  employees: {
    name: 'Employees',
    headers: ['Employee ID', 'Name', 'Logged Hours', 'Status', 'Created', 'Updated'],
    widths: [110, 160, 100, 80, 150, 150],
  },
  deleted: {
    name: 'Deleted',
    headers: ['Deleted At', 'Kind', 'ID', 'Date', 'Project', 'Hours / Est.', 'Note'],
    widths: [150, 70, 110, 90, 150, 90, 420],
  },
};

const STAMP_FORMAT = 'm/d/yyyy h:mm am/pm';

/* ---------- one-time setup ---------- */

// Runs from the sheet's Shop Hours > Phone setup menu, or from Run in the editor
// (it's the first function in the file, so it's the one Run picks). It creates
// the tabs and a backup key (keeping any key made before), and shows the key on
// the "Phone setup" tab.
function setup() {
  const ss = ensureSheets_();
  const key = appKey_() || newKey_();
  const sh = showSetup_(ss, key);
  const start = ss.getSheetByName(START_TAB);
  if (start && ss.getSheets().length > 1) ss.deleteSheet(start);
  ss.setActiveSheet(sh);
  ss.toast('Your backup key is on the Phone setup tab.', 'Shop Hours');
  console.log('Done. Your backup key is ' + key + ' (also on the "Phone setup" tab of the sheet).');
}

// Adds the Shop Hours menu each time the sheet opens, so nobody has to find
// the Run button in the script editor.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Shop Hours').addItem('Phone setup', 'setup').addToUi();
}

function showSetup_(ss, key) {
  const sh = ss.getSheetByName(SETUP_TAB) || ss.insertSheet(SETUP_TAB, 0);
  const link = sh.getRange(3, 2).getValue(); // keep a link pasted in earlier
  sh.getRange(1, 1, 13, 2).setValues([
    ['Shop Hours phone setup', ''],
    ['Backup key', safeText_(key)],
    ['Web app link', link === '' ? '' : safeText_(link)],
    // The app splits this back into the link and the key, so people paste one thing.
    ['Setup code', '=IF(B3="", "Paste your Web app link in the box above first.", B3 & "#" & B2)'],
    ['Script version', SCRIPT_VERSION],
    ['', ''],
    ['Next steps', ''],
    [safeText_('1. Click Extensions, then Apps Script. Click the blue Deploy button at the top right, then New deployment. Click the gear next to Select type and pick Web app. Execute as: Me. Who has access starts as Only myself: change it to Anyone. Click Deploy.'), ''],
    [safeText_('2. Click Copy under the Web app URL. Paste it in the box next to "Web app link" above. The setup code fills in by itself.'), ''],
    [safeText_('3. Email the setup code to yourself. On your phone, open Shop Hours from the Home Screen icon, tap Backup, paste the setup code, and tap Save and test.'), ''],
    [safeText_('Step-by-step guide: https://github.com/emum/shop-hours#get-it'), ''],
    ['', ''],
    [safeText_("Don't share this sheet or pictures of this tab. Anyone with the link and the key can read and change your backup. To share your hours, use Export CSV in the app."), ''],
  ]);
  sh.getRange(1, 1).setFontWeight('bold');
  sh.getRange(7, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 480);
  return sh;
}

/* ---------- web endpoints ---------- */

// GET ?key=…            -> connection test with row counts
// GET ?key=…&action=export -> everything, for restoring onto a phone
function doGet(e) {
  return respond_(function () {
    const p = (e && e.parameter) || {};
    checkKey_(p.key);
    const ss = ensureSheets_();
    const data = exportAll_(ss);
    if (p.action === 'export') return data;
    return { ok: true, sheet: ss.getName(), projects: data.projects.length, entries: data.entries.length };
  });
}

// POST {key, ops:[{op:'putProject', project}, {op:'delProject', id},
//                 {op:'putEntry', entry}, {op:'delEntry', id}]}
function doPost(e) {
  return respond_(function () {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error('The backup request was not readable.');
    }
    checkKey_(body.key);
    const ops = Array.isArray(body.ops) ? body.ops : [];
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const ctx = context_(ensureSheets_());
      ops.forEach(function (op) { applyOp_(ctx, op); });
      return { ok: true, applied: ops.length };
    } finally {
      lock.releaseLock();
    }
  });
}

/* ---------- operations ---------- */

function applyOp_(ctx, op) {
  if (!op || !op.op) return;
  switch (op.op) {
    case 'putProject': return putProject_(ctx, op.project);
    case 'delProject': return delProject_(ctx, op.id);
    case 'putEntry':   return putEntry_(ctx, op.entry);
    case 'delEntry':   return delEntry_(ctx, op.id);
    case 'putEmployee': return putEmployee_(ctx, op.employee);
    case 'delEmployee': return delEmployee_(ctx, op.id);
    default: throw new Error('Unknown backup operation: ' + op.op);
  }
}

function putProject_(ctx, p) {
  if (!p || !p.id) return;
  const sheet = ctx.projects;
  const existing = rowOf_(ctx, sheet, p.id);
  if (existing && isNewer_(sheet, existing, p.updated)) return;
  const r = existing || sheet.getLastRow() + 1;
  const oldName = existing ? String(sheet.getRange(r, 2).getValue()) : null;
  sheet.getRange(r, 1, 1, 8).setValues([[
    p.id,
    safeText_(p.name),
    p.est === null || p.est === undefined || p.est === '' ? '' : Number(p.est),
    '=SUMIF(Entries!F:F,A' + r + ',Entries!D:D)',
    '=IF(C' + r + '="","",C' + r + '-D' + r + ')',
    p.status === 'done' ? 'Done' : 'Active',
    stamp_(p.created),
    stamp_(p.updated),
  ]]);
  if (!existing) remember_(ctx, sheet, p.id, r);
  // Keep the Project column on the Entries tab in step with renames
  // (and fill it in for any entries that arrived before their project did).
  if (!existing || oldName !== p.name) renameInEntries_(ctx, 6, 3, p.id, p.name);
}

function delProject_(ctx, id) {
  const sheet = ctx.projects;
  const r = rowOf_(ctx, sheet, id);
  if (!r) return;
  const v = sheet.getRange(r, 1, 1, 8).getValues()[0];
  ctx.deleted.appendRow([new Date(), 'Project', v[0], '', v[1], v[2], '']);
  sheet.deleteRow(r);
  forget_(ctx, sheet);
}

function putEntry_(ctx, en) {
  if (!en || !en.id) return;
  const sheet = ctx.entries;
  const existing = rowOf_(ctx, sheet, en.id);
  if (existing && isNewer_(sheet, existing, en.updated)) return;
  const r = existing || sheet.getLastRow() + 1;
  const row = [
    en.id,
    en.date,                      // "YYYY-MM-DD"; Sheets stores it as a real date
    safeText_(nameOf_(ctx, ctx.projects, en.projectId)),
    Number(en.hours) || 0,
    safeText_(en.note || ''),
    en.projectId,
    stamp_(en.created),
    stamp_(en.updated),
  ];
  // App versions before employees send no employeeId at all. Leave the employee
  // columns alone for those rather than blanking someone's employee.
  if (Object.prototype.hasOwnProperty.call(en, 'employeeId')) {
    row.push(en.employeeId ? safeText_(nameOf_(ctx, ctx.employees, en.employeeId)) : '', en.employeeId || '');
  }
  sheet.getRange(r, 1, 1, row.length).setValues([row]);
  if (!existing) remember_(ctx, sheet, en.id, r);
}

function putEmployee_(ctx, m) {
  if (!m || !m.id) return;
  const sheet = ctx.employees;
  const existing = rowOf_(ctx, sheet, m.id);
  if (existing && isNewer_(sheet, existing, m.updated, 6)) return;
  const r = existing || sheet.getLastRow() + 1;
  const oldName = existing ? String(sheet.getRange(r, 2).getValue()) : null;
  sheet.getRange(r, 1, 1, 6).setValues([[
    m.id,
    safeText_(m.name),
    '=SUMIF(Entries!J:J,A' + r + ',Entries!D:D)',
    m.active === false ? 'Retired' : 'Active',
    stamp_(m.created),
    stamp_(m.updated),
  ]]);
  if (!existing) remember_(ctx, sheet, m.id, r);
  // Same as projects: keep names on the Entries tab current, and fill them in
  // for entries that arrived before their employee did.
  if (!existing || oldName !== m.name) renameInEntries_(ctx, 10, 9, m.id, m.name);
}

function delEmployee_(ctx, id) {
  const sheet = ctx.employees;
  const r = rowOf_(ctx, sheet, id);
  if (!r) return;
  const v = sheet.getRange(r, 1, 1, 6).getValues()[0];
  ctx.deleted.appendRow([new Date(), 'Employee', v[0], '', v[1], '', '']);
  sheet.deleteRow(r);
  forget_(ctx, sheet);
}

function delEntry_(ctx, id) {
  const sheet = ctx.entries;
  const r = rowOf_(ctx, sheet, id);
  if (!r) return;
  const v = sheet.getRange(r, 1, 1, 8).getValues()[0];
  ctx.deleted.appendRow([new Date(), 'Entry', v[0], v[1], v[2], v[3], v[4]]);
  sheet.deleteRow(r);
  forget_(ctx, sheet);
}

// Writes name into nameCol of every Entries row whose idCol matches id
// (columns: project 6 -> 3, employee 10 -> 9).
function renameInEntries_(ctx, idCol, nameCol, id, name) {
  const sheet = ctx.entries;
  const last = sheet.getLastRow();
  if (last < 2) return;
  const ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) sheet.getRange(i + 2, nameCol).setValue(safeText_(name));
  }
}

// The name (column 2) of a project or employee row, or '' if it hasn't arrived yet.
function nameOf_(ctx, sheet, id) {
  const r = rowOf_(ctx, sheet, id);
  return r ? String(sheet.getRange(r, 2).getValue()) : '';
}

/* ---------- restore ---------- */

function exportAll_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const projects = rows_(ss.getSheetByName(SHEETS.projects.name)).map(function (v) {
    return {
      id: String(v[0]),
      name: String(v[1]),
      est: v[2] === '' || v[2] === null ? null : Number(v[2]),
      status: String(v[5]).toLowerCase() === 'done' ? 'done' : 'active',
      created: iso_(v[6]),
      updated: iso_(v[7]),
    };
  });
  const entries = rows_(ss.getSheetByName(SHEETS.entries.name), 10).map(function (v) {
    return {
      id: String(v[0]),
      date: v[1] instanceof Date ? Utilities.formatDate(v[1], tz, 'yyyy-MM-dd') : String(v[1]),
      hours: Number(v[3]) || 0,
      note: String(v[4]),
      projectId: String(v[5]),
      created: iso_(v[6]),
      updated: iso_(v[7]),
      employeeId: String(v[9]),
    };
  });
  const employees = rows_(ss.getSheetByName(SHEETS.employees.name), 6).map(function (v) {
    return {
      id: String(v[0]),
      name: String(v[1]),
      active: String(v[3]).toLowerCase() !== 'retired',
      created: iso_(v[4]),
      updated: iso_(v[5]),
    };
  });
  return { ok: true, projects: projects, entries: entries, employees: employees };
}

function rows_(sheet, cols) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, cols || 8).getValues().filter(function (v) { return v[0] !== ''; });
}

/* ---------- sheet setup ---------- */

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let created = false;
  Object.keys(SHEETS).forEach(function (k) {
    const def = SHEETS[k];
    let sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      created = true;
    }
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      def.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
      if (k === 'entries') {
        sh.getRange('B:B').setNumberFormat('m/d/yyyy');
        sh.getRange('D:D').setNumberFormat('0.##');
        sh.getRange('E:E').setWrap(true);
        sh.getRange('G:H').setNumberFormat(STAMP_FORMAT);
      }
      if (k === 'projects') {
        sh.getRange('C:E').setNumberFormat('0.##');
        sh.getRange('G:H').setNumberFormat(STAMP_FORMAT);
      }
      if (k === 'employees') {
        sh.getRange('C:C').setNumberFormat('0.##');
        sh.getRange('E:F').setNumberFormat(STAMP_FORMAT);
      }
      if (k === 'deleted') {
        sh.getRange('A:A').setNumberFormat(STAMP_FORMAT);
        sh.getRange('D:D').setNumberFormat('m/d/yyyy');
      }
    } else if (sh.getRange(1, def.headers.length).getValue() === '') {
      // A tab made by an older script: add the headers for columns added since.
      sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
      def.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    }
  });
  if (created) {
    // Drop the blank starter tab Google adds to new spreadsheets.
    const starter = ss.getSheetByName('Sheet1');
    if (starter && starter.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(starter);
  }
  return ss;
}

/* ---------- helpers ---------- */

function context_(ss) {
  return {
    projects: ss.getSheetByName(SHEETS.projects.name),
    entries: ss.getSheetByName(SHEETS.entries.name),
    employees: ss.getSheetByName(SHEETS.employees.name),
    deleted: ss.getSheetByName(SHEETS.deleted.name),
    maps: {},
  };
}

// id -> row number, read once per request and kept current as rows are added.
function idMap_(ctx, sheet) {
  const name = sheet.getName();
  if (!ctx.maps[name]) {
    const map = {};
    const last = sheet.getLastRow();
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (v, i) {
        if (v[0] !== '') map[String(v[0])] = i + 2;
      });
    }
    ctx.maps[name] = map;
  }
  return ctx.maps[name];
}

function rowOf_(ctx, sheet, id) {
  return idMap_(ctx, sheet)[String(id)] || 0;
}

function remember_(ctx, sheet, id, row) {
  idMap_(ctx, sheet)[String(id)] = row;
}

function forget_(ctx, sheet) {
  delete ctx.maps[sheet.getName()]; // rows shifted; rebuild on next lookup
}

// True when the sheet already holds a newer version than the one arriving.
// updatedCol is where the Updated stamp lives: 8 on Projects and Entries, 6 on Employees.
function isNewer_(sheet, row, incomingIso, updatedCol) {
  const have = sheet.getRange(row, updatedCol || 8).getValue();
  if (!(have instanceof Date) || !incomingIso) return false;
  return have.getTime() > new Date(incomingIso).getTime();
}

// Store text exactly as typed. Sheets drops a leading ' and keeps the rest as
// plain text, so "=...", "3/4", "TRUE", "007" and "'70 AMX" don't turn into
// formulas, dates, booleans, numbers, or lose their apostrophe.
function safeText_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return s === '' ? '' : "'" + s;
}

function stamp_(iso) {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

// A blank or unreadable stamp (say, edited by hand) exports as '' so the
// phone's copy wins on restore, instead of the row looking brand new.
function iso_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// A generated key remembers which spreadsheet it was made in. If the script's
// properties ever come along with a copy of the sheet, the copy ignores the
// original's key and makes its own. Keys made before this have no sheet noted
// and stay valid.
function appKey_() {
  if (APP_KEY !== 'CHANGE-ME') return APP_KEY;
  const props = PropertiesService.getScriptProperties();
  const madeIn = props.getProperty('APP_KEY_SHEET');
  if (madeIn && madeIn !== SpreadsheetApp.getActiveSpreadsheet().getId()) return '';
  return props.getProperty('APP_KEY') || '';
}

// 12 letters and digits in groups of four, leaving out look-alikes (0/o, 1/l/i).
function newKey_() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let key = '';
  for (let i = 0; i < 12; i++) key += (i && i % 4 === 0 ? '-' : '') + abc.charAt(Math.floor(Math.random() * abc.length));
  PropertiesService.getScriptProperties()
    .setProperty('APP_KEY', key)
    .setProperty('APP_KEY_SHEET', SpreadsheetApp.getActiveSpreadsheet().getId());
  return key;
}

function checkKey_(key) {
  const want = appKey_();
  if (!want) throw new Error('This backup script has no key yet. In your Google Sheet, click Shop Hours, then Phone setup. Then try again.');
  if (String(key || '') !== want) throw new Error('The backup key does not match. Copy it again from the Phone setup tab of your Google Sheet.');
}

function respond_(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  out.version = SCRIPT_VERSION;
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
