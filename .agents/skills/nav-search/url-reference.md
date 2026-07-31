# NAV Arbeidsplassen (Norway) — URL & Data Reference

Investigated 2026-07-31. NAV (Norway's Public Employment Service) runs
"Arbeidsplassen" - a public job board backed by a directly-queryable Elasticsearch
API. No authentication required for search.

## Search — `GET /stillinger/api/search`

```
https://arbeidsplassen.nav.no/stillinger/api/search?q=<url-encoded keyword>&from=<offset>
```

Confirmed live: `q=IT governance` returned 71 total matches with directly relevant
titles ("Seniorrådgiver Data Governance" at Kartverket, "Information Security
Governance, Risk & Compliance" at Kongsberg Maritime).

- `q` — freetext query.
- `from` — pagination offset.
- **`size` is accepted but silently ignored** - confirmed live: `size=5` still
  returns 25 hits (`hits.hits.length === 25`) regardless of the value passed. Page
  size is a fixed 25; this CLI applies any `--limit` cap client-side after fetching.

**Response is raw Elasticsearch JSON** (`hits.total.value`, `hits.hits[]._source`).
Relevant `_source` fields:

```jsonc
{
  "title": "Seniorrådgiver Data Governance",
  "businessName": "STATENS KARTVERK OSLO",     // or fall back to employer.name
  "employer": { "name": "..." },
  "locationList": [ { "city": "OSLO", "municipal": "OSLO", "county": "OSLO" }, ... ],
  "published": "2026-07-21T00:00:00+02:00",
  "expires": "2026-08-17T00:00:00+02:00",
  "reference": "10304140",
  "uuid": "0be9cd3a-219a-455f-9c54-2fded012f84d"   // also present as the top-level `_id`
}
```

No full description is included in search results.

## Detail

**URL pattern:** `https://arbeidsplassen.nav.no/stillinger/stilling/<uuid>`

**This is the most fragile parsing approach of any portal skill in this repo** -
document this clearly for whoever maintains it next. The detail page has **no**
classic `__NEXT_DATA__` script tag or `application/ld+json` block (confirmed by
grepping a fetched page for both). Investigation via the browser tool (loading the
page, checking rendered content, then re-examining the raw HTML) found the actual
content arrives via Next.js App Router's **React Server Components streaming
format**: `<script>self.__next_f.push([1, "..."])</script>` calls, where each pushed
string is a JS-string-escaped fragment of a combined stream.

Once all pushed strings are unescaped (via `JSON.parse('"' + raw + '"')`, since they
are valid JS string-literal bodies) and concatenated in document order, the combined
stream contains React "Flight" wire-format chunks shaped:

```
<chunkId>:T<hexLength>,<content, exactly hexLength (hex-decoded) bytes long>
```

The job description and an "about the company" blurb both appear as such chunks,
each starting with an HTML tag (e.g. `<h2>Om stillingen</h2><p>...`). This CLI's
`extractHtmlTextChunks` finds every `T`-type chunk whose content starts with `<`,
strips HTML tags from each, and joins them - this happens to capture both the job
description and the company blurb together as one `description` field.

**Why this is fragile:** the Flight wire format is an internal Next.js
implementation detail, not a public contract - it could change shape in a future
Next.js version NAV's site upgrades to. If `detail` stops returning descriptions,
re-investigate with a fresh page fetch (check for `__next_f.push` still being
present, and re-verify the `<id>:T<hexLen>,` chunk shape) before assuming the site
itself changed.

**Known limitation:** `detail` reliably extracts `title` (from the `<title>` tag) and
`description`, but **not** company/location/date/deadline - those were not found in
an easily-parseable location within the Flight stream during investigation. Combine
a `search` result's card (which has company/location/date) with `detail`'s
description for the full picture.

## Access & fetching quirks

- **No Cloudflare or bot-detection** on either the search API or the detail webpage -
  Bun's native `fetch()` works fine, zero runtime dependencies.
- No authentication required.

## Not yet confirmed / left as gaps

- No posting-age, location, or category filter parameters were tested beyond `q` and
  `from` - the ES index likely supports more (aggregations were present in the raw
  response under `aggregations`, suggesting facet-based filtering exists).
- `detail`'s company/location/date/deadline fields are not populated - see the
  "Known limitation" above.
