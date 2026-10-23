import json, subprocess, threading, http.server, functools, os, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app")
SCRIPT = os.path.join(HERE, "..", "backup-script", "Code.gs")
OUT = os.path.join(HERE, "shots")
os.makedirs(OUT, exist_ok=True)
# serves app/ on http://127.0.0.1:8765
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), functools.partial(http.server.SimpleHTTPRequestHandler, directory=APP))
threading.Thread(target=srv.serve_forever, daemon=True).start()

# mock Google backend: a node process holding one sheet per deployment id, talking JSON lines
node = subprocess.Popen(["node", "-e", """
const {loadScript}=require('./gasmock'); const gs={};
const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',l=>{const m=JSON.parse(l);let out;
 const g=gs[m.sheet||'AKfyTEST']||(gs[m.sheet||'AKfyTEST']=loadScript(process.env.SCRIPT,'amx70'));
 if(m.dump){out={ent:g.ss.getSheetByName('Entries').rows,proj:g.ss.getSheetByName('Projects').rows,del:g.ss.getSheetByName('Deleted').rows};}
 else out=m.method==='GET'?g.get(m.params):g.post(m.body);
 process.stdout.write(JSON.stringify(out)+'\\n');});
"""], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, cwd=HERE, env={**os.environ, "SCRIPT": SCRIPT})
lock = threading.Lock()
def ask(m):
    with lock:
        node.stdin.write(json.dumps(m) + "\n"); node.stdin.flush()
        return json.loads(node.stdout.readline())
state = {"down": False, "hang": False, "posts": 0}
def handler(route, req):
    if state["down"]:
        return route.abort()
    if state["hang"] and req.method == "POST":
        state["held"] = route  # never answered, like a stalled request on one bar of signal
        return
    from urllib.parse import urlparse, parse_qs
    sid = urlparse(req.url).path.split("/")[3]  # /macros/s/<deployment id>/exec
    if req.method == "POST":
        state["posts"] += 1
        out = ask({"sheet": sid, "method": "POST", "body": req.post_data})
    else:
        q = {k: v[0] for k, v in parse_qs(urlparse(req.url).query).items()}
        out = ask({"sheet": sid, "method": "GET", "params": q})
    if state.get("old"):
        out.pop("version", None)  # the first published script didn't send a version
    route.fulfill(status=200, content_type="application/json", body=json.dumps(out), headers={"Access-Control-Allow-Origin": "*"})
def sheet(sid="AKfyTEST"):
    return ask({"sheet": sid, "method": "GET", "params": {"key": "amx70", "action": "export"}})

