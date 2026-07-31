# pracuj.pl — URL & Data Reference

Investigated 2026-07-31. pracuj.pl is a server-rendered Next.js app; there is no
separate public JSON API endpoint to call directly. Instead, every search or offer
page embeds the exact data the React frontend uses as a JSON blob inside
`<script id="__NEXT_DATA__" type="application/json">...</script>`. Fetching the page
HTML and extracting/parsing that one script tag gives structured data directly - no
CSS-class scraping needed, and it is far more stable across markup changes than
scraping rendered HTML.

## robots.txt

Disallows only account/admin/asset paths (`/konto/`, `/_styles/`, `/_scripts/`,
`/mpimages/`, etc.) - the `/praca/...` search and offer paths used here are not
disallowed.

## Search

**URL pattern:**
```
https://www.pracuj.pl/praca/<url-encoded keyword>;kw[/<url-encoded city>;wp][?pn=<page>]
```

- Keyword segment: `/<query>;kw` - omit entirely for no keyword filter.
- Location segment: `/<city>;wp` - optional, appended after the keyword segment. Tested
  with `wroclaw` -> normalizes to `"Wrocław"` in the resolved search criteria.
- Pagination: `?pn=<n>` (1-indexed). Confirmed `pn=2` returns page 2's `searchCriteria`
  correctly. Results-per-page (`rop`) appears fixed at 50 by default; not overridden.
- No confirmed posting-age / date-range URL parameter was found during investigation
  - the CLI instead filters client-side using each result's `lastPublicated` date
    (see `--jobage` in `SKILL.md`).

**Where the data lives:** parse `__NEXT_DATA__`, then
`props.pageProps.dehydratedState.queries` is an array of React-Query cache entries;
find the one whose `queryKey[0] === "jobOffers"`. Its `state.data` shape:

```jsonc
{
  "groupedOffers": [
    {
      "jobTitle": "...",
      "companyName": "...",
      "lastPublicated": "2026-07-29T09:00:00Z",   // ISO 8601
      "expirationDate": "2026-08-05T21:59:59Z",
      "offers": [
        {
          "partitionId": 1004946752,                // the offer ID
          "displayWorkplace": "Warszawa, Śródmieście",
          "offerAbsoluteUri": "https://www.pracuj.pl/praca/<slug>,oferta,1004946752"
        }
        // one entry per office/city variant of the same posting
      ]
    }
  ],
  "offersTotalCount": 1
}
```

A single "group" is one job posting; it can list multiple `offers[]` entries when the
same role is open in several cities. The CLI flattens this into one flat card per
(group, offer) pair.

## Detail

**URL pattern:**
```
https://www.pracuj.pl/praca/<anything>,oferta,<id>
```

**Quirk confirmed live:** the slug text before `,oferta,<id>` is not validated by the
server - a request to `/praca/x,oferta,1004946752` returns HTTP 200 with the same
content as the real slug URL. This means `detail <id>` never needs to reconstruct the
real slug from a search result; any placeholder text works.

**Where the data lives:** same `__NEXT_DATA__` extraction; find the query with
`queryKey[0] === "jobOffer"`. Its `state.data` shape (relevant fields):

```jsonc
{
  "attributes": {
    "jobTitle": "...",
    "description": "...",          // short, sometimes truncated with "..."
    "displayEmployerName": "...",
    "offerAbsoluteUrl": "...",
    "applying": { "applyUrl": "..." }
  },
  "textSections": [
    { "sectionType": "about-project", "plainText": "..." },
    { "sectionType": "responsibilities", "plainText": "..." },
    { "sectionType": "requirements-expected", "plainText": "..." }
    // ...more sections, in display order
  ],
  "publicationDetails": {
    "dateOfInitialPublicationUtc": "...",
    "expirationDateUtc": "..."
  }
}
```

`textSections[].plainText` gives the full, clean-text job description already split
by section (about-project, responsibilities, requirements, benefits, etc.) - joining
the non-empty ones in order produces a complete readable description without any HTML
stripping needed. `attributes.description` is a shorter, sometimes-truncated summary;
the CLI only falls back to it if `textSections` is empty.

## Access & fetching quirks

- **Cloudflare blocks Bun's native `fetch()` specifically.** Confirmed live: the exact
  same URL, same headers, same moment, same IP - `curl` returns HTTP 200, Bun's
  `fetch()` returns HTTP 403 with a "Just a moment..." Cloudflare challenge page. This
  is a TLS/HTTP-client fingerprint check (JA3/JA4-style), not a header check, so no
  amount of `fetch()` header tuning fixes it. The CLI's `htmlFetch` shells out to the
  system `curl` binary via `Bun.spawn` instead of calling `fetch()` directly - this is
  a deliberate deviation from the repo's zero-dependency convention, documented in
  `helpers.ts`. `curl` ships by default on Windows 10+/macOS/most Linux, so this is a
  reasonable dependency to require, but it is a real one - a machine without `curl`
  cannot run this skill.
- A short/generic User-Agent string (e.g. plain `"Mozilla/5.0"`) also got HTTP 403 via
  `curl` during investigation - a full, realistic desktop Chrome UA string is still
  required in addition to using `curl`.
- No login/authentication required for any of the above.
- Language: default responses are Polish; `languageCode` appears in `pageProps` but no
  language-override query parameter was tested. Job titles/descriptions in the results
  seen during investigation were a mix of Polish and English depending on the posting.

## Not yet confirmed / left as gaps

- No verified posting-age or salary-range URL filter parameter (client-side `--jobage`
  filtering is used instead).
- Employment type / work mode (`typesOfContract`, `workModes` - present at the *search*
  group level) were not found in the *detail* response's `attributes`, so `JobDetail`
  does not surface them. A future update could carry them over from the search result
  when available.
