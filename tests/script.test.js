const { loadScript } = require("./gasmock");
const assert = require("assert");
const S = require("path").join(__dirname, "..", "backup-script", "Code.gs");
const V = +require("fs").readFileSync(S, "utf8").match(/const SCRIPT_VERSION = (\d+);/)[1];
const APP = require("path").join(__dirname, "..", "app", "index.html");
assert.ok(+require("fs").readFileSync(APP, "utf8").match(/const SCRIPT_LATEST = (\d+);/)[1] <= V,
  "SCRIPT_LATEST in app/index.html can't ask people for a script version that doesn't exist yet");
// no key yet: says where to make one
let g = loadScript(S);
assert.match(g.get({ key: "x" }).error, /no key yet.*Shop Hours, then Phone setup/);
// setup() makes a key once, shows it on the Phone setup tab, and keeps it (and a pasted link) on later runs
g.run("setup");
const tab = g.ss.getSheetByName("Phone setup");
const madeKey = tab.rows[1][1];
assert.match(madeKey, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
assert.strictEqual(g.get({ key: madeKey }).ok, true);
assert.match(g.get({ key: "x" }).error, /does not match/);
const LINK = "https://script.google.com/macros/s/AKfyTEST/exec";
tab.rows[2][1] = LINK;
g.run("setup");
assert.strictEqual(tab.rows[1][1], madeKey, "same key on a second run");
assert.strictEqual(tab.rows[2][1], LINK, "pasted link kept");
assert.strictEqual(tab.rows[3][0], "Setup code");
assert.match(tab.rows[3][1], /^=IF\(B3="".*B3 & "#" & B2\)$/, "setup code joins link and key");
assert.deepStrictEqual(tab.rows[4], ["Script version", V]);
assert.strictEqual(g.ss.active, "Phone setup", "setup shows the Phone setup tab");
// pasting a newer script (fresh context, same spreadsheet, same stored properties) keeps the key
let g2 = loadScript(S, null, { props: g.props });
assert.strictEqual(g2.get({ key: madeKey }).ok, true);
// a copy of the sheet that brought the original's properties along must not share its key
g2 = loadScript(S, null, { sheetId: "copy-of-sheet-1", props: g.props });
assert.match(g2.get({ key: madeKey }).error, /no key yet/);
g2.run("setup");
const copyKey = g2.ss.getSheetByName("Phone setup").rows[1][1];
assert.notStrictEqual(copyKey, madeKey, "the copy makes its own key");
assert.strictEqual(g2.get({ key: copyKey }).ok, true);
assert.strictEqual(g.get({ key: madeKey }).ok, true, "the original keeps working");
// a key made before keys remembered their sheet still works
g2 = loadScript(S, null, { props: { APP_KEY: "abcd-efgh-jkmn" } });
assert.strictEqual(g2.get({ key: "abcd-efgh-jkmn" }).ok, true);
// the template's Start here tab is removed by setup, and the sheet gets a Shop Hours menu
g2 = loadScript(S);
g2.ss.sheets[0].name = "Start here";
g2.run("onOpen");
assert.deepStrictEqual(g2.ss.menus, [{ name: "Shop Hours", items: [["Phone setup", "setup"]] }]);
g2.run("setup");
assert.strictEqual(g2.ss.getSheetByName("Start here"), null, "Start here tab removed");
assert.deepStrictEqual(g2.ss.sheets.map(s => s.name), ["Projects", "Entries", "Employees", "Deleted", "Phone setup"]);
// a passphrase typed into APP_KEY wins, and setup shows it
g = loadScript(S, "amx70");
g.run("setup");
assert.strictEqual(g.ss.getSheetByName("Phone setup").rows[1][1], "amx70");
g = loadScript(S, "amx70");
assert.match(g.get({ key: "bad" }).error, /does not match/);
assert.deepStrictEqual(g.get({ key: "amx70" }), { ok: true, sheet: "Shop Hours Backup", projects: 0, entries: 0, version: V });
assert.strictEqual(g.get({ key: "bad" }).version, V, "errors carry the version too");
assert.deepStrictEqual(g.ss.sheets.map(s => s.name), ["Projects", "Entries", "Employees", "Deleted"]);
const t = n => new Date(Date.UTC(2026, 9, 16, 12, n)).toISOString();
const P = { id: "p1", name: "AMX", est: 400, status: "active", created: t(0), updated: t(0) };
const E1 = { id: "e1", projectId: "p1", date: "2026-10-16", hours: 10, note: "Blocked 120 door/trunk jams", created: t(1), updated: t(1) };
const E2 = { id: "e2", projectId: "p1", date: "2026-10-15", hours: 6.5, note: "-primer, = filler\n2nd line, \"quoted\"", created: t(2), updated: t(2) };
// entry arriving before its project (edge case) then project
let r = g.post({ key: "amx70", ops: [{ op: "putEntry", entry: E2 }, { op: "putProject", project: P }, { op: "putEntry", entry: E1 }] });
assert.deepStrictEqual(r, { ok: true, applied: 3, version: V });
const ent = g.ss.getSheetByName("Entries"), pr = g.ss.getSheetByName("Projects");
assert.strictEqual(ent.rows[1][2], "AMX", "project name backfilled");
assert.strictEqual(ent.rows[1][4], E2.note, "note kept literally");
assert.strictEqual(pr.rows[1][3], "=SUMIF(Entries!F:F,A2,Entries!D:D)");
// update + stale update ignored
g.post({ key: "amx70", ops: [{ op: "putEntry", entry: { ...E1, hours: 9, updated: t(5) } }] });
g.post({ key: "amx70", ops: [{ op: "putEntry", entry: { ...E1, hours: 1, updated: t(3) } }] });
assert.strictEqual(ent.rows[2][3], 9);
// rename
g.post({ key: "amx70", ops: [{ op: "putProject", project: { ...P, name: "AMX '70", updated: t(6) } }] });
assert.ok(ent.rows.slice(1).every(r => r[2] === "AMX '70"));
// delete goes to Deleted tab
g.post({ key: "amx70", ops: [{ op: "delEntry", id: "e2" }, { op: "delEntry", id: "nope" }] });
assert.strictEqual(ent.getLastRow(), 2);
assert.strictEqual(g.ss.getSheetByName("Deleted").rows[1][2], "e2");
// export round trip
const ex = g.get({ key: "amx70", action: "export" });
assert.deepStrictEqual(ex.entries, [{ id: "e1", date: "2026-10-16", hours: 9, note: E1.note, projectId: "p1", created: t(1), updated: t(5), employeeId: "" }]);
assert.deepStrictEqual(ex.projects, [{ id: "p1", name: "AMX '70", est: 400, status: "active", created: t(0), updated: t(6) }]);
// garbage body
assert.match(g.post("not json").error, /not readable/);
// bulk: 300 entries in one request, then all re-sent (idempotent)
const many = Array.from({ length: 300 }, (_, i) => ({ op: "putEntry", entry: { ...E1, id: "b" + i, hours: 1, updated: t(9) } }));
g.post({ key: "amx70", ops: many }); g.post({ key: "amx70", ops: many });
assert.strictEqual(ent.getLastRow(), 302);
// text comes back exactly as typed, even when Sheets would read it as something else
g = loadScript(S, "k");
const odd = ["3/4", "TRUE", "007", "'70 AMX", "-1", "@home", "=SUM(A1)", "plain"];
g.post({ key: "k", ops: [{ op: "putProject", project: { ...P, name: "'70 AMX" } }].concat(
  odd.map((note, i) => ({ op: "putEntry", entry: { ...E1, id: "o" + i, note } }))) });
let back = g.get({ key: "k", action: "export" });
assert.strictEqual(back.projects[0].name, "'70 AMX");
assert.deepStrictEqual(back.entries.map(e => e.note), odd);
assert.ok(g.ss.getSheetByName("Entries").rows.slice(1).every(r => r[2] === "'70 AMX"), "name on Entries tab");
// a blank or hand-mangled Updated cell must not make the sheet's row look newer than the phone's
g.ss.getSheetByName("Entries").rows[1][7] = "";
g.ss.getSheetByName("Entries").rows[2][7] = "sometime";
back = g.get({ key: "k", action: "export" });
assert.strictEqual(back.entries[0].updated, "");
assert.strictEqual(back.entries[1].updated, "");
assert.strictEqual(back.entries[2].updated, t(1));
// ---- employees (script v4) ----
g = loadScript(S, "k");
const M = { id: "m1", name: "Mike", active: true, created: t(0), updated: t(0) };
const D = { id: "m2", name: "Dave", active: true, created: t(0), updated: t(0) };
const EM = (id, employeeId, extra) => ({ ...E1, id, employeeId, ...extra });
// an entry can arrive before its employee; the name is filled in when the employee does
g.post({ key: "k", ops: [{ op: "putProject", project: P }, { op: "putEntry", entry: EM("x1", "m1") },
  { op: "putEmployee", employee: M }, { op: "putEmployee", employee: D }, { op: "putEntry", entry: EM("x2", "m2") },
  { op: "putEntry", entry: EM("x3", "") }] });
const ents = g.ss.getSheetByName("Entries"), emps = g.ss.getSheetByName("Employees");
assert.deepStrictEqual(ents.rows[0].slice(8), ["Employee", "Employee ID"]);
assert.deepStrictEqual(ents.rows.slice(1).map(r => [r[8], r[9]]), [["Mike", "m1"], ["Dave", "m2"], ["", ""]]);
assert.deepStrictEqual(emps.rows[1].slice(0, 4), ["m1", "Mike", "=SUMIF(Entries!J:J,A2,Entries!D:D)", "Active"]);
// rename carries to Entries; retiring keeps the row
g.post({ key: "k", ops: [{ op: "putEmployee", employee: { ...M, name: "Michael", active: false, updated: t(7) } }] });
assert.strictEqual(ents.rows[1][8], "Michael");
assert.strictEqual(emps.rows[1][3], "Retired");
// a stale employee update is ignored
g.post({ key: "k", ops: [{ op: "putEmployee", employee: { ...M, name: "Old", updated: t(1) } }] });
assert.strictEqual(emps.rows[1][1], "Michael");
// an entry from an app version before employees (no employeeId at all) keeps its employee
const { employeeId: _drop, ...noEmp } = EM("x1", "m1", { hours: 3, updated: t(8) });
g.post({ key: "k", ops: [{ op: "putEntry", entry: noEmp }] });
assert.deepStrictEqual([ents.rows[1][3], ents.rows[1][8], ents.rows[1][9]], [3, "Michael", "m1"]);
// export includes employees and each entry's employeeId
let exE = g.get({ key: "k", action: "export" });
assert.deepStrictEqual(exE.employees.map(m => [m.id, m.name, m.active]), [["m1", "Michael", false], ["m2", "Dave", true]]);
assert.deepStrictEqual(exE.entries.map(e => e.employeeId), ["m1", "m2", ""]);
// deleting an employee copies it to Deleted
g.post({ key: "k", ops: [{ op: "delEmployee", id: "m2" }] });
assert.strictEqual(emps.getLastRow(), 2);
assert.deepStrictEqual([...g.ss.getSheetByName("Deleted").rows.slice(-1)[0].slice(1, 5)], ["Employee", "m2", "", "Dave"]);
// a sheet made by an older script gets the new Entries headers and an Employees tab
g = loadScript(S, "k");
g.get({ key: "k" });
g.ss.getSheetByName("Entries").rows[0] = g.ss.getSheetByName("Entries").rows[0].slice(0, 8);
g.ss.sheets.splice(g.ss.sheets.indexOf(g.ss.getSheetByName("Employees")), 1);
g.get({ key: "k" });
assert.deepStrictEqual(g.ss.getSheetByName("Entries").rows[0].slice(8), ["Employee", "Employee ID"]);
assert.ok(g.ss.getSheetByName("Employees"), "Employees tab added");
console.log("all script tests passed");
