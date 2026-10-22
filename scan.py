import json, re, sys, urllib.request, html as h, traceback
GH = "https://boards-api.greenhouse.io/v1/boards/{}/jobs?content=true"
ASH = "https://api.ashbyhq.com/posting-api/job-board/{}"
LEV = "https://api.lever.co/v0/postings/{}?mode=json"
GH_T = ["vinteden","adyen","mewssystems","jetbrains","bird","truecaller","lovable","trustpilot","wolt","oura","relex","onrunning","scandit","gostudent","bitpanda"]
ASH_T = ["hostinger","mollie","keyrock","trustly","legora","pleo","lunar","gelato","dune","iceye","supercell"]
LEV_T = ["deliverect","spotify","sonarsource"]
MATCH = re.compile(r"(procure|sourc|vendor|third[- ]party|supplier|categor|grc|govern|complian|risk|control|assurance|audit|officer|program|project manag|asset manag|ITAM|software asset|IT operation|IT manager|business operation|security|purchas|contract|spend)", re.I)
NL = chr(10)
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
def strip(x):
    x = re.sub(r"<[^>]+>", " ", x or "")
    return re.sub(r"\s+", " ", h.unescape(x)).strip()
def write(company, jobs):
    with open("out/alltitles/%s.txt" % company, "w") as f:
        for j in jobs:
            f.write(j["title"] + " | " + j["dept"] + " | " + j["loc"] + " | " + j["url"] + NL)
    ms = [j for j in jobs if MATCH.search(j["title"] + " " + j["dept"] + " " + j["desc"][:1500])]
    for i in range(0, len(ms), 25):
        with open("out/matches/%s_%d.txt" % (company, i//25), "w") as f:
            for j in ms[i:i+25]:
                f.write("### " + j["title"] + NL + "DEPT: " + j["dept"] + NL + "LOC: " + j["loc"] + NL + "URL: " + j["url"] + NL + "DESC: " + j["desc"][:1500] + NL + NL)
    return len(jobs), len(ms)
def run():
    total = {}
    for t in GH_T:
        try:
            print("fetching", t, flush=True)
            d = json.loads(get(GH.format(t)))
            jobs = []
            for j in d.get("jobs", []):
                depts = ",".join(x.get("name","") for x in j.get("departments") or [])
                jobs.append(dict(title=j.get("title",""), dept=depts, loc=(j.get("location") or {}).get("name",""), url=j.get("absolute_url",""), desc=strip(j.get("content",""))))
            total[t] = write(t, jobs)
        except Exception as e:
            total[t] = "ERROR " + repr(e)
            traceback.print_exc()
    for t in ASH_T:
        try:
            print("fetching", t, flush=True)
            d = json.loads(get(ASH.format(t)))
            jobs = []
            for j in d.get("jobs", []):
                loc = j.get("location") or ""
                if j.get("secondaryLocations"):
                    loc = str(loc) + " + " + ",".join(str(s.get("location","")) for s in j["secondaryLocations"])
                jobs.append(dict(title=j.get("title",""), dept=j.get("department") or j.get("team") or "", loc=loc, url=j.get("jobUrl") or ("https://jobs.ashbyhq.com/%s/%s" % (t, j.get("id",""))), desc=strip(j.get("description") or "") + (" REMOTE" if j.get("isRemote") else "")))
            total[t] = write(t, jobs)
        except Exception as e:
            total[t] = "ERROR " + repr(e)
            traceback.print_exc()
    for t in LEV_T:
        try:
            d = json.loads(get(LEV.format(t)))
            jobs = []
            for j in d:
                c = j.get("categories") or {}
                jobs.append(dict(title=j.get("text",""), dept=c.get("team","") + "/" + c.get("department",""), loc=c.get("location",""), url=j.get("hostedUrl",""), desc=strip(j.get("content","") or j.get("text",""))))
            total[t] = write(t, jobs)
        except Exception as e:
            total[t] = "ERROR " + repr(e)
    try:
        raw = get("https://career.oxylabs.io/")
        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', raw, re.S)
        jobs = []
        ids = {}
        for mm in re.finditer(r'href="/job/([a-f0-9]{8})/([a-z0-9-]*)"', raw):
            ids[mm.group(1)] = mm.group(2)
        if m:
            data = json.loads(m.group(1))
            found = []
            def walk(o):
                if isinstance(o, dict):
                    if ("department" in o or "jobDepartment" in o) and "location" in o and "id" in o:
                        found.append(o)
                    for v in o.values(): walk(v)
                elif isinstance(o, list):
                    for v in o: walk(v)
            walk(data)
            for o in found:
                oid = str(o.get("id","")); i8 = oid[:8]
                title = o.get("title") or o.get("name") or o.get("position") or (ids.get(i8) or "").replace("-"," ")
                slug = ids.get(i8) or title.lower().replace(" ","-")
                jobs.append(dict(title=title, dept=str(o.get("department") or o.get("jobDepartment") or ""), loc=str(o.get("location") or ""), url="https://career.oxylabs.io/job/%s/%s" % (i8, slug), desc=json.dumps({k:v for k,v in o.items() if isinstance(v,(str,int))})[:1200]))
        total["oxylabs"] = write("oxylabs", jobs)
    except Exception as e:
        total["oxylabs"] = "ERROR " + repr(e)
    try:
        raw = get("https://cast.ai/careers/")
        jobs = [dict(title=x.group(2).strip(), dept="", loc=x.group(3).strip(), url="https://cast.ai/careers/apply/?gh_jid=%s" % x.group(1), desc="") for x in re.finditer(r'href="https://cast\.ai/careers/apply/\?gh_jid=(\d+)">\s*([^<]*)\s*</a><div class="cx-gh-location">\s*<span class="location">([^<]*)</span>', raw)]
        total["castai"] = write("castai", jobs)
    except Exception as e:
        total["castai"] = "ERROR " + repr(e)
    try:
        raw = get("https://nordsecurity.com/careers/")
        pat = r'data-ga-slug="Careers role: ([^"]*)" class="[^"]*" href="(/careers/[a-f0-9-]{36}/)" data-role-card="true" data-product="([^"]*)" data-location="([^"]*)" data-area="([^"]*)"'
        jobs = [dict(title=x.group(1).strip(), dept=x.group(5), loc=x.group(4), url="https://nordsecurity.com"+x.group(2), desc="product:"+x.group(3)+" area:"+x.group(5)) for x in re.finditer(pat, raw)]
        total["nordsecurity"] = write("nordsecurity", jobs)
    except Exception as e:
        total["nordsecurity"] = "ERROR " + repr(e)
    with open("out/DONE.txt", "w") as f:
        f.write(json.dumps(total, indent=1))
    print("DONE", json.dumps(total)[:2000], flush=True)
run()