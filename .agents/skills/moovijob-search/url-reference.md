# moovijob.com — URL & Data Reference

Investigated 2026-07-31. **Luxembourg only** - despite often being grouped with
Belgium in market research, moovijob.com's homepage and site title confirm it covers
Luxembourg exclusively (no Belgium content found).

## robots.txt

Disallows admin/legacy/category-tag paths only; the `/job-offers/...` listing and
detail paths used here are not disallowed.

## Search

**URL pattern (English subdomain):**
```
https://en.moovijob.com/job-offers/jobs-luxembourg?q=<url-encoded keyword>[&page=<n>]
```

- `q=` is a free-text keyword query (English or French). Confirmed live: `q=IT
  governance` returned 206 results including highly relevant titles ("ICT Governance
  Officer" at Advanzia Bank, "Head of IT Infrastructure Management").
- No confirmed location-filter query parameter beyond the fixed `/jobs-luxembourg`
  path segment (the whole site is Luxembourg-scoped, so a separate location filter
  wasn't needed for this investigation).
- `en.` / `de.` / `fr.` subdomains serve the same listings in different languages
  (`https://de.moovijob.com/stellenangebote/jobs-luxemburg`,
  `https://www.moovijob.com/offres-emploi/jobs-luxembourg`). The CLI uses the English
  subdomain as the default since not every user speaks French or German.

**Where the data lives:** results are server-rendered HTML job cards (no JSON API or
embedded `__NEXT_DATA__`-style blob was found for the search page, unlike pracuj.pl).
Each card:

```html
<li class="mb-3 list-style-none company-item">
  <a href="https://en.moovijob.com/job-offers/<company-slug>/<title-slug>"
     class="card card-job-offer-new ..." data-id="326450" target="_blank">
    ...
    <p class="card-job-offer-new-title ...">Junior ICT Governance Officer</p>
    <p class="company-name"><small>Advanzia Bank</small></p>
    ...
    <small class="badge ... bg-primary-500 ...">Munsbach</small>       <!-- location -->
    <small class="badge ... bg-primary-400 ...">Permanent contract</small>  <!-- contract type -->
    ...
    <div class="published_ago ..."><small>1w ago</small></div>        <!-- relative date -->
  </a>
</li>
```

`data-id` is numeric and unique per posting - the CLI's `parseJobCards` splits the
page on the `.../job-offers/` anchor pattern and parses each chunk independently, same
approach as `linkedin-search`. **Search-result dates are relative text** ("1w ago",
"6 h") - there is no absolute date on the card itself.

## Detail

**URL pattern:** the full posting URL from a search result -
`https://en.moovijob.com/job-offers/<company-slug>/<title-slug>` - there is no
separate numeric-ID-only URL form (unlike pracuj.pl); the full slug path is the
identifier. The CLI's `detail` command therefore also accepts a bare
`<company-slug>/<title-slug>` path as a shorthand for the full URL.

**Where the data lives:** every detail page embeds a clean, standard
[schema.org `JobPosting`](https://schema.org/JobPosting) block in
`<script type="application/ld+json">`. This is far more reliable than scraping
rendered markup - it is intended for search-engine consumption and unlikely to change
without notice. Relevant fields:

```jsonc
{
  "@type": "JobPosting",
  "title": "...",
  "datePosted": "2026-07-21T09:21:01+02:00",   // ISO 8601, absolute
  "validThrough": "2026-09-21T09:21:01+02:00", // deadline
  "employmentType": ["FULL_TIME"],
  "description": "<p>...</p>",                  // HTML, needs tag-stripping
  "jobLocation": { "address": { "addressLocality": "Munsbach", "addressCountry": "LU" } },
  "hiringOrganization": { "name": "Advanzia Bank" }
}
```

## Access & fetching quirks

- **Cloudflare blocks Bun's native `fetch()`**, same as pracuj.pl - confirmed live on
  this exact site: `curl` gets HTTP 200, Bun's `fetch()` gets a 403 bot-challenge. The
  CLI shells out to `curl` via `Bun.spawn`, identical pattern to `pracuj-search`.
- No login/authentication required for search or detail pages.

## Not yet confirmed / left as gaps

- No pagination parameter beyond `page=<n>` was deeply tested (only confirmed the
  base query works; multi-page behavior not separately verified).
- No posting-age filter parameter found; search-result dates are relative text, not
  reliably parseable into exact days without a fixed vocabulary of Luxembourgish/
  English relative-time phrases ("1w ago", "6 h", "2d ago") - the CLI does not
  currently implement client-side `--jobage` filtering for this reason (unlike
  `pracuj-search`, which has absolute ISO dates to filter on).
