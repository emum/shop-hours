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

# mock Google backend: a node process holding one sheet, talking JSON lines
node = subprocess.Popen(["node", "-e", """
const {loadScript}=require('./gasmock'); const g=loadScript(process.env.SCRIPT,'amx70');
const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',l=>{const m=JSON.parse(l);let out;
 if(m.dump){out={ent:g.ss.getSheetByName('Entries').rows,proj:g.ss.getSheetByName('Projects').rows,del:g.ss.getSheetByName('Deleted').rows};}
 else out=m.method==='GET'?g.get(m.params):g.post(m.body);
 process.stdout.write(JSON.stringify(out)+'\\n');});
"""], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, cwd=HERE, env={**os.environ, "SCRIPT": SCRIPT})
lock = threading.Lock()
def ask(m):
    with lock:
        node.stdin.write(json.dumps(m) + "\n"); node.stdin.flush()
        return json.loads(node.stdout.readline())
state = {"down": False, "posts": 0}
def handler(route, req):
    if state["down"]:
        return route.abort()
    from urllib.parse import urlparse, parse_qs
    if req.method == "POST":
        state["posts"] += 1
        out = ask({"method": "POST", "body": req.post_data})
    else:
        q = {k: v[0] for k, v in parse_qs(urlparse(req.url).query).items()}
        out = ask({"method": "GET", "params": q})
    route.fulfill(status=200, content_type="application/json", body=json.dumps(out), headers={"Access-Control-Allow-Origin": "*"})

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
    print("wrong key ->", pg.inner_text("#test-result"))
    pg.fill("#f-key", "amx70"); pg.click("text=Save and test"); pg.wait_for_timeout(1200)
    print("right key ->", pg.inner_text("#test-result"))
    pg.screenshot(path=f"{OUT}/5-settings.png", full_page=True)
    d = ask({"dump": 1})
    print("sheet entries:", [r[:5] for r in d["ent"]])
    print("sheet projects:", d["proj"])
    # offline: new entry queues, then comes back
    state["down"] = True
    pg.click("text=Projects"); pg.wait_for_timeout(200)
    pg.click(".proj"); pg.wait_for_timeout(200)
    pg.click("#dock .btn"); pg.wait_for_timeout(300)
    pg.fill("#e-date", "2026-10-13"); pg.fill("#e-hours", "4"); pg.fill("#e-note", "Media blasted the trunk lid")
    pg.click("text=Save entry"); pg.wait_for_timeout(800)
    print("offline status ->", pg.inner_text("#status"))
    pg.screenshot(path=f"{OUT}/6-offline.png")
    state["down"] = False
    pg.click("[data-act=retry]"); pg.wait_for_timeout(1000)
    print("back online ->", pg.inner_text("#status"))
    # edit + delete
    pg.click("text=Media blasted the trunk lid"); pg.wait_for_timeout(300)
    pg.click("text=Delete entry"); pg.wait_for_timeout(1000)
    pg.screenshot(path=f"{OUT}/7-project.png", full_page=True)
    pg.click("text=Projects"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/8-home.png")
    d = ask({"dump": 1})
    print("entries rows:", len(d["ent"]) - 1, "deleted rows:", [r[2:7] for r in d["del"][1:]])
    c.close()
    # new phone: restore
    c2, pg2 = newctx("dark")
    pg2.goto("http://127.0.0.1:8765/#/backup"); pg2.wait_for_timeout(300)
    pg2.fill("#f-url", URL); pg2.fill("#f-key", "amx70"); pg2.click("text=Save and test"); pg2.wait_for_timeout(600)
    print("new phone test ->", pg2.inner_text("#test-result"))
    pg2.click("button[data-act=restore]"); pg2.wait_for_timeout(800); pg2.screenshot(path=f"{OUT}/8b-restored.png", full_page=True); print("toast ->", pg2.inner_text("#toast")); print("hash ->", pg2.evaluate("location.hash"))
    pg2.click("[data-act=home]"); pg2.wait_for_timeout(300)
    pg2.screenshot(path=f"{OUT}/9-dark-home.png")
    pg2.click(".proj"); pg2.wait_for_timeout(300)
    pg2.screenshot(path=f"{OUT}/10-dark-project.png")
    print("restored total ->", pg2.inner_text(".big .n"))
    b.close()
print("posts:", state["posts"], "page errors:", errors)
assert not errors, errors
print("e2e passed; screenshots in tests/shots/")
node.kill(); srv.shutdown()