URL = "https://script.google.com/macros/s/AKfyTEST/exec"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    def newctx(scheme="light"):
        c = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=scheme)
        c.route("https://script.google.com/**", handler)
        pg = c.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        return c, pg
    c, pg = newctx()
    pg.goto("http://127.0.0.1:8765/")
    pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/1-empty.png")
    # add project
    pg.click("text=Add a project")
    pg.wait_for_timeout(300)
    pg.fill("#p-name", "AMX"); pg.fill("#p-est", "400")
    pg.screenshot(path=f"{OUT}/2-newproject.png")
    pg.click("text=Add project")
    pg.wait_for_timeout(300)
    # log entries before backup is configured
    for d, h, n in [("2026-10-14", "6", "Stripped quarter panels, cut out rust in rear wheel wells"),
                    ("2026-10-15", "8.5", "Welded patch panels, first skim of filler on driver side"),
                    ("2026-10-16", "", "Blocked 120 door/trunk jams")]:
        pg.click("#dock .btn"); pg.wait_for_timeout(300)
        pg.fill("#e-date", d)
        if h: pg.fill("#e-hours", h)
        else:
            for _ in range(20): pg.click("[data-step='0.5']")
        pg.fill("#e-note", n)
        if d == "2026-10-16": pg.screenshot(path=f"{OUT}/3-entry.png")
        pg.click("text=Save entry"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/4-project-nobackup.png")
    # validation
    pg.click("#dock .btn"); pg.wait_for_timeout(300); pg.click("text=Save entry")
    assert pg.is_visible("text=Enter the hours worked."), "validation"
    pg.click("text=Cancel"); pg.wait_for_timeout(300)
    # set up backup
    pg.click("text=Projects"); pg.wait_for_timeout(200)
    pg.click("text=Set up backup"); pg.wait_for_timeout(200)
    pg.fill("#f-url", URL); pg.fill("#f-key", "wrong")
    pg.click("text=Save and test"); pg.wait_for_timeout(400)
    assert "does not match" in pg.inner_text("#test-result"), "wrong key message"
    pg.fill("#f-key", "amx70"); pg.click("text=Save and test"); pg.wait_for_timeout(1200)
    assert "Connected to" in pg.inner_text("#test-result"), "right key message"
    pg.screenshot(path=f"{OUT}/5-settings.png", full_page=True)
    d = ask({"dump": 1})
    assert [r[4] for r in d["ent"][1:]] == ["Stripped quarter panels, cut out rust in rear wheel wells",
        "Welded patch panels, first skim of filler on driver side", "Blocked 120 door/trunk jams"], d["ent"]
    assert [r[1] for r in d["proj"][1:]] == ["AMX"] and d["proj"][1][2] == 400, d["proj"]
    assert pg.evaluate("outbox.length") == 0, "outbox empty after setup"
    # offline: new entry queues, then comes back
    state["down"] = True
    pg.click("text=Projects"); pg.wait_for_timeout(200)
    pg.click(".proj"); pg.wait_for_timeout(200)
    pg.click("#dock .btn"); pg.wait_for_timeout(300)
    pg.fill("#e-date", "2026-10-13"); pg.fill("#e-hours", "4"); pg.fill("#e-note", "Media blasted the trunk lid")
    pg.click("text=Save entry"); pg.wait_for_timeout(800)
    assert "1 change waiting" in pg.inner_text("#status"), pg.inner_text("#status")
    assert pg.locator("[data-pending]:not([hidden])").count() == 1, "one entry marked not backed up"
    pg.screenshot(path=f"{OUT}/6-offline.png")
    state["down"] = False
    pg.click("[data-act=retry]"); pg.wait_for_timeout(1000)
    assert "Everything backed up" in pg.inner_text("#status"), pg.inner_text("#status")
    assert len(ask({"dump": 1})["ent"]) - 1 == 4, "offline entry reached the sheet"
    # edit + delete
    pg.click("text=Media blasted the trunk lid"); pg.wait_for_timeout(300)
    pg.click("text=Delete entry"); pg.wait_for_timeout(1000)
    pg.screenshot(path=f"{OUT}/7-project.png", full_page=True)
    pg.click("text=Projects"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/8-home.png")
    d = ask({"dump": 1})
    assert len(d["ent"]) - 1 == 3, "entry removed from Entries"
    assert [r[6] for r in d["del"][1:]] == ["Media blasted the trunk lid"], "copy kept on Deleted"
    c.close()
    # new phone: restore
    c2, pg2 = newctx("dark")
    pg2.goto("http://127.0.0.1:8765/#/backup"); pg2.wait_for_timeout(300)
    pg2.fill("#f-url", URL + "#amx70")  # one setup code from the Phone setup tab
    assert pg2.input_value("#f-url") == URL and pg2.input_value("#f-key") == "amx70", "setup code split into link and key"
    pg2.click("text=Save and test"); pg2.wait_for_timeout(600)
    assert "1 project and 3 entries" in pg2.inner_text("#test-result"), pg2.inner_text("#test-result")
    pg2.click("button[data-act=restore]"); pg2.wait_for_timeout(800); pg2.screenshot(path=f"{OUT}/8b-restored.png", full_page=True)
    assert "Restored 4 items" in pg2.inner_text("#toast"), pg2.inner_text("#toast")
    pg2.click("[data-act=home]"); pg2.wait_for_timeout(300)
    pg2.screenshot(path=f"{OUT}/9-dark-home.png")
    pg2.click(".proj"); pg2.wait_for_timeout(300)
    pg2.screenshot(path=f"{OUT}/10-dark-project.png")
    assert pg2.inner_text(".big .n") == "24.5", "restored total"
    c2.close()

    # ---- scenarios: a phone already set up, driven through the app's own functions ----
    def setup_phone():
        c, pg = newctx()
        pg.clock.install()
        pg.goto("http://127.0.0.1:8765/")
        pg.evaluate(f"localStorage.setItem('sh.settings', JSON.stringify({{url: '{URL}', key: 'amx70'}}))")
        pg.reload(); pg.wait_for_timeout(300)
        return c, pg
    def entry_js(eid, pid, note):
        return f"putEntry({{id: '{eid}', projectId: '{pid}', date: '2026-10-18', hours: 2, note: '{note}', created: nowIso()}})"

    # a request that never answers times out, and the backup carries on
    c3, pg3 = setup_phone()
    pg3.evaluate("putProject({id: 'pHang', name: 'Hang test', est: null, status: 'active', created: nowIso()})")
    pg3.wait_for_timeout(500)
    state["hang"] = True
    pg3.evaluate(entry_js("eHang", "pHang", "Sent on one bar"))
    pg3.wait_for_timeout(300)
    assert pg3.evaluate("flushing"), "request in flight"
    state["hang"] = False
    pg3.clock.run_for(46000); pg3.wait_for_timeout(200)
    assert "took too long" in pg3.inner_text("#status"), pg3.inner_text("#status")
    try: state.pop("held").abort()  # the page gave up on it; tidy up the test side
    except Exception: pass
    pg3.clock.run_for(16000); pg3.wait_for_timeout(500)
    assert pg3.evaluate("outbox.length") == 0, "outbox cleared after the retry"
    assert any(e["id"] == "eHang" for e in sheet()["entries"]), "entry reached the sheet"

    # restore while a delete is still waiting must not bring the entry back
    state["hang"] = True
    pg3.evaluate("removeEntry('eHang')"); pg3.wait_for_timeout(300)
    pg3.evaluate("restore()"); pg3.wait_for_timeout(300)
    assert not pg3.evaluate("data.entries.some(e => e.id === 'eHang')"), "deleted entry stayed deleted"
    state["hang"] = False
    pg3.clock.run_for(46000); pg3.wait_for_timeout(200)
    try: state.pop("held").abort()
    except Exception: pass
    pg3.clock.run_for(16000); pg3.wait_for_timeout(500)
    assert pg3.evaluate("outbox.length") == 0, "delete sent"
    assert not any(e["id"] == "eHang" for e in sheet()["entries"]), "gone from the sheet too"
    c3.close()

    # switching to a new sheet sends everything already on the phone, not just new changes
    c4, pg4 = setup_phone()
    pg4.evaluate("putProject({id: 'pMove', name: 'Moving sheets', est: 50, status: 'active', created: nowIso()})")
    pg4.evaluate(entry_js("eMove", "pMove", "Logged before the move"))
    pg4.clock.run_for(2000); pg4.wait_for_timeout(300)
    assert pg4.evaluate("outbox.length") == 0 and pg4.evaluate("sync.lastOk"), "synced to the first sheet"
    pg4.goto("http://127.0.0.1:8765/#/backup"); pg4.wait_for_timeout(300)
    pg4.fill("#f-url", URL.replace("AKfyTEST", "AKfyNEW")); pg4.click("text=Save and test")
    pg4.wait_for_timeout(300); pg4.clock.run_for(2000); pg4.wait_for_timeout(300)
    assert "Sending 2 items" in pg4.inner_text("#test-result"), pg4.inner_text("#test-result")
    new = sheet("AKfyNEW")
    assert [x["id"] for x in new["projects"]] == ["pMove"] and [x["id"] for x in new["entries"]] == ["eMove"], new
    c4.close()

    # an older backup script: backups still work, and the app points to the update steps
    c5, pg5 = setup_phone()
    state["old"] = True
    pg5.evaluate("putProject({id: 'pOld', name: 'Old script', est: null, status: 'active', created: nowIso()})")
    pg5.clock.run_for(2000); pg5.wait_for_timeout(300)
    assert pg5.evaluate("outbox.length") == 0, "old script still backs up"
    upd = pg5.locator("#status a[href$='#updating-the-backup-script']")
    assert upd.is_visible() and upd.inner_text() == "Update the backup script", pg5.inner_text("#status")
    pg5.click("text=Backup"); pg5.wait_for_timeout(300)
    assert "Version 1, update ready" in pg5.inner_text("#sync-card"), pg5.inner_text("#sync-card")
    pg5.screenshot(path=f"{OUT}/11-script-update.png", full_page=True)
    state["old"] = False
    pg5.evaluate("putEntry({id: 'eOld', projectId: 'pOld', date: '2026-10-18', hours: 1, note: '', created: nowIso()})")
    pg5.clock.run_for(2000); pg5.wait_for_timeout(300)
    assert "up to date" in pg5.inner_text("#sync-card"), pg5.inner_text("#sync-card")
    pg5.click("[data-act=home]"); pg5.wait_for_timeout(300)
    assert pg5.locator("#status a").count() == 0, "notice gone once the script is current"
    c5.close()

    # iPhone: a browser tab warns that its data is separate; the Home Screen app doesn't
    for standalone in (False, True):
        c6, pg6 = newctx()
        c6.add_init_script(f"Object.defineProperty(navigator, 'standalone', {{value: {str(standalone).lower()}}})")
        pg6.goto("http://127.0.0.1:8765/"); pg6.wait_for_timeout(300)
        shown = pg6.locator("#tabwarn").count() == 1
        pg6.goto("http://127.0.0.1:8765/#/backup"); pg6.wait_for_timeout(300)
        shown_backup = pg6.locator("#tabwarn").is_visible()
        if not standalone: pg6.screenshot(path=f"{OUT}/12-ios-tab-warning.png")
        assert shown == shown_backup == (not standalone), ("standalone", standalone, shown, shown_backup)
        c6.close()
    b.close()
print("posts:", state["posts"], "page errors:", errors)
assert not errors, errors
print("e2e passed; screenshots in tests/shots/")
node.kill(); srv.shutdown()
