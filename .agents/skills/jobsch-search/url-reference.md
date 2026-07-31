# jobs.ch — URL & Data Reference

Investigated 2026-07-31. jobs.ch is Switzerland's job board. Both search-results
pages and individual detail pages embed clean, standard schema.org structured data in
`<script type="application/ld+json">` tags - no HTML card scraping needed for either.

## robots.txt

```
Disallow: /de/stellenangebote/detail/*/*/*
Disallow: /en/vacancies/detail/*/*/*
Disallow: /fr/offres-emplois/detail/*/*/*
```

**Individual job-detail pages are explicitly disallowed** for all user-agents, with no
exception. Search/listing pages (`/en/vacancies/?term=...`) are NOT disallowed - only
the detail pages are. Also disallowed: `/api/`, login/auth/registration paths,
application-submission paths, and single-digit numeric paths (`/0` through `/9`).

**Decision (2026-07-31, explicit user instruction):** build the skill including the
`detail` command anyway, on the same personal-use judgment call this repo already
makes for `linkedin-search` and LinkedIn's Terms of Service - a real job-seeker
looking up a handful of postings for their own application, not a competitor
bulk-scraping the site. See the `SKILL.md`'s personal-use warning. If this judgment
changes, the fix is to delete `cli/src/commands/detail.ts`'s implementation and
narrow the skill to `search` only.

## Search

**URL pattern:**
```
https://www.jobs.ch/en/vacancies/?term=<url-encoded keyword>[&page=<n>]
```

- `term=` is a free-text keyword query. Confirmed live: `term=IT governance` returned
  1057 results with highly relevant titles (Cyber Governance & Risk Manager, IT
  Service Management Manager).
- `page=<n>` (1-indexed) confirmed live to return different results per page.
- Page size is 21 results.

**Where the data lives:** the page's single `<script type="application/ld+json">` tag
contains a JSON **array** of four schema.org objects: `WebSite`, `CollectionPage`,
`BreadcrumbList`, and `ItemList`. The `ItemList`'s `itemListElement` is an array of
`{ "@type": "ListItem", "position": N, "item": { <JobPosting> } }` entries. Each
embedded `JobPosting` has:

```jsonc
{
  "title": "...",
  "description": "...",       // short, auto-generated one-liner - NOT the full posting
  "identifier": { "value": "<uuid>" },   // the job ID
  "datePosted": "2026-07-22T10:33:43+02:00",  // ISO 8601
  "employmentType": "Permanent position",
  "hiringOrganization": { "name": "..." },
  "jobLocation": { "address": { "addressLocality": "...", "addressCountry": "CH" } },
  "url": "https://www.jobs.ch/en/vacancies/detail/<uuid>/"
}
```

## Detail

**URL pattern:** `https://www.jobs.ch/en/vacancies/detail/<uuid>/` (the job ID from a
search result's `identifier.value`).

**Where the data lives:** the detail page has its own single-object
`<script type="application/ld+json">` with `"@type": "JobPosting"` (distinct from the
search page's array-of-four-objects shape). This one is much richer than the search
page's embedded copy - full `description` (HTML, needs tag-stripping), `employmentType`,
`workHours`, `baseSalary` (often present but with an empty `value` object in practice),
`applicationContact.name`, `occupationalCategory`, and `potentialAction.target.urlTemplate`
(the apply URL). The CLI currently surfaces title/company/location/date/description/
employmentType/applyUrl; salary and contact-person fields were seen but are not yet
exposed - straightforward to add if needed.

## Access & fetching quirks

- **Bun's native `fetch()` works fine** - unlike pracuj.pl and moovijob.com, jobs.ch is
  not behind a Cloudflare bot challenge (confirmed live, no 403). No `curl` workaround
  needed; this skill has zero runtime dependencies.
- No login/authentication required for search or the (robots.txt-disallowed) detail
  pages.

## Not yet confirmed / left as gaps

- Salary and named contact-person fields exist in the detail JSON-LD but aren't
  currently exposed by the CLI.
- No location-filter query parameter was tested (the investigation query didn't need
  one); `jobLocation` in the response suggests one likely exists.
