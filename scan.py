import json, re, html, urllib.request, datetime, os
from collections import Counter

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode('utf-8', 'replace')

def jget(url):
    t = get(url)
    try:
        return json.loads(t)
    except Exception:
        return json.loads(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', t))

def clean(s, n=600):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()[:n]

os.makedirs('results', exist_ok=True)
jobs = []
errors = []
def add(co, title, dept, team, loc, url, desc='', extra=''):
    jobs.append({'company':co,'title':(title or '').strip(),'dept':(dept or ''),'team':(team or ''),'location':(loc or ''),'url':url,'desc':desc,'extra':extra or ''})

for co, tok in [('Mistral AI','mistral.ai'), ('OpenAI','openai')]:
    try:
        d = jget('https://api.ashbyhq.com/posting-api/job-board/%s' % tok)
        for j in d.get('jobs', []):
            secs = ';'.join((s.get('location') or '') for s in (j.get('secondaryLocations') or []))
            add(co, j.get('title'), j.get('department'), j.get('team'),
                j.get('location') or '', 'https://jobs.ashbyhq.com/%s/%s' % (tok, j.get('id')),
                j.get('descriptionPlain') or j.get('description') or '',
                'workplaceType=%s;type=%s;listed=%s;secLoc=[%s];id=%s' % (j.get('workplaceType'), j.get('employmentType'), j.get('isListed'), secs, j.get('id')))
    except Exception as e:
        errors.append('%s: %s' % (co, e))

try:
    d = jget('https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true')
    for j in d.get('jobs', []):
        deps = ','.join(x.get('name','') for x in (j.get('departments') or []))
        add('Anthropic', j.get('title'), deps, '', (j.get('location') or {}).get('name'), j.get('absolute_url'), j.get('content'), 'ghId=%s' % j.get('id'))
except Exception as e:
    errors.append('Anthropic: %s' % e)

try:
    h = get('https://jobs.bendingspoons.com/')
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if m:
        lst = json.loads(m.group(1))['props']['pageProps']['list']
        for j in lst:
            locs = ','.join(sorted(set((o.get('title') or '') for o in (j.get('officeLocations') or []))))
            tow = ','.join(j.get('typesOfWork') or [])
            add('Bending Spoons', j.get('jobTitle'), tow, '', locs,
                'https://jobs.bendingspoons.com/positions/%s' % j.get('id'),
                j.get('description') or j.get('jobDescription') or '',
                'status=%s;typesOfWork=%s' % (j.get('status'), tow))
except Exception as e:
    errors.append('Bending Spoons: %s' % e)

cnt = Counter(j['company'] for j in jobs)
summary = {'generated_utc': datetime.datetime.utcnow().isoformat(), 'total': len(jobs), 'per_company': dict(cnt), 'errors': errors}

# 1. strict governance shortlist (title or dept keyword)
STRICT = re.compile(r'procure|purchas|vendor|third[- ]?party|supplier|sourc|categor|buy|GRC|govern|complian|risk|control|assurance|audit|asset manage|asset|contract|IT oper|IT ops|security oper|GSO|trusted |counterintelligence|regulat', re.I)
short = [j for j in jobs if STRICT.search(j['title']) or STRICT.search(j['dept'])]
for j in short:
    j['desc'] = clean(j['desc'], 600)
for j in jobs:
    if j not in short:
        j.pop('desc', None)
with open('results/shortlist.json', 'w') as f:
    json.dump(short, f, indent=1)

# 2. PM/ops-flavored roles (for eyeball), compact
PM = re.compile(r'program|project manag|operations|operation', re.I)
pm_lines = []
for j in jobs:
    if PM.search(j['title']) and not STRICT.search(j['title']):
        pm_lines.append('%s | %s | %s | %s | %s | %s' % (j['company'], j['title'], j['dept'], j['location'], j['extra'][:60], j['url']))
for i in range(0, len(pm_lines), 90):
    with open('results/pm_%d.txt' % (i // 90), 'w') as f:
        f.write('\n'.join(pm_lines[i:i+90]))

# 3. tracked known roles status
TRACKED = {
 'Mistral AI': ['Procurement Category Manager (IT and Data)', 'Procurement Category Manager (Workplace and Marketing)', 'Senior Third-Party Risk Specialist', 'Security Compliance Specialist', 'Security Compliance, GRC Engineer'],
 'Anthropic': ['Transaction Principal, EU'],
}
known = []
for j in jobs:
    if j['company'] in TRACKED and j['title'] in TRACKED[j['company']]:
        known.append({'company': j['company'], 'title': j['title'], 'dept': j['dept'], 'loc': j['location'], 'extra': j['extra'], 'url': j['url']})
with open('results/known.json', 'w') as f:
    json.dump(known, f, indent=1)

with open('results/summary.json', 'w') as f:
    json.dump(summary, f, indent=1)
print(json.dumps(summary)[:2000])
print('shortlist:', len(short), 'pm_lines:', len(pm_lines), 'known:', len(known))
