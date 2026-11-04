import json, re, os, urllib.request, time

OUT = "board-fetch/results"
CAND = "board-fetch/candidates"

def fetch(url, tries=3):
    err = ""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            err = str(e)
            time.sleep(3)
    raise Exception(err)

def strip_html(s):
    s = s or ""
    s = re.sub(r"<script.*?</script>", " ", s, flags=re.S|re.I)
    s = re.sub(r"<style.*?</style>", " ", s, flags=re.S|re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()

SOFT = re.compile(r"procur|sourc|vendor|third[- ]party|supplier|asset|licen|contract|govern|grc|complian|risk|assur|control|audit|regulat|officer|operation|program|project|pmo|policy|trust|sustainab", re.I)
STRONG = re.compile(r"procur|vendor|third[- ]party|supplier|it asset|software asset|governance|grc|compliance program|outsourc|vendor risk|regulatory", re.I)
HARD = re.compile(r"engineer|developer|scientist|data scien|machine learning|\bsales\b|marketing|design|\brecruit|account executive|\bsdr\b|\bbdr\b|\bstore\b|warehouse|\bdriver\b|chef|barista", re.I)

def classify(jobs):
    cands = []
    for j in jobs:
        t = (j.get("t") or "")
        c = (j.get("content") or "")
        if SOFT.search(t) and not HARD.search(t):
            cands.append({"t": t, "loc": j.get("loc"), "d": j.get("d"), "u": j.get("u"), "content": c[:2200]})
        else:
            m2 = STRONG.search(c)
            if m2:
                s = max(0, m2.start() - 400)
                cands.append({"t": t, "loc": j.get("loc"), "d": j.get("d"), "u": j.get("u"),
                              "content": ("..." if s > 0 else "") + c[s:s+2200]})
    return cands

def write_json(path, obj):
    with open(path, "w") as f:
        f.write(json.dumps(obj, ensure_ascii=True))

def emit(key, jobs, err):
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CAND, exist_ok=True)
    base = [{"t": j.get("t"), "loc": j.get("loc"), "d": j.get("d"), "u": j.get("u")} for j in jobs]
    write_json(os.path.join(OUT, key + ".json"), {"count": len(jobs), "error": err, "jobs": base})
    cands = classify(jobs)
    parts = [cands[i:i+8] for i in range(0, len(cands), 8)] or [[]]
    for n, part in enumerate(parts):
        suffix = "" if n == 0 else "-" + str(n + 1)
        write_json(os.path.join(CAND, key + suffix + ".json"), part)

GH = {"vinted": "vinteden", "adyen": "adyen", "mews": "mewssystems", "jetbrains": "jetbrains",
      "bird": "bird", "truecaller": "truecaller", "lovable": "lovable", "trustpilot": "trustpilot",
      "wolt": "wolt", "oura": "oura", "relex": "relex", "on": "onrunning", "scandit": "scandit",
      "gostudent": "gostudent", "bitpanda": "bitpanda"}

for key, token in GH.items():
    jobs, err = [], None
    try:
        data = json.loads(fetch("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=true" % token))
        for j in data.get("jobs", []):
            jobs.append({"t": j.get("title"), "loc": (j.get("location") or {}).get("name"),
                         "d": ", ".join(dd.get("name", "") for dd in j.get("departments", [])),
                         "u": j.get("absolute_url"),
                         "content": strip_html(j.get("content") or "")})
    except Exception as e:
        err = str(e)[:200]
    emit(key, jobs, err)

ASHBY = {"hostinger": "hostinger", "mollie": "mollie", "keyrock": "keyrock", "trustly": "trustly",
         "legora": "legora", "pleo": "pleo", "lunar": "lunar", "gelato": "gelato", "dune": "dune",
         "iceye": "iceye", "supercell": "supercell"}

