const { loadScript } = require("./gasmock");
const assert = require("assert");
const S = require("path").join(__dirname, "..", "backup-script", "Code.gs");
// unset key
let g = loadScript(S);
assert.match(g.get({ key: "x" }).error, /Set APP_KEY/);
g = loadScript(S, "amx70");
assert.match(g.get({ key: "bad" }).error, /does not match/);
assert.deepStrictEqual(g.get({ key: "amx70" }), { ok: true, sheet: "Shop Hours Backup", projects: 0, entries: 0 });
assert.deepStrictEqual(g.ss.sheets.map(s => s.name), ["Projects", "Entries", "Deleted"]);
const t = n => new Date(Date.UTC(2026, 9, 16, 12, n)).toISOString();
const P = { id: "p1", name: "AMX", est: 400, status: "active", created: t(0), updated: t(0) };
const E1 = { id: "e1", projectId: "p1", date: "2026-10-16", hours: 10, note: "Blocked 120 door/trunk jams", created: t(1), updated: t(1) };
const E2 = { id: "e2", projectId: "p1", date: "2026-10-15", hours: 6.5, note: "-primer, = filler\n2nd line, \"quoted\"", created: t(2), updated: t(2) };
// entry arriving before its project (edge case) then project
let r = g.post({ key: "amx70", ops: [{ op: "putEntry", entry: E2 }, { op: "putProject", project: P }, { op: "putEntry", entry: E1 }] });
assert.deepStrictEqual(r, { ok: true, applied: 3 });
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
assert.deepStrictEqual(ex.entries, [{ id: "e1", date: "2026-10-16", hours: 9, note: E1.note, projectId: "p1", created: t(1), updated: t(5) }]);
assert.deepStrictEqual(ex.projects, [{ id: "p1", name: "AMX '70", est: 400, status: "active", created: t(0), updated: t(6) }]);
// garbage body
assert.match(g.post("not json").error, /not readable/);
// bulk: 300 entries in one request, then all re-sent (idempotent)
const many = Array.from({ length: 300 }, (_, i) => ({ op: "putEntry", entry: { ...E1, id: "b" + i, hours: 1, updated: t(9) } }));
g.post({ key: "amx70", ops: many }); g.post({ key: "amx70", ops: many });
assert.strictEqual(ent.getLastRow(), 302);
console.log("all script tests passed");
