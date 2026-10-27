import json, re, html, urllib.request, datetime, os, sys
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

def clean(s, n=2500):
    s = re.sub(r'<[^>]+>', ' ', s or '')
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()[:n]

os.makedirs('results', exist_ok=True)
jobs = []
errors = []
def add(co, title, dept, team, loc, url, desc='', extra=''):
    jobs.append({'company':co,'title':(title or '').strip(),'dept':(dept or ''),'team':(team or ''),'location':(loc or ''),'url':url,'desc':clean(desc) if desc else '','extra':extra or ''})

# 1+2. Ashby boards
for co, tok in [('Mistral AI','mistral.ai'), ('OpenAI','openai')]:
    try:
        d = jget('https://api.ashbyhq.com/posting-api/job-board/%s' % tok)
        for j in d.get('jobs', []):
            secs = ';'.join((s.get('location') or '') for s in (j.get('secondaryLocations') or []))
            add(co, j.get('title'), j.get('department'), j.get('team'),
                j.get('location') or '', 'https://jobs.ashbyhq.com/%s/%s' % (tok, j.get('id')),
                j.get('descriptionPlain') or j.get('description') or '',
                'workplaceType=%s;type=%s;listed=%s;secLoc=[%s]' % (j.get('workplaceType'), j.get('employmentType'), j.get('isListed'), secs))
    except Exception as e:
        errors.append('%s: %s' % (co, e))

# 3. Anthropic Greenhouse (content=true so we have descriptions for candidates)
try:
    d = jget('https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true')
    for j in d.get('jobs', []):
        deps = ','.join(x.get('name','') for x in (j.get('departments') or []))
        add('Anthropic', j.get('title'), deps, '', (j.get('location') or {}).get('name'), j.get('absolute_url'), j.get('content'), 'ghId=%s' % j.get('id'))
except Exception as e:
    errors.append('Anthropic: %s' % e)

# 4. Bending Spoons
try:
    h = get('https://jobs.bendingspoons.com/')
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if not m:
        errors.append('Bending Spoons: no __NEXT_DATA__ (len=%d)' % len(h))
    else:
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

# 5. Systematic (paginated SuccessFactors CSB)
try:
    sysjobs = {}
    page = get('https://jobs.systematic.com/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=0')
    mtotal = re.search(r'Results \d+ to \d+ of (\d+)', page)
    total = int(mtotal.group(1)) if mtotal else 200
    pages = [page]
    for s in range(10, total + 20, 10):
        pages.append(get('https://jobs.systematic.com/search/?q=&sortColumn=referencedate&sortDirection=desc&startrow=%d' % s))
    for t in pages:
        for row in re.findall(r'<tr[^>]*class="data-row.*?</tr>', t, re.S):
            mt = re.search(r'class="jobTitle-link"\s+href="([^"]+)"[^>]*>(.*?)</a>', row, re.S)
            ml = re.search(r'jobLocation">(.*?)</span>', row, re.S)
            if mt:
                href = html.unescape(mt.group(1))
                title = html.unescape(re.sub(r'<[^>]+>', '', mt.group(2))).strip()
                loc = html.unescape(re.sub(r'<[^>]+>', '', ml.group(1))).strip() if ml else ''
                sysjobs[href] = (title, loc)
    for href, (title, loc) in sysjobs.items():
        add('Systematic', title, '', '', loc, 'https://jobs.systematic.com' + href, '', '')
except Exception as e:
    errors.append('Systematic: %s' % e)

# 6. Terma via Jobindex mirror
try:
    h = get('https://www.jobindex.dk/jobsoegning?q=Terma')
    if 'Terma | Jobindex' not in h and 'jobindex' not in h.lower():
        errors.append('Terma: unexpected page, title check')
    h = h.replace('\\/', '/').replace('\\"', '"')
    cards = re.findall(r'<h4><A HREF="(http[^"]+)"[^>]*>(.*?)</a></h4>.*?jix_robotjob--area">(.*?)</span>', h, re.S)
    for url, title, loc in cards:
        add('Terma', html.unescape(re.sub(r'<[^>]+>', '', title)).strip(), '', '', html.unescape(loc).strip(), url, '', 'mirror=jobindex')
    if not cards:
        cards2 = re.findall(r'jobtitle[^>]*>(.*?)<', h)
        errors.append('Terma: regex no match (alt titles found: %d)' % len(cards2))
except Exception as e:
    errors.append('Terma: %s' % e)

KW = re.compile(r'procure|vendor|third[- ]?party|supplier|sourc|categor|asset manage|GRC|govern|complian|conform|risk|control|assurance|audit|IT oper|IT ops|business oper|business ops|operations|operation|program|project manag|contract|buy|purchas|enablement|regulat|policy|quality|integrity', re.I)

cnt = Counter(j['company'] for j in jobs)
summary = {'generated_utc': datetime.datetime.utcnow().isoformat(), 'total': len(jobs), 'per_company': dict(cnt), 'errors': errors}
with open('results/summary.json', 'w') as f:
    json.dump(summary, f, indent=1)
print(json.dumps(summary)[:2000])

# full lists, chunked
for co in cnt:
    rows = [j for j in jobs if j['company'] == co]
    slug = co.replace(' ', '_').replace('/', '_')
    lines = ['%s | dept=%s | team=%s | loc=%s | %s | %s | url=%s' % (j['title'], j['dept'], j['team'], j['location'], j['extra'], (j['desc'] or '')[:60], j['url']) for j in rows]
    for i in range(0, len(lines), 80):
        fn = 'results/all_%s_%d.txt' % (slug, i // 80)
        with open(fn, 'w') as f:
            f.write('\n'.join(lines[i:i+80]))

# candidates (keyword hit in title or dept) with descriptions
cands = [j for j in jobs if KW.search(j['title']) or KW.search(j['dept'])]
for j in cands:
    j['desc'] = j['desc'][:2500]
with open('results/candidates.json', 'w') as f:
    json.dump(cands, f, indent=1)
print('candidates:', len(cands))
