import json, re, html, urllib.request, datetime, os
from collections import Counter

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode('utf-8', 'replace')

def jget(url):
    t = get(url)
    try:
        return json.loads(t)
    except Exception:
        return json.loads(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', t))

def clean(s, n=300):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()[:n]

jobs = []
errors = []
def add(co, br, title, loc, dept, url, desc=''):
    jobs.append({'company':co,'board':br,'title':(title or '').strip(),'location':(loc or ''),'dept':(dept or ''),'url':url,'desc':clean(desc)})

GH = [('Vinted','vinteden'),('Adyen','adyen'),('Mews','mewssystems'),('JetBrains','jetbrains'),('Bird','bird'),('Truecaller','truecaller'),('Lovable','lovable'),('Trustpilot','trustpilot'),('Wolt','wolt'),('Oura','oura'),('Relex','relex'),('On Running','onrunning'),('Scandit','scandit'),('GoStudent','gostudent'),('Bitpanda','bitpanda')]
for co, tok in GH:
    try:
        d = jget('https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=true' % tok)
        for j in d.get('jobs', []):
            add(co,'gh', j.get('title'), (j.get('location') or {}).get('name'), ','.join(x.get('name','') for x in (j.get('departments') or [])), j.get('absolute_url'), j.get('content'))
    except Exception as e:
        errors.append('%s: %s' % (co, e))

ASH = [('Hostinger','hostinger'),('Mollie','mollie'),('Keyrock','keyrock'),('Trustly','trustly'),('Legora','legora'),('Pleo','pleo'),('Lunar','lunar'),('Gelato','gelato'),('Dune','dune'),('ICEYE','iceye'),('Supercell','supercell')]
for co, tok in ASH:
    try:
        d = jget('https://api.ashbyhq.com/posting-api/job-board/%s' % tok)
        for j in d.get('jobs', []):
            desc = j.get('description') if isinstance(j.get('description'), str) else ''
            if not desc:
                desc = str(j.get('descriptionLists') or '')
            add(co,'ashby', j.get('title'), j.get('location'), j.get('department') or j.get('team') or '', 'https://jobs.ashbyhq.com/%s/%s' % (tok, j.get('id')), desc)
    except Exception as e:
        errors.append('%s: %s' % (co, e))

LEV = [('Deliverect','deliverect'),('Spotify','spotify'),('SonarSource','sonarsource')]
for co, tok in LEV:
    try:
        d = jget('https://api.lever.co/v0/postings/%s?mode=json' % tok)
        for j in d:
            c = j.get('categories') or {}
            add(co,'lever', j.get('text'), c.get('location'), c.get('department') or c.get('team') or '', j.get('hostedUrl'), j.get('descriptionPlain'))
    except Exception as e:
        errors.append('%s: %s' % (co, e))

try:
    h = get('https://career.oxylabs.io/')
    found = {}
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', h, re.S)
    if m:
        data = json.loads(m.group(1))
        def walk(o):
            if isinstance(o, dict):
                if o.get('title') and (o.get('department') or o.get('location')) and (o.get('id') or o.get('href')):
                    found[str(o.get('href') or o.get('id'))] = o
                for v in o.values(): walk(v)
            elif isinstance(o, list):
                for v in o: walk(v)
        walk(data)
    if not found:
        for mm in re.finditer(r'/job/([a-f0-9]{8})/([a-z0-9-]+)', h):
            found[mm.group(0)] = {'title': mm.group(2).replace('-',' ').title(), 'location':'', 'department':''}
    for k, o in found.items():
        hid = str(o.get('id') or k)
        mm2 = re.search(r'[a-f0-9]{8}', hid)
        first8 = mm2.group(0) if mm2 else hid[:8]
        slug = (o.get('href') or k).rstrip('/').split('/')[-1]
        url = 'https://career.oxylabs.io/job/%s/%s' % (first8, slug)
        add('Oxylabs','custom', o.get('title'), o.get('location'), o.get('department'), url, o.get('shortDescription') or o.get('description') or '')
    if not found: errors.append('Oxylabs: nothing found')
except Exception as e:
    errors.append('Oxylabs: %s' % e)

try:
    h = get('https://cast.ai/careers/')
    rx = re.compile(r'href="https://cast\.ai/careers/apply/\?gh_jid=(\d+)">\s*([^<]*)\s*</a><div class="cx-gh-location">\s*<span class="location">([^<]*)</span>')
    n = 0
    for mm in rx.finditer(h):
        add('Cast AI','custom', mm.group(2), mm.group(3), '', 'https://cast.ai/careers/apply/?gh_jid=%s' % mm.group(1))
        n += 1
    if n == 0: errors.append('Cast AI: regex no match (gh_jid present: %s)' % ('gh_jid' in h))
except Exception as e:
    errors.append('Cast AI: %s' % e)

try:
    h = get('https://nordsecurity.com/careers/')
    rx = re.compile(r'data-ga-slug="Careers role: ([^"]*)" class="[^"]*" href="(/careers/[a-f0-9-]{36}/)" data-role-card="true" data-product="([^"]*)" data-location="([^"]*)" data-area="([^"]*)"')
    n = 0
    for mm in rx.finditer(h):
        add('Nord Security','custom', mm.group(1), mm.group(4), '%s / %s' % (mm.group(3), mm.group(5)), 'https://nordsecurity.com%s' % mm.group(2))
        n += 1
    if n == 0: errors.append('Nord Security: regex no match')
except Exception as e:
    errors.append('Nord Security: %s' % e)

KW = re.compile(r'procure|vendor|third[- ]?party|supplier|sourc|categor|asset manage|asset manager|GRC|govern|complian|conform|risk|control|assurance|audit|IT oper|IT ops|business oper|business ops|operation|program|project manag|enablement|officer|process|quality|integrity|regulat|policy', re.I)
cands = [j for j in jobs if KW.search(j['title'] or '') or KW.search(j['dept'] or '')]
seen = set(); uniq = []
for j in cands:
    if j['url'] in seen: continue
    seen.add(j['url']); uniq.append(j)

os.makedirs('results', exist_ok=True)
cnt = Counter('%s|%s' % (j['company'], j['board']) for j in jobs)
summary = {'generated_utc': datetime.datetime.utcnow().isoformat(), 'total_jobs': len(jobs), 'candidates': len(uniq), 'errors': errors, 'per_board': dict(cnt)}
with open('results/latest.json', 'w') as f:
    json.dump({'summary': summary, 'candidates': uniq}, f, indent=1)
print(json.dumps(summary)[:3000])
