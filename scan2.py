import json, re, urllib.request
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace"))
targets = {
  "trustly": ["37b2f348-2681-4a3e-bf6f-b9c14927328c", "870088c0-c4ae-457f-abe3-15ddcb5e8cbe"],
  "iceye": ["5ff08d58-36d8-447f-9d52-2a29743e0fd7", "474d44ee-8f40-40c2-90e6-8720499b965e", "08012612-81fe-4563-998f-e336ca3c333c", "e358575f-01c4-40ce-aac5-68f7255fce67", "88554f1c-3889-44cd-9296-1d61d2330d6a"],
}
import html
NL = chr(10)
with open("out/desc2.txt", "w") as f:
    for org, ids in targets.items():
        d = get("https://api.ashbyhq.com/posting-api/job-board/" + org)
        for j in d.get("jobs", []):
            if j.get("id") in ids:
                dh = j.get("descriptionHtml") or ""
                txt = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", dh)))
                f.write("### " + org + " " + j.get("title","") + NL + "LOC: " + str(j.get("location")) + (" REMOTE" if j.get("isRemote") else "") + NL + txt[:2000] + NL + NL)
print("done")