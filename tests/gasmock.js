// Minimal Apps Script mock: enough of SpreadsheetApp etc. to run Code.gs.
const fs = require("fs");
const vm = require("vm");

// Like Sheets: a leading ' forces text (and is dropped); otherwise strings that
// look like dates, numbers or booleans are converted.
function cellIn(v) {
  if (typeof v !== "string") return v;
  if (v.startsWith("'")) return v.slice(1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + "T00:00:00Z");
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(v)) {
    const [m, d, y] = v.split("/").map(Number);
    return new Date(Date.UTC(y ? (y < 100 ? 2000 + y : y) : 2026, m - 1, d));
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
  return v;
}
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sh.rows[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? "" : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    vals.forEach((row, i) => row.forEach((v, j) => {
      const rr = this.r - 1 + i;
      while (this.sh.rows.length <= rr) this.sh.rows.push([]);
      this.sh.rows[rr][this.c - 1 + j] = cellIn(v);
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; } setNumberFormat() { return this; } setWrap() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some(v => v !== "" && v !== undefined)) return i + 1;
    return 0;
  }
  getRange(r, c, nr = 1, nc = 1) { if (typeof r === "string") return new Range(this, 1, 1, 0, 0); return new Range(this, r, c, nr, nc); }
  appendRow(row) { this.rows[this.getLastRow()] = row.map(cellIn); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setFrozenRows() {} setColumnWidth() {}
}
function makeSpreadsheet(id) {
  const sheets = [new Sheet("Sheet1")];
  return {
    sheets,
    menus: [],
    active: null,
    getId: () => id,
    getName: () => "Shop Hours Backup",
    setActiveSheet(s) { this.active = s.name; return s; },
    toast() {},
    getSpreadsheetTimeZone: () => "UTC",
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = new Sheet(n); sheets.push(s); return s; },
    getSheets: () => sheets.slice(),
    deleteSheet: s => sheets.splice(sheets.indexOf(s), 1),
  };
}
// opts.sheetId stands in for a different spreadsheet (a copy); opts.props for the
// script properties it starts with.
function loadScript(path, key, opts = {}) {
  const ss = makeSpreadsheet(opts.sheetId || "sheet-1");
  const props = Object.assign({}, opts.props);
  const ui = { createMenu: name => { const m = { name, items: [] }; return { addItem(label, fn) { m.items.push([label, fn]); return this; }, addToUi() { ss.menus.push(m); } }; } };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => "UTC" },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty(k, v) { props[k] = String(v); return this; } }) },
    console, Date,
  };
  vm.createContext(ctx);
  let src = fs.readFileSync(path, "utf8");
  if (key) src = src.replace("const APP_KEY = 'CHANGE-ME';", "const APP_KEY = " + JSON.stringify(key) + ";");
  vm.runInContext(src, ctx);
  return {
    ss,
    props,
    run: name => ctx[name](),
    get: params => JSON.parse(ctx.doGet({ parameter: params }).s),
    post: body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } }).s),
  };
}
module.exports = { loadScript };
