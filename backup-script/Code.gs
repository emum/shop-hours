/**
 * Shop Hours — Google Sheets backup
 *
 * Paste this whole file into Extensions > Apps Script of a new Google Sheet,
 * set APP_KEY below, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone). See SETUP.md for the full steps.
 *
 * The app sends every new, changed or deleted entry here as soon as it is saved.
 * Nothing is ever erased outright: deleted rows are copied to the "Deleted" tab first.
 */

// Pick any passphrase (letters and numbers, no spaces is easiest).
// Type the same one into the app under Backup settings.
const APP_KEY = 'CHANGE-ME';

const SHEETS = {
  projects: {
    name: 'Projects',
    headers: ['Project ID', 'Project', 'Est. Hours', 'Logged Hours', 'Hours Left', 'Status', 'Created', 'Updated'],
    widths: [110, 180, 90, 100, 90, 80, 150, 150],
  },
  entries: {
    name: 'Entries',
    headers: ['Entry ID', 'Date', 'Project', 'Hours', 'Note', 'Project ID', 'Created', 'Updated'],
    widths: [110, 90, 150, 60, 420, 110, 150, 150],
  },
  deleted: {
    name: 'Deleted',
    headers: ['Deleted At', 'Kind', 'ID', 'Date', 'Project', 'Hours / Est.', 'Note'],
    widths: [150, 70, 110, 90, 150, 90, 420],
  },
};

const STAMP_FORMAT = 'm/d/yyyy h:mm am/pm';

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

// Optional: run once from the editor to create the tabs and grant access.
function setup() {
  ensureSheets_();
}

/* ---------- operations ---------- */

function applyOp_(ctx, op) {
  if (!op || !op.op) return;
  switch (op.op) {
    case 'putProject': return putProject_(ctx, op.project);
    case 'delProject': return delProject_(ctx, op.id);
    case 'putEntry':   return putEntry_(ctx, op.entry);
    case 'delEntry':   return delEntry_(ctx, op.id);
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
  if (!existing || oldName !== p.name) renameInEntries_(ctx, p.id, p.name);
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
  sheet.getRange(r, 1, 1, 8).setValues([[
    en.id,
    en.date,                      // "YYYY-MM-DD"; Sheets stores it as a real date
    safeText_(projectName_(ctx, en.projectId)),
    Number(en.hours) || 0,
    safeText_(en.note || ''),
    en.projectId,
    stamp_(en.created),
    stamp_(en.updated),
  ]]);
  if (!existing) remember_(ctx, sheet, en.id, r);
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

function renameInEntries_(ctx, projectId, name) {
  const sheet = ctx.entries;
  const last = sheet.getLastRow();
  if (last < 2) return;
  const ids = sheet.getRange(2, 6, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === projectId) sheet.getRange(i + 2, 3).setValue(safeText_(name));
  }
}

function projectName_(ctx, projectId) {
  const r = rowOf_(ctx, ctx.projects, projectId);
  return r ? String(ctx.projects.getRange(r, 2).getValue()) : '';
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
  const entries = rows_(ss.getSheetByName(SHEETS.entries.name)).map(function (v) {
    return {
      id: String(v[0]),
      date: v[1] instanceof Date ? Utilities.formatDate(v[1], tz, 'yyyy-MM-dd') : String(v[1]),
      hours: Number(v[3]) || 0,
      note: String(v[4]),
      projectId: String(v[5]),
      created: iso_(v[6]),
      updated: iso_(v[7]),
    };
  });
  return { ok: true, projects: projects, entries: entries };
}

function rows_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 8).getValues().filter(function (v) { return v[0] !== ''; });
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
      if (k === 'deleted') {
        sh.getRange('A:A').setNumberFormat(STAMP_FORMAT);
        sh.getRange('D:D').setNumberFormat('m/d/yyyy');
      }
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
function isNewer_(sheet, row, incomingIso) {
  const have = sheet.getRange(row, 8).getValue();
  if (!(have instanceof Date) || !incomingIso) return false;
  return have.getTime() > new Date(incomingIso).getTime();
}

// Stop notes like "=..." or "-primer" from being read as formulas.
function safeText_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function stamp_(iso) {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

function iso_(v) {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function checkKey_(key) {
  if (APP_KEY === 'CHANGE-ME') throw new Error('Set APP_KEY at the top of the backup script, then deploy a new version.');
  if (String(key || '') !== APP_KEY) throw new Error('The backup key does not match the one in the script.');
}

function respond_(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
