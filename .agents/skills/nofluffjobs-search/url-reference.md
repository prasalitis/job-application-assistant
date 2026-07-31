# No Fluff Jobs URL Reference

Public, unauthenticated endpoints used by this skill. The portal serves both
English (`nofluffjobs.com/job`) and Polish (`nofluffjobs.com/pl/job`) paths.

> **Personal use only** — robots.txt disallows `/api/` and `/posting/` paths but
> allows the public search pages. Keep volume low and respect the portal's terms.

## Search

```
GET https://nofluffjobs.com/job?criteria={query}
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `criteria` | Free-text query (title, skill, keyword) | `software asset management` · `developer` · `devops` |

The search returns an HTML page with job listings. Each job card contains:
- Job title (in a heading element)
- Salary range (when available)
- Category tags
- Company name
- Location
- Relative URL to detail page (pattern: `/job/{slug}-{id}`)

The full URL path segment after `/job/` is the job's identifier used by this skill — there is no separate numeric ID. What looks like a trailing number (e.g. `senior-devops-engineer-company-remote-12345`) is just part of the slug text, not an extractable ID; pass the entire string after `/job/` to `detail`.

## Detail

```
GET https://nofluffjobs.com/job/{full-slug}
```

Or via Polish path:
```
GET https://nofluffjobs.com/pl/job/{full-slug}
```

The detail page returns a single job's full HTML with:
- Full job title
- Company name and link
- Salary range (B2B and employment, with "see take-home" links)
- Location(s)
- Job type (remote, hybrid, on-site)
- Contract type
- Posting date / validity period
- Must-have and nice-to-have skill lists
- Requirements description (rich text)
- Offer description (rich text)
- Responsibilities
- Recruitment process steps
- Benefits and perks
- Company information

## Pagination

The search results page uses lazy loading rather than traditional pagination.
This skill handles pagination by fetching subsequent pages via the `?page=` parameter
when available, or by parsing "See more offers" / "Pokaż kolejne oferty" links.

For the initial implementation, we fetch the first page and rely on `--limit` for
client-side result capping. Future enhancement could add proper pagination support.

## Notes

- No authentication required.
- Respect rate limits — the CLI backs off on 429/5xx with exponential backoff + jitter.
- Both English and Polish language content is indexed and searchable.
- The portal heavily uses server-side rendering, so HTML parsing is reliable.
- Job cards use a consistent markdown-like heading structure (### for title, #### for company).