for key, token in ASHBY.items():
    jobs, err = [], None
    try:
        data = json.loads(fetch("https://api.ashbyhq.com/posting-api/job-board/" + token))
        for j in data.get("jobs", []):
            rem = " |remote:" + str(j.get("isRemote")) if "isRemote" in j else ""
            jobs.append({"t": j.get("title"), "loc": str(j.get("location") or "") + rem,
                         "d": j.get("department") or j.get("team") or "",
                         "u": j.get("jobUrl"),
                         "content": strip_html(j.get("description") or j.get("descriptionPlain") or "")})
    except Exception as e:
        err = str(e)[:200]
    emit(key, jobs, err)

LEVER = {"deliverect": "deliverect", "spotify": "spotify", "sonarsource": "sonarsource"}

for key, token in LEVER.items():
    jobs, err = [], None
    try:
        data = json.loads(fetch("https://api.lever.co/v0/postings/%s?mode=json" % token))
        for p in data:
            cat = p.get("categories") or {}
            jobs.append({"t": p.get("text"), "loc": cat.get("location"),
                         "d": " / ".join([x for x in [cat.get("department"), cat.get("team")] if x]),
                         "u": p.get("hostedUrl"),
                         "content": strip_html(p.get("descriptionPlain") or p.get("description") or "")})
    except Exception as e:
        err = str(e)[:200]
    emit(key, jobs, err)

# Oxylabs (Prismic/Next static page)
jobs, err = [], None
try:
    html = fetch("https://career.oxylabs.io/")
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if m:
        data = json.loads(m.group(1))
        def walk(o):
            if isinstance(o, dict):
                keys = set(o.keys())
                if "id" in keys and ("department" in keys or "location" in keys):
                    t = o.get("title") or o.get("name") or o.get("text")
                    if t:
                        oid = str(o.get("id"))
                        href = o.get("href")
                        u = ("https://career.oxylabs.io" + href) if (href and href.startswith("/")) else (href or ("https://career.oxylabs.io/job/%s/" % oid[:8]))
                        jobs.append({"t": t, "loc": o.get("location"), "d": o.get("department"),
                                     "u": u,
                                     "content": strip_html(o.get("longform") or o.get("description") or "")})
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(data)
    if not jobs:
        for mm in re.finditer(r'/job/([a-f0-9]{8})/([a-z0-9-]*)', html):
            jobs.append({"t": "(title unknown - open page)", "loc": "", "d": "",
                         "u": "https://career.oxylabs.io/job/%s/%s" % (mm.group(1), mm.group(2)), "content": ""})
except Exception as e:
    err = str(e)[:200]
emit("oxylabs", jobs, err)

# Cast AI (static HTML)
jobs, err = [], None
try:
    html = fetch("https://cast.ai/careers/")
    for mm in re.finditer(r'gh_jid=(\d+)">\s*([^<]*)\s*</a><div class="cx-gh-location">\s*<span class="location">([^<]*)</span>', html):
        jobs.append({"t": mm.group(2), "loc": mm.group(3), "d": "",
                     "u": "https://cast.ai/careers/apply/?gh_jid=" + mm.group(1), "content": ""})
    if not jobs:
        for mm in re.finditer(r'gh_jid=(\d+)"[^>]*>\s*([^<]{3,100}?)\s*</a>', html):
            jobs.append({"t": mm.group(2), "loc": "", "d": "",
                         "u": "https://cast.ai/careers/apply/?gh_jid=" + mm.group(1), "content": ""})
except Exception as e:
    err = str(e)[:200]
emit("castai", jobs, err)

# Nord Security (static HTML)
jobs, err = [], None
try:
    html = fetch("https://nordsecurity.com/careers/")
    for mm in re.finditer(r'data-ga-slug="Careers role: ([^"]*)" class="[^"]*" href="(/careers/[a-f0-9-]{36}/)" data-role-card="true" data-product="([^"]*)" data-location="([^"]*)" data-area="([^"]*)"', html):
        jobs.append({"t": mm.group(1), "loc": mm.group(4), "d": mm.group(5) + " | product: " + mm.group(3),
                     "u": "https://nordsecurity.com" + mm.group(2), "content": ""})
except Exception as e:
    err = str(e)[:200]
emit("nordsecurity", jobs, err)

print("done")
